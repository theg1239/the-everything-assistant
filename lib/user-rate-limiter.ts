import { Redis } from '@upstash/redis'

export interface UserRateLimitConfig {
  requestsPerMinute: number
  requestsPerHour: number
  requestsPerDay: number
  enabled: boolean
}

export const DEFAULT_USER_RATE_LIMITS: UserRateLimitConfig = {
  requestsPerMinute: 10,
  requestsPerHour: 100,
  requestsPerDay: 1000,
  enabled: true
}

export class UserTokenBucket {
  private capacity: number
  private refillRate: number
  private redis: Redis
  private key: string

  constructor(
    capacity: number,
    refillRate: number,
    redisClient: Redis,
    userId: string,
    timeWindow: string
  ) {
    this.capacity = capacity
    this.refillRate = refillRate
    this.redis = redisClient
    this.key = `user_rate_limit:${userId}:${timeWindow}`
  }

  async consume(tokens: number = 1): Promise<{ allowed: boolean; remainingTokens: number; resetTime: number }> {
    const now = Date.now()
    
    const state = await this.redis.hgetall(this.key)
    
    let currentTokens = this.capacity
    let lastRefill = now
    
    if (state && Object.keys(state).length > 0) {
      currentTokens = parseFloat(state.tokens as string) || this.capacity
      lastRefill = parseInt(state.lastRefill as string) || now
    }
    
    const timePassed = (now - lastRefill) / 1000
    const tokensToAdd = Math.min(timePassed * this.refillRate, this.capacity - currentTokens)
    currentTokens = Math.min(currentTokens + tokensToAdd, this.capacity)
    
    const allowed = currentTokens >= tokens
    
    if (allowed) {
      currentTokens -= tokens
    }
    
    const resetTime = now + ((this.capacity - currentTokens) / this.refillRate) * 1000
    
    const expirationSeconds = Math.ceil((this.capacity / this.refillRate) * 2)
    await this.redis.hset(this.key, {
      tokens: currentTokens.toString(),
      lastRefill: now.toString()
    })
    await this.redis.expire(this.key, expirationSeconds)
    
    return {
      allowed,
      remainingTokens: Math.floor(currentTokens),
      resetTime: Math.floor(resetTime)
    }
  }

  async getRemainingTokens(): Promise<number> {
    const now = Date.now()
    const state = await this.redis.hgetall(this.key)
    
    if (!state || Object.keys(state).length === 0) {
      return this.capacity
    }
    
    const currentTokens = parseFloat(state.tokens as string) || this.capacity
    const lastRefill = parseInt(state.lastRefill as string) || now
    
    const timePassed = (now - lastRefill) / 1000
    const tokensToAdd = Math.min(timePassed * this.refillRate, this.capacity - currentTokens)
    
    return Math.floor(Math.min(currentTokens + tokensToAdd, this.capacity))
  }

  async reset(): Promise<void> {
    await this.redis.del(this.key)
  }
}

export class UserRateLimiter {
  private redis: Redis
  private config: UserRateLimitConfig

