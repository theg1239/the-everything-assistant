import { createHash } from 'node:crypto'
import * as z from 'zod'
import type { Redis } from '@upstash/redis'
import { emailCodeHashesEqual } from '@/lib/mfa'

/**
 * Server-side MFA state that must survive across serverless instances: which sessions have
 * passed MFA (and when), verification attempt counters, accepted TOTP steps, pending emailed
 * login codes and WebAuthn assertion challenges.
 *
 * Everything here talks to an injected {@link MfaKv} so it can be unit-tested with
 * {@link createMemoryMfaKv}; production wires in {@link createUpstashMfaKv} (see `lib/session.ts`).
 * Next.js-specific glue (cookies, React `cache`) deliberately lives elsewhere.
 */

/** The minimal key-value surface MFA state needs. Values are always JSON object strings. */
export interface MfaKv {
  get(key: string): Promise<string | null>
  /** Returns `false` when `onlyIfAbsent` is set and the key already exists. */
  set(
    key: string,
    value: string,
    options: { ttlSeconds: number; onlyIfAbsent?: boolean }
  ): Promise<boolean>
  /** Returns the number of keys removed (0 or 1). */
  del(key: string): Promise<number>
  /** Fixed-window counter: atomically increments `key`, starting a `ttlSeconds` window on first use. */
  incrWindow(key: string, ttlSeconds: number): Promise<number>
}

/**
 * Upstash adapter. The shared client auto-deserialises JSON on `get`, so non-string results are
 * re-serialised; this is lossless because every value written here is a JSON object.
 */
export function createUpstashMfaKv(redis: Redis): MfaKv {
  return {
    async get(key) {
      const value = await redis.get<unknown>(key)
      if (value === null || value === undefined) return null
      return typeof value === 'string' ? value : JSON.stringify(value)
    },
    async set(key, value, { ttlSeconds, onlyIfAbsent }) {
      const ex = Math.max(1, Math.ceil(ttlSeconds))
      const result = onlyIfAbsent
        ? await redis.set(key, value, { ex, nx: true })
        : await redis.set(key, value, { ex })
      return result !== null
    },
    async del(key) {
      return await redis.del(key)
    },
    async incrWindow(key, ttlSeconds) {
      const ex = Math.max(1, Math.ceil(ttlSeconds))
      // SET NX EX then INCR in one MULTI: the window's TTL is set exactly once and INCR keeps it.
      const [, count] = await redis.multi().set(key, 0, { ex, nx: true }).incr(key).exec()
      return count
    },
  }
}

/**
 * In-process implementation with Redis semantics (TTL, NX, fixed windows). Used by tests and as
 * the development fallback when Upstash isn't configured; never used in production.
 */
export function createMemoryMfaKv(now: () => number = Date.now): MfaKv {
  const entries = new Map<string, { value: string; expiresAt: number }>()
  const live = (key: string) => {
    const entry = entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= now()) {
      entries.delete(key)
      return undefined
    }
    return entry
  }
  return {
    async get(key) {
      return live(key)?.value ?? null
    },
    async set(key, value, { ttlSeconds, onlyIfAbsent }) {
      if (onlyIfAbsent && live(key)) return false
      entries.set(key, { value, expiresAt: now() + ttlSeconds * 1000 })
      return true
    },
    async del(key) {
      const existed = live(key) !== undefined
      entries.delete(key)
      return existed ? 1 : 0
    },
    async incrWindow(key, ttlSeconds) {
      const entry = live(key)
      const count = (entry ? Number(entry.value) : 0) + 1
      entries.set(key, {
        value: String(count),
        expiresAt: entry?.expiresAt ?? now() + ttlSeconds * 1000,
      })
      return count
    },
  }
}

const KEY_PREFIX = 'mfa:v1'

