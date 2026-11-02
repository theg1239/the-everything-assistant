import { Redis } from '@upstash/redis'

let sharedRedis: Redis | null | undefined

/**
 * Process-wide Upstash REST client, or `null` when `UPSTASH_REDIS_REST_URL` /
 * `UPSTASH_REDIS_REST_TOKEN` are not configured. Callers that only use Redis as a
 * cache should treat `null` as "no cache" rather than failing.
 */
export function getRedis(): Redis | null {
  if (sharedRedis !== undefined) return sharedRedis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  sharedRedis = url && token ? new Redis({ url, token }) : null
  return sharedRedis
}
