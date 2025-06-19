import { Redis } from '@upstash/redis'

export interface ApiKeyConfig {
  keys: string[]
  rateLimit: {
    requestsPerMinute: number
    requestsPerHour: number
    requestsPerDay: number
  }
  retryConfig: {
    maxRetries: number
    backoffMultiplier: number
    maxBackoffMs: number
  }
  enableRotation: boolean
  rotateOnRateLimit: boolean
  keyHealthCheckInterval: number
}

export class TokenBucket {
  private capacity: number
  private tokens: number
  private refillRate: number
  private lastRefill: number
  private redis: Redis
  private key: string

  constructor(
    capacity: number,
    refillRate: number,
    redisClient: Redis,
    keyPrefix: string
  ) {
    this.capacity = capacity
    this.tokens = capacity
    this.refillRate = refillRate
    this.lastRefill = Date.now()
    this.redis = redisClient
    this.key = `token_bucket:${keyPrefix}`
  }

  async consume(tokens: number = 1): Promise<boolean> {
    const now = Date.now()
    
    const state = await this.redis.hgetall(this.key)
    
    if (state && Object.keys(state).length > 0) {
      this.tokens = parseInt(state.tokens as string) || this.capacity
      this.lastRefill = parseInt(state.lastRefill as string) || now
    }

    const timeSinceLastRefill = (now - this.lastRefill) / 1000
    const tokensToAdd = timeSinceLastRefill * this.refillRate
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd)
    this.lastRefill = now

    if (this.tokens >= tokens) {
      this.tokens -= tokens
      
      await this.redis.hset(this.key, {
        tokens: this.tokens.toString(),
        lastRefill: this.lastRefill.toString()
      })
      
      await this.redis.expire(this.key, 3600)
      
      return true
    }

    await this.redis.hset(this.key, {
      tokens: this.tokens.toString(),
      lastRefill: this.lastRefill.toString()
    })
    await this.redis.expire(this.key, 3600)

    return false
  }

  async getAvailableTokens(): Promise<number> {
    const now = Date.now()
    const state = await this.redis.hgetall(this.key)
    
    if (state && Object.keys(state).length > 0) {
      const storedTokens = parseInt(state.tokens as string) || this.capacity
      const lastRefill = parseInt(state.lastRefill as string) || now
      
      const timeSinceLastRefill = (now - lastRefill) / 1000
      const tokensToAdd = timeSinceLastRefill * this.refillRate
      
      return Math.min(this.capacity, storedTokens + tokensToAdd)
    }

    return this.capacity
  }

  async reset(): Promise<void> {
    await this.redis.del(this.key)
  }
}

interface RateLimitStatus {
  isRateLimited: boolean
  resetTime: number
  dailyUsage: number
  hourlyUsage: number
  minuteUsage: number
}

export class ApiKeyManager {
  private config: ApiKeyConfig
  private redis: Redis
  private currentKeyIndex: number = 0
  private keyBuckets: Map<string, TokenBucket> = new Map()
  private keyStatuses: Map<string, RateLimitStatus> = new Map()
  private lastHealthCheck: number = 0

