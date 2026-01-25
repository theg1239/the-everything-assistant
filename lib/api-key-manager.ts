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

export interface ApiKeyUsageSnapshot {
  requests: number
  failures: number
  lastUsed: number | null
  lastFailed: number | null
  availableTokens: {
    minute: number
    hour: number
    day: number
  }
  isRateLimited: boolean
  isCurrent: boolean
}

export class ApiKeyManagerError extends Error {
  code: string
  constructor(code: string, message: string, cause?: unknown) {
    super(message)
    this.code = code
    this.name = 'ApiKeyManagerError'
    if (cause) {
      ;(this as { cause?: unknown }).cause = cause
    }
  }
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
  private initPromise: Promise<void>

  constructor(config: ApiKeyConfig) {
    this.config = config
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    this.initPromise = Promise.all([this.initializeBuckets(), this.loadCurrentKeyIndex()]).then(
      () => void 0
    )
  }

  private async initializeBuckets(): Promise<void> {
    if (this.config.keys.length === 0) return
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
    if (typeof key !== 'string' || !key) {
      throw new Error('ApiKeyManager: Tried to hash an undefined or non-string key')
    }
    return `key_${key.slice(-8)}_${key.length}`
  }

  private async isKeyRateLimited(keyHash: string): Promise<boolean> {
    const banKey = `rate_limit:${keyHash}`
    const limitedUntil = await this.redis.get(banKey)
    if (limitedUntil && Date.now() < parseInt(limitedUntil as string)) {
      return true
    }
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

  private collectErrorCandidates(error: any): any[] {
    const candidates: any[] = []
    if (error) candidates.push(error)
    if (error?.lastError) candidates.push(error.lastError)
    if (Array.isArray(error?.errors)) {
      candidates.push(...error.errors)
    }
    return candidates
  }

  private parseRetryAfterHeader(headers?: Record<string, string>): number | null {
    if (!headers) return null
    const value = headers['retry-after'] || headers['Retry-After']
    if (!value) return null
    const seconds = Number(value)
    if (!Number.isNaN(seconds)) {
      return Math.max(0, Math.ceil(seconds * 1000))
    }
    const parsedDate = Date.parse(value)
    if (!Number.isNaN(parsedDate)) {
      return Math.max(0, parsedDate - Date.now())
    }
    return null
  }

  private parseRetryDelayFromText(text?: string): number | null {
    if (!text || typeof text !== 'string') return null
    const retryDelayMatch = text.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i)
    if (retryDelayMatch?.[1]) {
      const seconds = Number(retryDelayMatch[1])
      if (!Number.isNaN(seconds)) {
        return Math.max(0, Math.ceil(seconds * 1000))
      }
    }
    const retryInMatch = text.match(/retry(?:\s+in)?\s+([\d.]+)s/i)
    if (retryInMatch?.[1]) {
      const seconds = Number(retryInMatch[1])
      if (!Number.isNaN(seconds)) {
        return Math.max(0, Math.ceil(seconds * 1000))
      }
    }
    return null
  }

  private getRateLimitCooldownMs(error: any): number | null {
    for (const candidate of this.collectErrorCandidates(error)) {
      const headerDelay = this.parseRetryAfterHeader(candidate?.responseHeaders as any)
      if (headerDelay !== null) return headerDelay
      const messageDelay = this.parseRetryDelayFromText(candidate?.message)
      if (messageDelay !== null) return messageDelay
      const bodyDelay = this.parseRetryDelayFromText(candidate?.responseBody)
      if (bodyDelay !== null) return bodyDelay
    }
    return null
  }

  private async markKeyRateLimited(keyHash: string, cooldownMs: number): Promise<void> {
    const cooldown = Math.max(1000, cooldownMs)
    const until = Date.now() + cooldown
    await this.redis.set(`rate_limit:${keyHash}`, until.toString(), {
      ex: Math.ceil(cooldown / 1000),
    })
    const status = this.keyStatuses.get(keyHash)
    if (status) {
      status.isRateLimited = true
      status.resetTime = until
    }
  }

