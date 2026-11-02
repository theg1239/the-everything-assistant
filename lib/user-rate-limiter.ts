import type { Redis } from '@upstash/redis'
import * as z from 'zod'
import { getRedis } from './redis'

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
  enabled: true,
}

type BucketWindow = 'minute' | 'hour' | 'day'

const WINDOW_SECONDS: Record<BucketWindow, number> = { minute: 60, hour: 3600, day: 86400 }

const bucketKey = (userId: string, timeWindow: string) => `user_rate_limit:${userId}:${timeWindow}`

/**
 * Token-bucket consume for any number of buckets in ONE atomic round-trip.
 *
 * KEYS[i]           bucket hash (`tokens`, `lastRefill` fields, same layout as before)
 * ARGV[1]           now (ms, caller clock — same as the previous implementation)
 * ARGV[2]           tokens to consume
 * ARGV[3 + 2(i-1)]  capacity of bucket i
 * ARGV[4 + 2(i-1)]  refill rate of bucket i (tokens / second)
 *
 * Each bucket refills, then consumes independently (a denied bucket does not stop the
 * others from consuming), exactly like the previous per-bucket hgetall/hset/expire calls.
 * Returns `{allowed(0|1), floor(remaining), floor(resetTimeMs)}` per bucket.
 */
const CONSUME_SCRIPT = `
local now = tonumber(ARGV[1])
local requested = tonumber(ARGV[2])
local out = {}
for i, key in ipairs(KEYS) do
  local capacity = tonumber(ARGV[1 + i * 2])
  local rate = tonumber(ARGV[2 + i * 2])
  local state = redis.call('HMGET', key, 'tokens', 'lastRefill')
  local tokens = tonumber(state[1])
  local last = tonumber(state[2])
  if tokens == nil then tokens = capacity end
  if last == nil then last = now end
  local elapsed = (now - last) / 1000
  if elapsed < 0 then elapsed = 0 end
  tokens = math.min(tokens + math.min(elapsed * rate, capacity - tokens), capacity)
  local allowed = 0
  if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
  end
  local resetTime = now + ((capacity - tokens) / rate) * 1000
  redis.call('HSET', key, 'tokens', string.format('%.17g', tokens), 'lastRefill', string.format('%.0f', math.max(now, last)))
  redis.call('EXPIRE', key, math.ceil((capacity / rate) * 2))
  out[i] = { allowed, math.floor(tokens), math.floor(resetTime) }
end
return out
`

type BucketSpec = { key: string; capacity: number; refillRate: number }
type BucketResult = { allowed: boolean; remainingTokens: number; resetTime: number }

const scriptResultSchema = z.array(
  z.tuple([z.coerce.number(), z.coerce.number(), z.coerce.number()])
)

async function consumeBuckets(
  redis: Redis,
  buckets: BucketSpec[],
  tokens: number
): Promise<BucketResult[]> {
  const args = [String(Date.now()), String(tokens)]
  for (const bucket of buckets) args.push(String(bucket.capacity), String(bucket.refillRate))
  const raw: unknown = await getConsumeScript(redis).exec(
    buckets.map(bucket => bucket.key),
    args
  )
  return scriptResultSchema.parse(raw).map(([allowed, remainingTokens, resetTime]) => ({
    allowed: allowed === 1,
    remainingTokens,
    resetTime,
  }))
}

const consumeScripts = new WeakMap<Redis, ReturnType<Redis['createScript']>>()
/** EVALSHA with automatic EVAL fallback; the script body is only sent once per Redis instance. */
function getConsumeScript(redis: Redis) {
  let script = consumeScripts.get(redis)
  if (!script) {
    script = redis.createScript(CONSUME_SCRIPT)
    consumeScripts.set(redis, script)
  }
  return script
}

