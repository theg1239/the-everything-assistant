import { getRedis } from '@/lib/redis'

/**
 * Short-lived cache of "is this user's ChatGPT account connected via Codex?".
 *
 * The chat route needs only this boolean on every message, while the live lookup
 * (`getChatgptStatus`) spawns/talks to a codex app-server child process or the
 * Codex proxy. Writes happen through `rememberChatgptConnected` from every
 * status-returning call in `./app-server`, so the settings dialog's status
 * polling, login, cancel and disconnect keep the cache fresh without changes
 * in the auth routes.
 */
const STATUS_TTL_SECONDS = 5 * 60
const statusKey = (userId: string) => `codex:chatgpt-connected:v1:${userId}`

/** In-process fallback when Upstash isn't configured (e.g. local dev). */
const memoryCache = new Map<string, { connected: boolean; expiresAt: number }>()

const isServerlessRuntime = (): boolean =>
  Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers')

/**
 * Whether this deployment can reach Codex at all: a proxy URL, an explicit
 * `CODEX_BIN`, or a long-lived server that may have `codex` on PATH. Vercel
 * functions and Workers ship no codex binary, so without a proxy every
 * status lookup there would just fail to spawn.
 */
export function isCodexConfigured(): boolean {
  if (process.env.CODEX_PROXY_URL?.trim()) return true
  if (process.env.CODEX_BIN?.trim()) return true
  return !isServerlessRuntime()
}

export async function readCachedChatgptConnected(userId: string): Promise<boolean | null> {
  const redis = getRedis()
  if (!redis) {
    const entry = memoryCache.get(userId)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      memoryCache.delete(userId)
      return null
    }
    return entry.connected
  }
  try {
    const value: unknown = await redis.get(statusKey(userId))
    // Stored as JSON `{ c: 0 | 1 }`; Upstash deserialises it back to an object.
    if (typeof value === 'object' && value !== null && 'c' in value) {
      return value.c === 1
    }
    return null
  } catch (error) {
    console.warn('[codex] status cache read failed', error)
    return null
  }
}

export async function rememberChatgptConnected(
  userId: string,
  connected: boolean,
  ttlSeconds: number = STATUS_TTL_SECONDS
): Promise<void> {
  const redis = getRedis()
  if (!redis) {
    memoryCache.set(userId, { connected, expiresAt: Date.now() + ttlSeconds * 1000 })
    return
  }
  try {
    await redis.set(statusKey(userId), { c: connected ? 1 : 0 }, { ex: ttlSeconds })
  } catch (error) {
    console.warn('[codex] status cache write failed', error)
  }
}

/** Drops the cached status so the next chat message re-reads it live. */
export async function invalidateChatgptStatus(userId: string): Promise<void> {
  memoryCache.delete(userId)
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.del(statusKey(userId))
  } catch (error) {
    console.warn('[codex] status cache invalidation failed', error)
  }
}
