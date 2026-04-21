import { Redis } from '@upstash/redis'

let cachedClient: Redis | null | undefined

/**
 * Returns an Upstash Redis client for resumable streams, or `null` if the
 * required env vars aren't configured (keeps local dev working).
 */
export function getResumableStreamClient(): Redis | null {
  if (cachedClient !== undefined) return cachedClient
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    cachedClient = null
    return null
  }
  cachedClient = new Redis({ url, token })
  return cachedClient
}

/**
 * Resumable streams live under a prefixed keyspace so they can coexist with
 * the chat app's other Upstash usage.
 */
const STREAM_INDEX_PREFIX = 'ea:resumable:chat:'
const STREAM_ID_TTL_SECONDS = 60 * 60 // 1h — plenty for a live turn

function indexKey(chatId: string) {
  return `${STREAM_INDEX_PREFIX}${chatId}`
}

/** Record the stream id for a chat so a later resume can look it up. */
export async function rememberStreamId(chatId: string, streamId: string) {
  const client = getResumableStreamClient()
  if (!client) return
  try {
    await client.set(indexKey(chatId), streamId, { ex: STREAM_ID_TTL_SECONDS })
  } catch (error) {
    console.warn('[resumable-stream] failed to remember stream id', error)
  }
}

/** Read the most recent stream id for a chat (if any). */
export async function getLatestStreamId(chatId: string): Promise<string | null> {
  const client = getResumableStreamClient()
  if (!client) return null
  try {
    const value = await client.get<string>(indexKey(chatId))
    return value ?? null
  } catch (error) {
    console.warn('[resumable-stream] failed to read stream id', error)
    return null
  }
}