/** Reads a bucket's refilled token count without consuming (no write). */
function remainingFromState(
  state: Record<string, unknown> | null,
  capacity: number,
  refillRate: number,
  now: number
): number {
  if (!state || Object.keys(state).length === 0) return capacity
  const storedTokens = Number.parseFloat(String(state.tokens))
  const storedRefill = Number.parseInt(String(state.lastRefill), 10)
  const currentTokens = Number.isFinite(storedTokens) ? storedTokens : capacity
  const lastRefill = Number.isFinite(storedRefill) ? storedRefill : now
  const timePassed = Math.max(0, (now - lastRefill) / 1000)
  const tokensToAdd = Math.min(timePassed * refillRate, capacity - currentTokens)
  return Math.floor(Math.min(currentTokens + tokensToAdd, capacity))
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
    this.key = bucketKey(userId, timeWindow)
  }

  async consume(
    tokens: number = 1
  ): Promise<{ allowed: boolean; remainingTokens: number; resetTime: number }> {
    const [result] = await consumeBuckets(
      this.redis,
      [{ key: this.key, capacity: this.capacity, refillRate: this.refillRate }],
      tokens
    )
    if (!result) throw new Error('Rate limit script returned no result')
    return result
  }

  async getRemainingTokens(): Promise<number> {
    const state = await this.redis.hgetall(this.key)
    return remainingFromState(state, this.capacity, this.refillRate, Date.now())
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

    const redis = getRedis()
    if (!redis) {
      throw new Error('Redis configuration required for user rate limiting')
    }

    this.redis = redis
  }

  private bucketSpecs(userId: string): Record<BucketWindow, BucketSpec> {
    const spec = (window: BucketWindow, capacity: number): BucketSpec => ({
      key: bucketKey(userId, window),
      capacity,
      refillRate: capacity / WINDOW_SECONDS[window],
    })
    return {
      minute: spec('minute', this.config.requestsPerMinute),
      hour: spec('hour', this.config.requestsPerHour),
      day: spec('day', this.config.requestsPerDay),
    }
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
          day: { remaining: this.config.requestsPerDay, resetTime: 0 },
        },
      }
    }

    const specs = this.bucketSpecs(userId)
    // One EVALSHA for all three windows (previously 9 sequential-per-bucket REST calls).
    const [minuteResult, hourResult, dayResult] = await consumeBuckets(
      this.redis,
      [specs.minute, specs.hour, specs.day],
      1
    )
    if (!minuteResult || !hourResult || !dayResult) {
      throw new Error('Rate limit script returned an incomplete result')
    }

    // Non-failing windows report their post-consume balance with `resetTime: 0`,
    // matching the previous getRemainingTokens() follow-up reads.
    const remainingOnly = (result: BucketResult) => ({
      remaining: result.remainingTokens,
      resetTime: 0,
    })
    const full = (result: BucketResult) => ({
      remaining: result.remainingTokens,
      resetTime: result.resetTime,
    })

    if (!minuteResult.allowed) {
      return {
        allowed: false,
        error: `Rate limit exceeded: ${this.config.requestsPerMinute} requests per minute`,
        limits: {
          minute: full(minuteResult),
          hour: remainingOnly(hourResult),
          day: remainingOnly(dayResult),
        },
      }
    }

    if (!hourResult.allowed) {
      return {
        allowed: false,
        error: `Rate limit exceeded: ${this.config.requestsPerHour} requests per hour`,
        limits: {
          minute: remainingOnly(minuteResult),
          hour: full(hourResult),
          day: remainingOnly(dayResult),
        },
      }
    }

    if (!dayResult.allowed) {
      return {
        allowed: false,
        error: `Rate limit exceeded: ${this.config.requestsPerDay} requests per day`,
        limits: {
          minute: remainingOnly(minuteResult),
          hour: remainingOnly(hourResult),
          day: full(dayResult),
        },
      }
    }

    return {
      allowed: true,
      limits: {
        minute: full(minuteResult),
        hour: full(hourResult),
        day: full(dayResult),
      },
    }
  }

  async getUserUsageStats(userId: string): Promise<{
    minute: { remaining: number; limit: number }
    hour: { remaining: number; limit: number }
    day: { remaining: number; limit: number }
  }> {
    const specs = this.bucketSpecs(userId)
    const pipeline = this.redis.pipeline()
    pipeline.hgetall(specs.minute.key)
    pipeline.hgetall(specs.hour.key)
    pipeline.hgetall(specs.day.key)
    const states: unknown[] = await pipeline.exec()
    const now = Date.now()
    const remaining = (index: number, spec: BucketSpec) => {
      const state = states[index]
      return remainingFromState(
        typeof state === 'object' && state !== null ? { ...state } : null,
        spec.capacity,
        spec.refillRate,
        now
      )
    }

    return {
      minute: { remaining: remaining(0, specs.minute), limit: this.config.requestsPerMinute },
      hour: { remaining: remaining(1, specs.hour), limit: this.config.requestsPerHour },
      day: { remaining: remaining(2, specs.day), limit: this.config.requestsPerDay },
    }
  }

  async resetUserLimits(userId: string): Promise<void> {
    const specs = this.bucketSpecs(userId)
    await this.redis.del(specs.minute.key, specs.hour.key, specs.day.key)
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
    enabled: process.env.USER_RATE_LIMITING_ENABLED !== 'false',
  }
}

let sharedLimiter: UserRateLimiter | null = null

/** Process-wide per-user limiter, configured from `USER_RATE_LIMIT_*` env vars. */
export function getUserRateLimiter(): UserRateLimiter {
  sharedLimiter ??= new UserRateLimiter(loadUserRateLimitConfig())
  return sharedLimiter
}

export class UserRateLimitError extends Error {
  /**
   * @param resetTime Epoch ms when the exhausted window refills (sent to clients as `resetTime`).
   */
  constructor(
    reason: string | undefined,
    readonly resetTime?: number
  ) {
    super(`Rate limit: ${reason ?? 'too many requests'}`)
    this.name = 'UserRateLimitError'
  }
}

/** Throws `UserRateLimitError` when `userId` is over quota. No-op when disabled or anonymous. */
export async function enforceUserRateLimit(userId: string | null | undefined): Promise<void> {
  // Check the env config before constructing the limiter: it requires Redis,
  // and deployments with limiting disabled shouldn't need Redis at all.
  if (!userId || !(sharedLimiter?.getConfig() ?? loadUserRateLimitConfig()).enabled) return
  const result = await getUserRateLimiter().checkRateLimit(userId)
  if (!result.allowed) {
    // Only the exhausted window reports a non-zero reset time.
    const resetTime = Math.max(
      result.limits.minute.resetTime,
      result.limits.hour.resetTime,
      result.limits.day.resetTime
    )
    throw new UserRateLimitError(result.error, resetTime > 0 ? resetTime : undefined)
  }
}
