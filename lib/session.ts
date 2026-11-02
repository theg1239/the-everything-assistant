import { cache } from 'react'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getRedis } from '@/lib/redis'
import {
  clearSessionVerification,
  consumeVerificationAttempt,
  createMemoryMfaKv,
  createUpstashMfaKv,
  hashSessionToken,
  isStepUpFresh,
  readSessionVerificationOrNull,
  recordSessionVerification,
  resetVerificationAttempts,
  type MfaFactor,
  type MfaKv,
  type SessionMfaVerification,
} from '@/lib/mfa-state'
import { MFA_STEP_UP_REQUIRED } from '@/types/api/mfa'

/**
 * Next.js glue for server-side MFA state (`lib/mfa-state.ts`): the session-token cookie, the
 * Redis-backed store, and the response helpers MFA routes share.
 */

/** next-auth's database-session cookie (the `__Secure-` variant is used over HTTPS). */
const SESSION_COOKIE_NAMES = [
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
] as const

/** The raw session token from the request cookies, or `null` outside a request / signed out. */
export async function readSessionToken(): Promise<string | null> {
  try {
    const store = await cookies()
    for (const name of SESSION_COOKIE_NAMES) {
      const value = store.get(name)?.value
      if (value) return value
    }
    return null
  } catch {
    return null
  }
}

export async function readSessionTokenHash(): Promise<string | null> {
  const token = await readSessionToken()
  return token ? hashSessionToken(token) : null
}

type MfaKvGlobal = typeof globalThis & { __mfaDevMemoryKv?: MfaKv }

let upstashKv: MfaKv | undefined
let warnedUnavailable = false

/**
 * The MFA store: Upstash Redis, or (development only) an in-process fallback so local MFA
 * testing works without Redis. In production without Redis this is `null`, and callers fail
 * closed: MFA users are treated as unverified and verification endpoints return 503.
 */
export function getMfaKv(): MfaKv | null {
  const redis = getRedis()
  if (redis) {
    upstashKv ??= createUpstashMfaKv(redis)
    return upstashKv
  }
  if (process.env.NODE_ENV === 'development') {
    // On globalThis so route handlers and server components share it across module instances.
    const scope: MfaKvGlobal = globalThis
    scope.__mfaDevMemoryKv ??= createMemoryMfaKv()
    return scope.__mfaDevMemoryKv
  }
  if (!warnedUnavailable) {
    warnedUnavailable = true
    console.error(
      '[mfa] Upstash Redis is not configured: MFA-enabled users cannot complete verification'
    )
  }
  return null
}

/**
 * This request's session MFA verification (one Redis GET, memoised per request in server
 * components). Fails closed: any store problem reads as "not verified".
 */
export const getCurrentSessionVerification = cache(
  async (userId: string): Promise<SessionMfaVerification | null> =>
    readSessionVerificationOrNull(getMfaKv(), await readSessionTokenHash(), userId)
)

/**
 * Records that the current session just passed MFA. Only verification endpoints call this,
 * in the same request that checked the code / assertion. Throws if the store is unavailable.
 */
export async function recordCurrentSessionVerification(input: {
  userId: string
  factor: MfaFactor
  /** The session's `expires` (ISO string), so the record never outlives the session. */
  sessionExpires?: string
}): Promise<void> {
  const kv = getMfaKv()
  const tokenHash = await readSessionTokenHash()
  if (!kv || !tokenHash) throw new Error('MFA store or session token unavailable')
  const expiresAt = input.sessionExpires ? Date.parse(input.sessionExpires) : Number.NaN
  await recordSessionVerification(kv, tokenHash, {
    userId: input.userId,
    factor: input.factor,
    now: Date.now(),
    sessionExpiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
  })
}

/** Drops a session's MFA record (sign-out, account deletion). Never throws. */
export async function clearSessionVerificationForToken(sessionToken: string): Promise<void> {
  const kv = getMfaKv()
  if (!kv) return
  try {
    await clearSessionVerification(kv, hashSessionToken(sessionToken))
  } catch (error) {
    console.error('[mfa] failed to clear session verification', error)
  }
}

export async function clearCurrentSessionVerification(): Promise<void> {
  const token = await readSessionToken()
  if (token) await clearSessionVerificationForToken(token)
}

/**
 * Whether a sensitive change is allowed: always for users without MFA, otherwise only within
 * `MFA_STEP_UP_MAX_AGE_MS` of this session's last MFA verification.
 */
export async function hasFreshMfa(input: {
  userId: string
  mfaEnabled: boolean
}): Promise<boolean> {
  if (!input.mfaEnabled) return true
  const verification = await getCurrentSessionVerification(input.userId)
  return isStepUpFresh(verification, Date.now())
}

/** `403 { error: 'MFA_STEP_UP_REQUIRED' }`: re-verify via the MFA challenge, then retry. */
export function mfaStepUpRequiredResponse(): NextResponse {
  return NextResponse.json(
    { error: MFA_STEP_UP_REQUIRED, message: 'Please verify your identity again to continue.' },
    { status: 403 }
  )
}

export function mfaUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Verification is temporarily unavailable. Please try again shortly.' },
    { status: 503 }
  )
}

export function tooManyAttemptsResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Too many verification attempts. Please try again later.' },
    { status: 429 }
  )
}

/** Best-effort client IP (Cloudflare, then common proxy headers). */
export function requestIp(request: Request): string {
  const headers = request.headers
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    headers.get('cf-connecting-ip')?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    forwarded ||
    'unknown'
  )
}

/**
 * Counts a verification attempt for user+IP; returns the 429/503 response to send if the
 * attempt must be rejected, else `null`.
 */
export async function limitVerificationAttempt(
  kv: MfaKv,
  userId: string,
  request: Request
): Promise<NextResponse | null> {
  try {
    const allowed = await consumeVerificationAttempt(kv, { userId, ip: requestIp(request) })
    return allowed ? null : tooManyAttemptsResponse()
  } catch (error) {
    console.error('[mfa] attempt limiter unavailable', error)
    return mfaUnavailableResponse()
  }
}

export async function resetVerificationAttemptLimit(
  kv: MfaKv,
  userId: string,
  request: Request
): Promise<void> {
  try {
    await resetVerificationAttempts(kv, { userId, ip: requestIp(request) })
  } catch (error) {
    console.error('[mfa] failed to reset attempt limiter', error)
  }
}
