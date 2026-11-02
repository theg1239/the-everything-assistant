import assert from 'node:assert/strict'
import test, { afterEach, beforeEach } from 'node:test'
import { enforceUserRateLimit, loadUserRateLimitConfig } from '../lib/user-rate-limiter'

// Every test runs with Redis unconfigured: if `enforceUserRateLimit` constructed the
// limiter it would throw "Redis configuration required for user rate limiting".
const ENV_KEYS = [
  'USER_RATE_LIMITING_ENABLED',
  'USER_RATE_LIMIT_REQUESTS_PER_MINUTE',
  'USER_RATE_LIMIT_REQUESTS_PER_HOUR',
  'USER_RATE_LIMIT_REQUESTS_PER_DAY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const

let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
  for (const key of ENV_KEYS) delete process.env[key]
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('loadUserRateLimitConfig reads env with defaults', () => {
  assert.deepEqual(loadUserRateLimitConfig(), {
    requestsPerMinute: 10,
    requestsPerHour: 100,
    requestsPerDay: 1000,
    enabled: true,
  })
  process.env.USER_RATE_LIMITING_ENABLED = 'false'
  process.env.USER_RATE_LIMIT_REQUESTS_PER_MINUTE = '3'
  assert.equal(loadUserRateLimitConfig().enabled, false)
  assert.equal(loadUserRateLimitConfig().requestsPerMinute, 3)
})

test('is a no-op without Redis when USER_RATE_LIMITING_ENABLED=false', async () => {
  process.env.USER_RATE_LIMITING_ENABLED = 'false'
  await assert.doesNotReject(enforceUserRateLimit('user-1'))
})

test('is a no-op without Redis for anonymous users', async () => {
  for (const userId of ['', null, undefined]) {
    await assert.doesNotReject(enforceUserRateLimit(userId), String(userId))
  }
})

// Runs last: it proves the two tests above would have failed had the limiter (and
// therefore a Redis client) been constructed. The constructor throws before caching,
// so it leaves no shared state behind.
test('does construct the limiter (and requires Redis) when enabled for a real user', async () => {
  await assert.rejects(enforceUserRateLimit('user-1'), /Redis configuration required/)
  process.env.USER_RATE_LIMITING_ENABLED = 'false'
  await assert.doesNotReject(enforceUserRateLimit('user-1'))
})
