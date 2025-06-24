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

  constructor(capacity: number, refillRate: number, redisClient: Redis, keyPrefix: string) {
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

    const deltaSeconds = (now - this.lastRefill) / 1000
    const toAdd = deltaSeconds * this.refillRate

    this.tokens = Math.min(this.capacity, this.tokens + toAdd)
    this.lastRefill = now

    if (this.tokens >= tokens) {
      this.tokens -= tokens
      await this.redis.hset(this.key, {
        tokens: this.tokens.toString(),
        lastRefill: this.lastRefill.toString(),
      })
      await this.redis.expire(this.key, 3600)
      return true
    }

    await this.redis.hset(this.key, {
      tokens: this.tokens.toString(),
      lastRefill: this.lastRefill.toString(),
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
      const deltaSeconds = (now - lastRefill) / 1000
      const toAdd = deltaSeconds * this.refillRate
      return Math.min(this.capacity, storedTokens + toAdd)
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
    // initialize asynchronously (you might await this in an init() in future)
    this.initializeBuckets()
    this.loadCurrentKeyIndex()
  }

  private async initializeBuckets(): Promise<void> {
    for (const key of this.config.keys) {
      const keyHash = this.hashKey(key)
      this.keyBuckets.set(
        `${keyHash}:minute`,
        new TokenBucket(
          this.config.rateLimit.requestsPerMinute,
          this.config.rateLimit.requestsPerMinute / 60,
          this.redis,
          `${keyHash}:minute`
        )
      )
      this.keyBuckets.set(
        `${keyHash}:hour`,
        new TokenBucket(
          this.config.rateLimit.requestsPerHour,
          this.config.rateLimit.requestsPerHour / 3600,
          this.redis,
          `${keyHash}:hour`
        )
      )
      this.keyBuckets.set(
        `${keyHash}:day`,
        new TokenBucket(
          this.config.rateLimit.requestsPerDay,
          this.config.rateLimit.requestsPerDay / 86400,
          this.redis,
          `${keyHash}:day`
        )
      )
      this.keyStatuses.set(keyHash, {
        isRateLimited: false,
        resetTime: 0,
        dailyUsage: 0,
        hourlyUsage: 0,
        minuteUsage: 0,
      })
    }
  }

  private async loadCurrentKeyIndex(): Promise<void> {
    try {
      const stored = await this.redis.get('api_key_manager:current_index')
      if (stored) this.currentKeyIndex = parseInt(stored as string)
    } catch (err) {
      console.warn('Failed to load current key index from Redis:', err)
    }
  }

  private async saveCurrentKeyIndex(): Promise<void> {
    try {
      await this.redis.set('api_key_manager:current_index', this.currentKeyIndex.toString())
    } catch (err) {
      console.warn('Failed to save current key index to Redis:', err)
    }
  }

  private hashKey(key: string): string {
    return `key_${key.slice(-8)}_${key.length}`
  }

  private async isKeyRateLimited(keyHash: string): Promise<boolean> {
    const m = this.keyBuckets.get(`${keyHash}:minute`)
    const h = this.keyBuckets.get(`${keyHash}:hour`)
    const d = this.keyBuckets.get(`${keyHash}:day`)
    if (!m || !h || !d) return false
    const [mt, ht, dt] = await Promise.all([
      m.getAvailableTokens(),
      h.getAvailableTokens(),
      d.getAvailableTokens(),
    ])
    return mt < 1 || ht < 1 || dt < 1
  }

  private async consumeTokens(keyHash: string): Promise<boolean> {
    const m = this.keyBuckets.get(`${keyHash}:minute`)
    const h = this.keyBuckets.get(`${keyHash}:hour`)
    const d = this.keyBuckets.get(`${keyHash}:day`)
    if (!m || !h || !d) return false
    const [ok1, ok2, ok3] = await Promise.all([m.consume(1), h.consume(1), d.consume(1)])
    return ok1 && ok2 && ok3
  }

  private async findNextAvailableKey(): Promise<{ key: string; index: number } | null> {
    const start = this.currentKeyIndex
    for (let i = 0; i < this.config.keys.length; i++) {
      const idx = (start + i) % this.config.keys.length
      const key = this.config.keys[idx]
      if (!(await this.isKeyRateLimited(this.hashKey(key)))) {
        return { key, index: idx }
      }
    }
    return null
  }

  // ——————————————————————————————————————————————
  // rewrite recordKeyUsage to store numeric timestamp and avoid 'Never' strings
  private async recordKeyUsage(keyHash: string): Promise<void> {
    const statsKey = `stats:${keyHash}`
    const now = Date.now()
    const raw = await this.redis.hgetall(statsKey)
    const stored = raw ?? {}
    const prevCount = parseInt(stored.requests as string) || 0
    await this.redis.hset(statsKey, {
      requests: prevCount + 1,
      lastUsed: now,
    })
    await this.redis.expire(statsKey, 86400 * 30)
  }

  private async recordRateLimitEvent(keyHash: string, error: any): Promise<void> {
    const statsKey = `stats:${keyHash}`
    const ts = Date.now()
    const raw = await this.redis.hgetall(statsKey)
    const stored = raw ?? {}
    const prevFails = parseInt(stored.failures as string) || 0
    await this.redis.hset(statsKey, {
      failures: prevFails + 1,
      lastFailed: ts,
    })
    await this.redis.expire(statsKey, 86400 * 30)

    // detailed event log (optional)
    const eventKey = `rate_limit_event:${keyHash}:${ts}`
    await this.redis.hset(eventKey, {
      timestamp: ts,
      error: JSON.stringify(error),
      keyHash,
    })
    await this.redis.expire(eventKey, 86400)
  }
  // ——————————————————————————————————————————————

  async getCurrentKey(): Promise<string> {
    if (!this.config.enableRotation) {
      return this.config.keys[0]
    }
    const now = Date.now()
    if (now - this.lastHealthCheck > this.config.keyHealthCheckInterval) {
      await this.performHealthCheck()
      this.lastHealthCheck = now
    }
    const current = this.config.keys[this.currentKeyIndex]
    if ((await this.isKeyRateLimited(this.hashKey(current))) && this.config.rotateOnRateLimit) {
      const next = await this.findNextAvailableKey()
      if (next) {
        this.currentKeyIndex = next.index
        await this.saveCurrentKeyIndex()
        console.log(`Rotated to API key index ${next.index} due to rate limiting`)
        return next.key
      }
      throw new Error('ALL_KEYS_RATE_LIMITED')
    }
    return current
  }

  async executeWithRateLimit<T>(
    apiCall: (apiKey: string) => Promise<T>,
    options: { retryOnRateLimit?: boolean; maxRetries?: number } = {}
  ): Promise<T> {
    const { retryOnRateLimit = true, maxRetries = this.config.retryConfig.maxRetries } = options
    let attempt = 0
    let backoff = 1000
    let lastErr: any = null

    while (attempt <= maxRetries) {
      try {
        const key = await this.getCurrentKey()
        const hash = this.hashKey(key)
        const ok = await this.consumeTokens(hash)

        if (!ok && attempt === 0 && this.config.rotateOnRateLimit) {
          const nxt = await this.findNextAvailableKey()
          if (nxt) {
            this.currentKeyIndex = nxt.index
            await this.saveCurrentKeyIndex()
            const nxtHash = this.hashKey(nxt.key)
            if (await this.consumeTokens(nxtHash)) {
              await this.recordKeyUsage(nxtHash)
              return apiCall(nxt.key)
            }
          }
          throw new Error('RATE_LIMIT_EXCEEDED')
        }

        if (ok) {
          await this.recordKeyUsage(hash)
          return apiCall(key)
        }
        throw new Error('RATE_LIMIT_EXCEEDED')
      } catch (err: any) {
        lastErr = err
        const isRateErr = this.isRateLimitError(err)
        if (isRateErr) {
          const cur = this.config.keys[this.currentKeyIndex]
          await this.recordRateLimitEvent(this.hashKey(cur), err)
          if (this.config.rotateOnRateLimit && retryOnRateLimit) {
            const nxt = await this.findNextAvailableKey()
            if (nxt) {
              this.currentKeyIndex = nxt.index
              await this.saveCurrentKeyIndex()
              console.log(`Rotated to API key index ${nxt.index} due to API rate limit`)
              backoff = 1000
              attempt++
              continue
            }
          }
        }
        if (!retryOnRateLimit || !isRateErr) throw err
        if (attempt >= maxRetries) break
        console.log(`Attempt ${attempt + 1} failed, retrying in ${backoff}ms...`)
        await new Promise(r => setTimeout(r, backoff))
        backoff = Math.min(
          backoff * this.config.retryConfig.backoffMultiplier,
          this.config.retryConfig.maxBackoffMs
        )
        attempt++
      }
    }
    throw new Error(`Max retries exceeded. Last error: ${lastErr?.message || 'Unknown'}`)
  }

  private isRateLimitError(error: any): boolean {
    const msg = (error?.message || '').toLowerCase()
    const code = error?.code || error?.status
    return (
      msg.includes('rate limit') ||
      msg.includes('quota exceeded') ||
      msg.includes('too many requests') ||
      code === 429 ||
      code === 'RATE_LIMIT_EXCEEDED'
    )
  }

  private async performHealthCheck(): Promise<void> {
    for (const [keyHash, status] of this.keyStatuses.entries()) {
      if (status.isRateLimited && Date.now() > status.resetTime) {
        status.isRateLimited = false
        status.resetTime = 0
        const buckets = [
          this.keyBuckets.get(`${keyHash}:minute`),
          this.keyBuckets.get(`${keyHash}:hour`),
          this.keyBuckets.get(`${keyHash}:day`),
        ]
        await Promise.all(buckets.map(b => b?.reset()))
      }
    }
  }

  async getKeyUsageStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {}
    for (const [idx, key] of this.config.keys.entries()) {
      const keyHash = this.hashKey(key)
      const raw = await this.redis.hgetall(`stats:${keyHash}`)
      const stored = raw ?? {}
      const requests = parseInt(stored.requests as string) || 0
      const failures = parseInt(stored.failures as string) || 0
      const lastUsed = stored.lastUsed ? parseInt(stored.lastUsed as string) : null
      const lastFailed = stored.lastFailed ? parseInt(stored.lastFailed as string) : null

      const [mt, ht, dt] = await Promise.all([
        this.keyBuckets.get(`${keyHash}:minute`)!.getAvailableTokens(),
        this.keyBuckets.get(`${keyHash}:hour`)!.getAvailableTokens(),
        this.keyBuckets.get(`${keyHash}:day`)!.getAvailableTokens(),
      ])
      const isRateLimited = await this.isKeyRateLimited(keyHash)
      const isCurrent = idx === this.currentKeyIndex

      stats[`key_${idx}`] = {
        requests,
        failures,
        lastUsed,
        lastFailed,
        availableTokens: {
          minute: Math.floor(mt),
          hour: Math.floor(ht),
          day: Math.floor(dt),
        },
        isRateLimited,
        isCurrent,
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
    requestsPerDay: 50000,
  },
  retryConfig: {
    maxRetries: 3,
    backoffMultiplier: 2,
    maxBackoffMs: 30000,
  },
  enableRotation: true,
  rotateOnRateLimit: true,
  keyHealthCheckInterval: 30000,
}
