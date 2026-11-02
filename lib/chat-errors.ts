/**
 * Structured classification of chat request/stream errors. Decisions read status codes, error
 * classes and the JSON bodies our own routes send (`app/api/chat`, `app/api/guest-chat`), never
 * the wording of an error message.
 *
 * Client-safe (zod + `ai` error classes only); also used server-side for provider 429s.
 */
import { APICallError, RetryError, TypeValidationError } from 'ai'
import * as z from 'zod'
import { isRecord } from '@/lib/json'

/** JSON error bodies sent by the chat routes (see `jsonResponse` in app/api/chat/route.ts). */
export const chatErrorBodySchema = z
  .object({
    error: z.string().optional(),
    message: z.string().optional(),
    type: z.enum(['user_rate_limit', 'model_rate_limit']).optional(),
    /** When the limit lifts: ISO string or epoch milliseconds. */
    resetTime: z.union([z.string(), z.number()]).optional(),
  })
  .loose()
export type ChatErrorBody = z.infer<typeof chatErrorBodySchema>

export type ChatErrorInfo =
  | { kind: 'guest_limit'; message?: string }
  | {
      kind: 'rate_limit'
      scope: 'user' | 'model'
      message?: string
      resetTime?: string | number
    }
  /** The stream ended with an `abort` chunk this client could not validate (transient). */
  | { kind: 'stream_abort' }
  | { kind: 'other' }

/** Parses a response body as one of our JSON error bodies; null when it isn't JSON / that shape. */
export function parseChatErrorBody(text: string | undefined): ChatErrorBody | null {
  if (!text) return null
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const parsed = chatErrorBodySchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

/** HTTP status and body of an error, read from its fields (APICallError or error-like objects). */
function httpFieldsOf(error: unknown): { status?: number; body?: string } {
  if (APICallError.isInstance(error)) {
    return { status: error.statusCode, body: error.responseBody }
  }
  if (!isRecord(error)) return {}
  const status = [error.statusCode, error.status].find(value => typeof value === 'number')
  const body = typeof error.responseBody === 'string' ? error.responseBody : undefined
  return { status: typeof status === 'number' ? status : undefined, body }
}

export function classifyChatError(error: unknown): ChatErrorInfo {
  if (TypeValidationError.isInstance(error)) {
    return isRecord(error.value) && error.value.type === 'abort'
      ? { kind: 'stream_abort' }
      : { kind: 'other' }
  }

  const { status, body: rawBody } = httpFieldsOf(error)
  const body = parseChatErrorBody(rawBody)

  if (body?.error === 'GUEST_LIMIT') return { kind: 'guest_limit', message: body.message }

  if (status === 429 || body?.error === 'RATE_LIMIT_EXCEEDED' || body?.type !== undefined) {
    return {
      kind: 'rate_limit',
      scope: body?.type === 'user_rate_limit' ? 'user' : 'model',
      message: body?.message ?? body?.error,
      resetTime: body?.resetTime,
    }
  }

  return { kind: 'other' }
}

/** A provider call rejected with HTTP 429 (directly, or as the last attempt of a retry loop). */
export function providerRateLimitOf(error: unknown): APICallError | null {
  const candidate = RetryError.isInstance(error) ? error.lastError : error
  return APICallError.isInstance(candidate) && candidate.statusCode === 429 ? candidate : null
}

/**
 * Reset time (epoch ms) from a provider 429's `Retry-After` header (delta-seconds or HTTP date).
 * Header values are a machine format, not prose.
 */
export function retryAfterResetTime(
  error: APICallError,
  now: number = Date.now()
): number | undefined {
  const headers = error.responseHeaders ?? {}
  const value = Object.entries(headers).find(([name]) => name.toLowerCase() === 'retry-after')?.[1]
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return now + seconds * 1000
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : date
}