  constructor(config: UserRateLimitConfig) {
    this.config = config
    
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Redis configuration required for user rate limiting')
    }
    
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }

  async checkRateLimit(userId: string): Promise<{
    allowed: boolean
    error?: string
    limits: {
      minute: { remaining: number; resetTime: number }
      hour: { remaining: number; resetTime: number }
      day: { remaining: number; resetTime: number }
    }
  }> {
    if (!this.config.enabled) {
      return {
        allowed: true,
        limits: {
          minute: { remaining: this.config.requestsPerMinute, resetTime: 0 },
          hour: { remaining: this.config.requestsPerHour, resetTime: 0 },
          day: { remaining: this.config.requestsPerDay, resetTime: 0 }
        }
      }
    }

    const minuteBucket = new UserTokenBucket(
      this.config.requestsPerMinute,
      this.config.requestsPerMinute / 60,
      this.redis,
      userId,
      'minute'
    )

    const hourBucket = new UserTokenBucket(
      this.config.requestsPerHour,
      this.config.requestsPerHour / 3600,
      this.redis,
      userId,
      'hour'
    )

    const dayBucket = new UserTokenBucket(
      this.config.requestsPerDay,
      this.config.requestsPerDay / 86400,
      this.redis,
      userId,
      'day'
    )

    const [minuteResult, hourResult, dayResult] = await Promise.all([
      minuteBucket.consume(1),
      hourBucket.consume(1),
      dayBucket.consume(1)
    ])

    if (!minuteResult.allowed) {
      return {
        allowed: false,
        error: `Rate limit exceeded: ${this.config.requestsPerMinute} requests per minute`,
        limits: {
          minute: { remaining: minuteResult.remainingTokens, resetTime: minuteResult.resetTime },
          hour: { remaining: await hourBucket.getRemainingTokens(), resetTime: 0 },
          day: { remaining: await dayBucket.getRemainingTokens(), resetTime: 0 }
        }
      }
    }

    if (!hourResult.allowed) {
      return {
        allowed: false,
        error: `Rate limit exceeded: ${this.config.requestsPerHour} requests per hour`,
        limits: {
          minute: { remaining: await minuteBucket.getRemainingTokens(), resetTime: 0 },
          hour: { remaining: hourResult.remainingTokens, resetTime: hourResult.resetTime },
          day: { remaining: await dayBucket.getRemainingTokens(), resetTime: 0 }
        }
      }
    }

    if (!dayResult.allowed) {
      return {
        allowed: false,
        error: `Rate limit exceeded: ${this.config.requestsPerDay} requests per day`,
        limits: {
          minute: { remaining: await minuteBucket.getRemainingTokens(), resetTime: 0 },
          hour: { remaining: await hourBucket.getRemainingTokens(), resetTime: 0 },
          day: { remaining: dayResult.remainingTokens, resetTime: dayResult.resetTime }
        }
      }
    }

    return {
      allowed: true,
      limits: {
        minute: { remaining: minuteResult.remainingTokens, resetTime: minuteResult.resetTime },
        hour: { remaining: hourResult.remainingTokens, resetTime: hourResult.resetTime },
        day: { remaining: dayResult.remainingTokens, resetTime: dayResult.resetTime }
      }
    }
  }

  async getUserUsageStats(userId: string): Promise<{
    minute: { remaining: number; limit: number }
    hour: { remaining: number; limit: number }
    day: { remaining: number; limit: number }
  }> {
    const minuteBucket = new UserTokenBucket(
      this.config.requestsPerMinute,
      this.config.requestsPerMinute / 60,
      this.redis,
      userId,
      'minute'
    )

    const hourBucket = new UserTokenBucket(
      this.config.requestsPerHour,
      this.config.requestsPerHour / 3600,
      this.redis,
      userId,
      'hour'
    )

    const dayBucket = new UserTokenBucket(
      this.config.requestsPerDay,
      this.config.requestsPerDay / 86400,
      this.redis,
      userId,
      'day'
    )

    const [minuteRemaining, hourRemaining, dayRemaining] = await Promise.all([
      minuteBucket.getRemainingTokens(),
      hourBucket.getRemainingTokens(),
      dayBucket.getRemainingTokens()
    ])

    return {
      minute: { remaining: minuteRemaining, limit: this.config.requestsPerMinute },
      hour: { remaining: hourRemaining, limit: this.config.requestsPerHour },
      day: { remaining: dayRemaining, limit: this.config.requestsPerDay }
    }
  }

  async resetUserLimits(userId: string): Promise<void> {
    const buckets = ['minute', 'hour', 'day']
    await Promise.all(
      buckets.map(timeWindow => 
        this.redis.del(`user_rate_limit:${userId}:${timeWindow}`)
      )
    )
  }

  getConfig(): UserRateLimitConfig {
    return { ...this.config }
  }

  updateConfig(newConfig: Partial<UserRateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }
}

export function loadUserRateLimitConfig(): UserRateLimitConfig {
  return {
    requestsPerMinute: parseInt(process.env.USER_RATE_LIMIT_REQUESTS_PER_MINUTE || '10'),
    requestsPerHour: parseInt(process.env.USER_RATE_LIMIT_REQUESTS_PER_HOUR || '100'),
    requestsPerDay: parseInt(process.env.USER_RATE_LIMIT_REQUESTS_PER_DAY || '1000'),
    enabled: process.env.USER_RATE_LIMITING_ENABLED !== 'false'
  }
}