  private async consumeTokens(keyHash: string): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise
    }
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

    const eventKey = `rate_limit_event:${keyHash}:${ts}`
    await this.redis.hset(eventKey, {
      timestamp: ts,
      error: JSON.stringify(error),
      keyHash,
    })
    await this.redis.expire(eventKey, 86400)
  }

  async getCurrentKey(): Promise<string> {
    if (this.initPromise) {
      await this.initPromise
    }
    if (!this.config.keys || this.config.keys.length === 0) {
      throw new Error('No API keys configured for ApiKeyManager')
    }
    let current = this.config.keys[this.currentKeyIndex]
    if (!current) {
      const next = await this.findNextAvailableKey()
      if (next) {
        this.currentKeyIndex = next.index
        await this.saveCurrentKeyIndex()
        return next.key
      }
      throw new Error('NO_VALID_API_KEYS_AVAILABLE')
    }
    if (!this.config.enableRotation) {
      return current
    }
    const now = Date.now()
    if (now - this.lastHealthCheck > this.config.keyHealthCheckInterval) {
      await this.performHealthCheck()
      this.lastHealthCheck = now
    }
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

  private getRandomKeyIndex(exclude: Set<number> = new Set()): number | null {
    const available = this.config.keys.map((_, idx) => idx).filter(idx => !exclude.has(idx))
    if (available.length === 0) return null
    const randIdx = Math.floor(Math.random() * available.length)
    return available[randIdx]
  }

  private async isKeyBanned(keyHash: string): Promise<boolean> {
    const banKey = `ban:${keyHash}`
    const bannedUntil = await this.redis.get(banKey)
    if (!bannedUntil) return false
    return Date.now() < parseInt(bannedUntil as string)
  }

  private async banKey(keyHash: string, cooldownMs: number = 5 * 60 * 1000): Promise<void> {
    const banKey = `ban:${keyHash}`
    const until = Date.now() + cooldownMs
    await this.redis.set(banKey, until.toString(), { ex: Math.ceil(cooldownMs / 1000) })
  }

  private async incrementFailure(
    keyHash: string,
    maxFails = 5,
    cooldownMs = 5 * 60 * 1000
  ): Promise<void> {
    const failKey = `failures:${keyHash}`
    const fails = (parseInt((await this.redis.get(failKey)) as string) || 0) + 1
    await this.redis.set(failKey, fails.toString(), { ex: 3600 })
    if (fails >= maxFails) {
      await this.banKey(keyHash, cooldownMs)
      await this.redis.set(failKey, '0', { ex: 3600 })
      console.warn(
        `[ApiKeyManager] Banned key ${keyHash} for ${cooldownMs / 1000}s due to repeated failures`
      )
    }
  }

  private async getHealthyKeyIndices(): Promise<number[]> {
    const healthy: number[] = []
    for (let idx = 0; idx < this.config.keys.length; idx++) {
      const key = this.config.keys[idx]
      const keyHash = this.hashKey(key)
      if (!(await this.isKeyRateLimited(keyHash)) && !(await this.isKeyBanned(keyHash))) {
        healthy.push(idx)
      }
    }
    return healthy
  }

  private async getRandomHealthyKeyIndex(exclude: Set<number> = new Set()): Promise<number | null> {
    const healthy = (await this.getHealthyKeyIndices()).filter(idx => !exclude.has(idx))
    if (healthy.length === 0) return null
    const randIdx = Math.floor(Math.random() * healthy.length)
    return healthy[randIdx]
  }

  private isServerError(error: any): boolean {
    const code = error?.statusCode || error?.code || error?.status
    const message = (error?.message || '').toLowerCase()
    return (
      (typeof code === 'number' && code >= 500 && code < 600) ||
      code === 'INTERNAL' ||
      message.includes('internal error')
    )
  }

  async executeWithRateLimit<T>(
    apiCall: (apiKey: string) => Promise<T>,
    options: { retryOnRateLimit?: boolean; maxRetries?: number } = {}
  ): Promise<T> {
    const { retryOnRateLimit = true, maxRetries = this.config.retryConfig.maxRetries } = options
    let attempt = 0
    let backoff = 1000
    let lastErr: any = null
    const tried = new Set<number>()
    const exhausted = new Set<number>()

    // Try every key at least once; if maxRetries is higher, allow another full round.
    const maxAttempts = Math.max(this.config.keys.length, maxRetries * this.config.keys.length)

    while (attempt < maxAttempts) {
      const exclude = new Set<number>([...tried, ...exhausted])
      const idx = await this.getRandomHealthyKeyIndex(exclude)
      if (idx === null) {
        // All keys exhausted for this round; start a fresh round if attempts remain.
        if (tried.size + exhausted.size >= this.config.keys.length && attempt < maxAttempts) {
          tried.clear()
          continue
        }
        break
      }
      tried.add(idx)
      const key = this.config.keys[idx]
      const hash = this.hashKey(key)
      const ok = await this.consumeTokens(hash)
      if (!ok) {
        attempt++
        continue
      }
      try {
        console.log(`[ApiKeyManager] Executing request with API key index ${idx}`)
        await this.recordKeyUsage(hash)
        return await apiCall(key)
      } catch (err: any) {
        lastErr = err
        console.error(`[ApiKeyManager] Error details for key index ${idx}:`, err?.message || err)
        if (process.env.API_KEY_MANAGER_DEBUG === 'true' && err?.stack) {
          console.error(`[ApiKeyManager] Stack for key index ${idx}:`, err.stack)
        }
        if (process.env.API_KEY_MANAGER_DEBUG === 'true' && err?.responseBody) {
          const bodyPreview = String(err.responseBody).slice(0, 1000)
          console.error(`[ApiKeyManager] Response body preview for key index ${idx}:`, bodyPreview)
        }
        if (err?.cause) {
          console.error(`[ApiKeyManager] Error cause:`, err.cause)
        }
        if (err?.status || err?.code) {
          console.error(`[ApiKeyManager] Error status/code:`, err?.status || err?.code)
        }
        if (this.isRateLimitError(err)) {
          console.log(`[ApiKeyManager] Rate limit error detected for key index ${idx}`)
          await this.recordRateLimitEvent(hash, err)
          await this.incrementFailure(hash)
          const cooldownMs = this.getRateLimitCooldownMs(err) ?? 60000
          await this.markKeyRateLimited(hash, cooldownMs)
          exhausted.add(idx)
        } else if (!this.isServerError(err)) {
          // Only count client-side / auth errors towards banning; server 5xx should be retried.
          console.log(`[ApiKeyManager] Client/auth error detected for key index ${idx}`)
          await this.incrementFailure(hash)
        } else {
          console.log(`[ApiKeyManager] Server error (5xx) detected for key index ${idx}, will retry`)
        }
        attempt++
        if (attempt >= maxAttempts) break
        console.warn(`[ApiKeyManager] Error with key index ${idx}, retrying with another key...`)
        await new Promise(r => setTimeout(r, backoff))
        backoff = Math.min(
          backoff * this.config.retryConfig.backoffMultiplier,
          this.config.retryConfig.maxBackoffMs
        )
        continue
      }
    }
    throw new ApiKeyManagerError(
      'ALL_KEYS_EXHAUSTED',
      `All API keys failed, are rate limited, or are temporarily banned. Last error: ${lastErr?.message || 'Unknown'}`,
      lastErr
    )
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

  async getKeyUsageStats(): Promise<Record<string, ApiKeyUsageSnapshot>> {
    const stats: Record<string, ApiKeyUsageSnapshot> = {}
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
    for (const keyHash of this.keyStatuses.keys()) {
      await this.redis.del(`rate_limit:${keyHash}`)
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