const keys = {
  session: (tokenHash: string) => `${KEY_PREFIX}:session:${tokenHash}`,
  rateLimit: (scope: string) => `${KEY_PREFIX}:rl:${scope}`,
  totpLastStep: (userId: string, secret: string) =>
    `${KEY_PREFIX}:totp:${userId}:${fingerprint(secret)}`,
  emailCode: (userId: string) => `${KEY_PREFIX}:email-code:${userId}`,
  webAuthnChallenge: (tokenHash: string) => `${KEY_PREFIX}:webauthn-challenge:${tokenHash}`,
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function parseJson<S extends z.ZodType>(raw: string | null, schema: S): z.infer<S> | null {
  if (raw === null) return null
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------------------------- */
/* Session verification                                                                          */
/* -------------------------------------------------------------------------------------------- */

/** Which factor satisfied MFA for a session (stored for audit / future policy). */
export const mfaFactorSchema = z.enum(['authenticator', 'email', 'backup_code', 'security_key'])
export type MfaFactor = z.infer<typeof mfaFactorSchema>

const sessionVerificationSchema = z.object({
  userId: z.string().min(1),
  verifiedAt: z.number(),
  factor: mfaFactorSchema,
})
export type SessionMfaVerification = z.infer<typeof sessionVerificationSchema>

/** How recent an MFA verification must be for sensitive changes (disable MFA, delete account…). */
export const MFA_STEP_UP_MAX_AGE_MS = 10 * 60 * 1000

/** Fallback TTL when the session's expiry is unknown (next-auth's default `maxAge`). */
export const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

/** Redis keys are bound to a hash of the session cookie, never the raw token. */
export function hashSessionToken(sessionToken: string): string {
  return createHash('sha256').update(sessionToken).digest('hex')
}

/**
 * The session's MFA verification, or `null` if it has none. A record written for a different
 * user (should be impossible: tokens are unique) is ignored.
 */
export async function readSessionVerification(
  kv: MfaKv,
  tokenHash: string,
  userId: string
): Promise<SessionMfaVerification | null> {
  const record = parseJson(await kv.get(keys.session(tokenHash)), sessionVerificationSchema)
  return record && record.userId === userId ? record : null
}

/**
 * Fail-closed read used for access decisions: no store, no session token, a malformed record
 * or any store error all mean "not verified" (errors are logged, never thrown).
 */
export async function readSessionVerificationOrNull(
  kv: MfaKv | null,
  tokenHash: string | null,
  userId: string
): Promise<SessionMfaVerification | null> {
  if (!kv || !tokenHash) return null
  try {
    return await readSessionVerification(kv, tokenHash, userId)
  } catch (error) {
    console.error('[mfa] failed to read session verification; treating as unverified', error)
    return null
  }
}

/** Marks the session as MFA-verified now; the record lives as long as the session does. */
export async function recordSessionVerification(
  kv: MfaKv,
  tokenHash: string,
  input: { userId: string; factor: MfaFactor; now: number; sessionExpiresAt?: number | null }
): Promise<void> {
  const ttlSeconds =
    input.sessionExpiresAt && input.sessionExpiresAt > input.now
      ? Math.ceil((input.sessionExpiresAt - input.now) / 1000)
      : DEFAULT_SESSION_TTL_SECONDS
  const record: SessionMfaVerification = {
    userId: input.userId,
    verifiedAt: input.now,
    factor: input.factor,
  }
  await kv.set(keys.session(tokenHash), JSON.stringify(record), { ttlSeconds })
}

export async function clearSessionVerification(kv: MfaKv, tokenHash: string): Promise<void> {
  // Independent keys: both deletes are always attempted, in one round trip's time.
  await Promise.all([kv.del(keys.session(tokenHash)), kv.del(keys.webAuthnChallenge(tokenHash))])
}

/** Whether the verification is recent enough to authorise a sensitive change. */
export function isStepUpFresh(
  verification: SessionMfaVerification | null,
  now: number,
  maxAgeMs: number = MFA_STEP_UP_MAX_AGE_MS
): boolean {
  if (!verification) return false
  const age = now - verification.verifiedAt
  return age >= 0 && age <= maxAgeMs
}

/* -------------------------------------------------------------------------------------------- */
/* Rate limiting                                                                                 */
/* -------------------------------------------------------------------------------------------- */

export interface RateLimit {
  max: number
  windowSeconds: number
}

/** Counts this call against `scope`'s window; `false` once more than `max` calls were made. */
export async function consumeRateLimit(
  kv: MfaKv,
  scope: string,
  limit: RateLimit
): Promise<boolean> {
  const count = await kv.incrWindow(keys.rateLimit(scope), limit.windowSeconds)
  return count <= limit.max
}

/** Code-guessing limits: per user and IP, plus a per-user ceiling across all IPs. */
export const VERIFICATION_ATTEMPT_LIMITS = {
  perUserAndIp: { max: 5, windowSeconds: 15 * 60 },
  perUser: { max: 20, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimit>

/**
 * Counts one verification attempt (successful or not) before the code is checked, so parallel
 * guesses can't race past the limit. Returns `false` if the attempt must be rejected.
 */
export async function consumeVerificationAttempt(
  kv: MfaKv,
  input: { userId: string; ip: string }
): Promise<boolean> {
  const [byUserAndIp, byUser] = await Promise.all([
    consumeRateLimit(
      kv,
      `verify:${input.userId}:${input.ip}`,
      VERIFICATION_ATTEMPT_LIMITS.perUserAndIp
    ),
    consumeRateLimit(kv, `verify:${input.userId}`, VERIFICATION_ATTEMPT_LIMITS.perUser),
  ])
  return byUserAndIp && byUser
}

/** After a successful verification the user+IP window starts over (the per-user ceiling stays). */
export async function resetVerificationAttempts(
  kv: MfaKv,
  input: { userId: string; ip: string }
): Promise<void> {
  await kv.del(keys.rateLimit(`verify:${input.userId}:${input.ip}`))
}

/* -------------------------------------------------------------------------------------------- */
/* TOTP replay protection                                                                        */
/* -------------------------------------------------------------------------------------------- */

const totpStepSchema = z.object({ step: z.number().int() })

/** A code is accepted for at most 3 steps (±1 drift); keep markers comfortably longer. */
const TOTP_REPLAY_TTL_SECONDS = 180

/**
 * Accepts a matched TOTP time step at most once per user and secret, and never a step at or
 * before the last accepted one (RFC 6238 §5.2). Returns `false` for a replay.
 */
export async function claimTotpTimeStep(
  kv: MfaKv,
  input: { userId: string; secret: string; timeStep: number }
): Promise<boolean> {
  const lastKey = keys.totpLastStep(input.userId, input.secret)
  const last = parseJson(await kv.get(lastKey), totpStepSchema)
  if (last && input.timeStep <= last.step) return false
  // Per-step marker: concurrent requests with the same code race on this NX write.
  const claimed = await kv.set(`${lastKey}:${input.timeStep}`, '{}', {
    ttlSeconds: TOTP_REPLAY_TTL_SECONDS,
    onlyIfAbsent: true,
  })
  if (!claimed) return false
  await kv.set(lastKey, JSON.stringify({ step: input.timeStep }), {
    ttlSeconds: TOTP_REPLAY_TTL_SECONDS,
  })
  return true
}

/* -------------------------------------------------------------------------------------------- */
/* Emailed login / step-up codes                                                                 */
/* -------------------------------------------------------------------------------------------- */

const emailCodeSchema = z.object({ hash: z.string().min(1), sentAt: z.number() })

export const EMAIL_CODE_TTL_SECONDS = 10 * 60
export const EMAIL_CODE_RESEND_COOLDOWN_MS = 60 * 1000
export const EMAIL_CODE_SEND_LIMIT: RateLimit = { max: 5, windowSeconds: 15 * 60 }

export type EmailCodeIssue = 'issued' | 'cooldown' | 'rate_limited'

/**
 * Stores the hash of a freshly generated email code, replacing any previous one. Refuses while
 * the previous code is under a minute old, or after too many sends in the window.
 */
export async function issueEmailLoginCode(
  kv: MfaKv,
  input: { userId: string; codeHash: string; now: number }
): Promise<EmailCodeIssue> {
  const key = keys.emailCode(input.userId)
  const existing = parseJson(await kv.get(key), emailCodeSchema)
  if (existing && input.now - existing.sentAt < EMAIL_CODE_RESEND_COOLDOWN_MS) return 'cooldown'
  if (!(await consumeRateLimit(kv, `email-send:${input.userId}`, EMAIL_CODE_SEND_LIMIT))) {
    return 'rate_limited'
  }
  await kv.set(key, JSON.stringify({ hash: input.codeHash, sentAt: input.now }), {
    ttlSeconds: EMAIL_CODE_TTL_SECONDS,
  })
  return 'issued'
}

/** Single use: a matching code is deleted, and only the request that deletes it succeeds. */
export async function consumeEmailLoginCode(
  kv: MfaKv,
  input: { userId: string; codeHash: string }
): Promise<boolean> {
  const key = keys.emailCode(input.userId)
  const stored = parseJson(await kv.get(key), emailCodeSchema)
  if (!stored || !emailCodeHashesEqual(stored.hash, input.codeHash)) return false
  return (await kv.del(key)) === 1
}

/* -------------------------------------------------------------------------------------------- */
/* WebAuthn assertion challenges                                                                 */
/* -------------------------------------------------------------------------------------------- */

const challengeSchema = z.object({ challenge: z.string().min(1), userId: z.string().min(1) })

export const WEBAUTHN_CHALLENGE_TTL_SECONDS = 5 * 60

/** Per-session, so a login/step-up assertion never clobbers a pending method change in the DB. */
export async function storeWebAuthnChallenge(
  kv: MfaKv,
  tokenHash: string,
  input: { userId: string; challenge: string }
): Promise<void> {
  await kv.set(keys.webAuthnChallenge(tokenHash), JSON.stringify(input), {
    ttlSeconds: WEBAUTHN_CHALLENGE_TTL_SECONDS,
  })
}

/** Returns and deletes the challenge (single use), or `null` if missing/expired/foreign. */
export async function takeWebAuthnChallenge(
  kv: MfaKv,
  tokenHash: string,
  userId: string
): Promise<string | null> {
  const key = keys.webAuthnChallenge(tokenHash)
  const stored = parseJson(await kv.get(key), challengeSchema)
  if (!stored || stored.userId !== userId) return null
  return (await kv.del(key)) === 1 ? stored.challenge : null
}