  constructor(config: ApiKeyConfig) {
    this.config = config
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })

    this.initializeBuckets()
    
    this.loadCurrentKeyIndex()
  }

  private async initializeBuckets(): Promise<void> {
    for (const [index, key] of this.config.keys.entries()) {
      const keyHash = this.hashKey(key)
      
      const minuteBucket = new TokenBucket(
        this.config.rateLimit.requestsPerMinute,
        this.config.rateLimit.requestsPerMinute / 60,
        this.redis,
        `${keyHash}:minute`
      )
      
      const hourBucket = new TokenBucket(
        this.config.rateLimit.requestsPerHour,
        this.config.rateLimit.requestsPerHour / 3600,
        this.redis,
        `${keyHash}:hour`
      )
      
      const dayBucket = new TokenBucket(
        this.config.rateLimit.requestsPerDay,
        this.config.rateLimit.requestsPerDay / 86400,
        this.redis,
        `${keyHash}:day`
      )

      this.keyBuckets.set(`${keyHash}:minute`, minuteBucket)
      this.keyBuckets.set(`${keyHash}:hour`, hourBucket)
      this.keyBuckets.set(`${keyHash}:day`, dayBucket)

      this.keyStatuses.set(keyHash, {
        isRateLimited: false,
        resetTime: 0,
        dailyUsage: 0,
        hourlyUsage: 0,
        minuteUsage: 0
      })
    }
  }

  private async loadCurrentKeyIndex(): Promise<void> {
    try {
      const stored = await this.redis.get('api_key_manager:current_index')
      if (stored) {
        this.currentKeyIndex = parseInt(stored as string)
      }
    } catch (error) {
      console.warn('Failed to load current key index from Redis:', error)
    }
  }

  private async saveCurrentKeyIndex(): Promise<void> {
    try {
      await this.redis.set('api_key_manager:current_index', this.currentKeyIndex.toString())
    } catch (error) {
      console.warn('Failed to save current key index to Redis:', error)
    }
  }

  private hashKey(key: string): string {
    return `key_${key.slice(-8)}_${key.length}`
  }

  private async isKeyRateLimited(keyHash: string): Promise<boolean> {
    const minuteBucket = this.keyBuckets.get(`${keyHash}:minute`)
    const hourBucket = this.keyBuckets.get(`${keyHash}:hour`)
    const dayBucket = this.keyBuckets.get(`${keyHash}:day`)

    if (!minuteBucket || !hourBucket || !dayBucket) {
      return false
    }

    const [minuteTokens, hourTokens, dayTokens] = await Promise.all([
      minuteBucket.getAvailableTokens(),
      hourBucket.getAvailableTokens(),
      dayBucket.getAvailableTokens()
    ])

    return minuteTokens < 1 || hourTokens < 1 || dayTokens < 1
  }

  private async consumeTokens(keyHash: string): Promise<boolean> {
    const minuteBucket = this.keyBuckets.get(`${keyHash}:minute`)
    const hourBucket = this.keyBuckets.get(`${keyHash}:hour`)
    const dayBucket = this.keyBuckets.get(`${keyHash}:day`)

    if (!minuteBucket || !hourBucket || !dayBucket) {
      return false
    }

    const [minuteOk, hourOk, dayOk] = await Promise.all([
      minuteBucket.consume(1),
      hourBucket.consume(1),
      dayBucket.consume(1)
    ])

    return minuteOk && hourOk && dayOk
  }

  private async findNextAvailableKey(): Promise<{ key: string; index: number } | null> {
    const startIndex = this.currentKeyIndex
    let attempts = 0

    while (attempts < this.config.keys.length) {
      const keyIndex = (startIndex + attempts) % this.config.keys.length
      const key = this.config.keys[keyIndex]
      const keyHash = this.hashKey(key)

      const isRateLimited = await this.isKeyRateLimited(keyHash)
      
      if (!isRateLimited) {
        return { key, index: keyIndex }
      }

      attempts++
    }

    return null
  }

  private async recordKeyUsage(keyHash: string): Promise<void> {
    const usageKey = `usage:${keyHash}:${new Date().toISOString().split('T')[0]}`
    await this.redis.incr(usageKey)
    await this.redis.expire(usageKey, 86400 * 7)
  }

  private async recordRateLimitEvent(keyHash: string, error: any): Promise<void> {
    const eventKey = `rate_limit_event:${keyHash}:${Date.now()}`
    await this.redis.hset(eventKey, {
      timestamp: Date.now().toString(),
      error: JSON.stringify(error),
      keyHash
    })
    await this.redis.expire(eventKey, 86400)
  }

  async getCurrentKey(): Promise<string> {
    if (!this.config.enableRotation) {
      return this.config.keys[0]
    }

    const now = Date.now()
    if (now - this.lastHealthCheck > this.config.keyHealthCheckInterval) {
      await this.performHealthCheck()
      this.lastHealthCheck = now
    }

    const currentKey = this.config.keys[this.currentKeyIndex]
    const keyHash = this.hashKey(currentKey)

    const isRateLimited = await this.isKeyRateLimited(keyHash)
    
    if (isRateLimited && this.config.rotateOnRateLimit) {
      const nextKey = await this.findNextAvailableKey()
      
      if (nextKey) {
        this.currentKeyIndex = nextKey.index
        await this.saveCurrentKeyIndex()
        console.log(`Rotated to API key index ${nextKey.index} due to rate limiting`)
        return nextKey.key
      } else {
        throw new Error('ALL_KEYS_RATE_LIMITED')
      }
    }

    return currentKey
  }

  async executeWithRateLimit<T>(
    apiCall: (apiKey: string) => Promise<T>,
    options: { retryOnRateLimit?: boolean; maxRetries?: number } = {}
  ): Promise<T> {
    const { 
      retryOnRateLimit = true, 
      maxRetries = this.config.retryConfig.maxRetries 
    } = options

    let lastError: any
    let attempt = 0
    let backoffMs = 1000

    while (attempt <= maxRetries) {
      try {
        const apiKey = await this.getCurrentKey()
        const keyHash = this.hashKey(apiKey)

        const canProceed = await this.consumeTokens(keyHash)
        
        if (!canProceed && attempt === 0) {
          if (this.config.rotateOnRateLimit) {
            const nextKey = await this.findNextAvailableKey()
            if (nextKey) {
              this.currentKeyIndex = nextKey.index
              await this.saveCurrentKeyIndex()
              const nextKeyHash = this.hashKey(nextKey.key)
              const canProceedWithNewKey = await this.consumeTokens(nextKeyHash)
              
              if (canProceedWithNewKey) {
                await this.recordKeyUsage(nextKeyHash)
                return await apiCall(nextKey.key)
              }
            }
          }
          
          throw new Error('RATE_LIMIT_EXCEEDED')
        }

        if (canProceed) {
          await this.recordKeyUsage(keyHash)
          return await apiCall(apiKey)
        }

        throw new Error('RATE_LIMIT_EXCEEDED')

      } catch (error: any) {
        lastError = error
        
        const isRateLimitError = this.isRateLimitError(error)
        
        if (isRateLimitError) {
          const currentKey = this.config.keys[this.currentKeyIndex]
          const keyHash = this.hashKey(currentKey)
          
          await this.recordRateLimitEvent(keyHash, error)
          
          if (this.config.rotateOnRateLimit && retryOnRateLimit) {
            const nextKey = await this.findNextAvailableKey()
            
            if (nextKey) {
              this.currentKeyIndex = nextKey.index
              await this.saveCurrentKeyIndex()
              console.log(`Rotated to API key index ${nextKey.index} due to API rate limit`)
              
              backoffMs = 1000
              attempt++
              continue
            }
          }
        }

        if (!retryOnRateLimit || !isRateLimitError) {
          throw error
        }

        if (attempt >= maxRetries) {
          break
        }

        console.log(`Attempt ${attempt + 1} failed, retrying in ${backoffMs}ms...`)
        await this.sleep(backoffMs)
        backoffMs = Math.min(
          backoffMs * this.config.retryConfig.backoffMultiplier,
          this.config.retryConfig.maxBackoffMs
        )
        attempt++
      }
    }

    throw new Error(`Max retries exceeded. Last error: ${lastError?.message || 'Unknown error'}`)
  }

  private isRateLimitError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || ''
    const errorCode = error?.code || error?.status
    
    return (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('quota exceeded') ||
      errorMessage.includes('too many requests') ||
      errorCode === 429 ||
      errorCode === 'RATE_LIMIT_EXCEEDED'
    )
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private async performHealthCheck(): Promise<void> {
    for (const [keyHash, status] of this.keyStatuses.entries()) {
      if (status.isRateLimited && Date.now() > status.resetTime) {
        status.isRateLimited = false
        status.resetTime = 0
        
        const minuteBucket = this.keyBuckets.get(`${keyHash}:minute`)
        const hourBucket = this.keyBuckets.get(`${keyHash}:hour`)
        const dayBucket = this.keyBuckets.get(`${keyHash}:day`)
        
        await Promise.all([
          minuteBucket?.reset(),
          hourBucket?.reset(),
          dayBucket?.reset()
        ])
      }
    }
  }

  async getKeyUsageStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {}
    
    for (const [index, key] of this.config.keys.entries()) {
      const keyHash = this.hashKey(key)
      const minuteBucket = this.keyBuckets.get(`${keyHash}:minute`)
      const hourBucket = this.keyBuckets.get(`${keyHash}:hour`)
      const dayBucket = this.keyBuckets.get(`${keyHash}:day`)
      
      if (minuteBucket && hourBucket && dayBucket) {
        const [minuteTokens, hourTokens, dayTokens] = await Promise.all([
          minuteBucket.getAvailableTokens(),
          hourBucket.getAvailableTokens(),
          dayBucket.getAvailableTokens()
        ])
        
        stats[`key_${index}`] = {
          availableTokens: {
            minute: Math.floor(minuteTokens),
            hour: Math.floor(hourTokens),
            day: Math.floor(dayTokens)
          },
          isRateLimited: await this.isKeyRateLimited(keyHash),
          isCurrent: index === this.currentKeyIndex
        }
      }
    }
    
    return stats
  }

  async rotateToNextKey(): Promise<void> {
    if (!this.config.enableRotation) {
      throw new Error('Key rotation is disabled')
    }
    
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.config.keys.length
    await this.saveCurrentKeyIndex()
    console.log(`Manually rotated to API key index ${this.currentKeyIndex}`)
  }

  async resetAllRateLimits(): Promise<void> {
    for (const bucket of this.keyBuckets.values()) {
      await bucket.reset()
    }
    
    for (const status of this.keyStatuses.values()) {
      status.isRateLimited = false
      status.resetTime = 0
      status.dailyUsage = 0
      status.hourlyUsage = 0
      status.minuteUsage = 0
    }
    
    console.log('All rate limits have been reset')
  }
}

export const DEFAULT_API_KEY_CONFIG: ApiKeyConfig = {
  keys: [],
  rateLimit: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 50000
  },
  retryConfig: {
    maxRetries: 3,
    backoffMultiplier: 2,
    maxBackoffMs: 30000
  },
  enableRotation: true,
  rotateOnRateLimit: true,
  keyHealthCheckInterval: 30000
}
