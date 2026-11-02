import { randomBytes } from 'crypto'
import jwt from 'jsonwebtoken'
import * as z from 'zod'
import { getRedis } from '@/lib/redis'

/**
 * OAuth `state` for linking a WhatsApp user's VTOP account.
 *
 * The state is an HS256 JWT carrying only the user id and a random single-use
 * nonce. The PKCE verifier and the initiating phone number stay server-side in
 * Redis under that nonce (10 minute TTL) and are consumed atomically (GETDEL) by
 * the callback, so a state can be redeemed once, only for the user that started
 * the flow, and never reveals the verifier.
 */

export const OAUTH_STATE_TTL_SECONDS = 600

const AUDIENCE = 'whatsapp-oauth-callback'
const ISSUER = 'the-everything-assistant'

/** Dedicated secret if set, else NEXTAUTH_SECRET. No hardcoded fallback. */
function stateSecret(): string | null {
  return process.env.WHATSAPP_OAUTH_STATE_SECRET || process.env.NEXTAUTH_SECRET || null
}

const redisKey = (nonce: string) => `wa_oauth_state:${nonce}`

const pendingSchema = z.object({ uid: z.string(), phone: z.string(), verifier: z.string() })

const claimsSchema = z.object({ uid: z.string().min(1), n: z.string().min(16) })

export class OAuthStateUnavailableError extends Error {
  constructor() {
    super('OAuth state signing is not configured (secret or Redis missing)')
    this.name = 'OAuthStateUnavailableError'
  }
}

export async function createOAuthState(params: {
  userId: string
  phone: string
  verifier: string
}): Promise<string> {
  const secret = stateSecret()
  const redis = getRedis()
  if (!secret || !redis) throw new OAuthStateUnavailableError()

  const nonce = randomBytes(24).toString('base64url')
  await redis.set(
    redisKey(nonce),
    JSON.stringify({ uid: params.userId, phone: params.phone, verifier: params.verifier }),
    { ex: OAUTH_STATE_TTL_SECONDS }
  )
  return jwt.sign({ uid: params.userId, n: nonce }, secret, {
    algorithm: 'HS256',
    expiresIn: OAUTH_STATE_TTL_SECONDS,
    audience: AUDIENCE,
    issuer: ISSUER,
  })
}

/**
 * Verifies the state signature/expiry and consumes its pending record. Returns
 * null for any invalid, expired, replayed or mismatched state.
 */
export async function consumeOAuthState(
  state: string
): Promise<{ userId: string; phone: string; verifier: string } | null> {
  const secret = stateSecret()
  const redis = getRedis()
  if (!secret || !redis) throw new OAuthStateUnavailableError()

  let claims: z.infer<typeof claimsSchema>
  try {
    const decoded = jwt.verify(state, secret, {
      algorithms: ['HS256'],
      audience: AUDIENCE,
      issuer: ISSUER,
    })
    const parsed = claimsSchema.safeParse(decoded)
    if (!parsed.success) return null
    claims = parsed.data
  } catch {
    return null
  }

  const raw: unknown = await redis.getdel(redisKey(claims.n))
  // Upstash auto-deserialises JSON strings; accept either form.
  const record = pendingSchema.safeParse(typeof raw === 'string' ? safeJson(raw) : raw)
  if (!record.success || record.data.uid !== claims.uid) return null
  return { userId: record.data.uid, phone: record.data.phone, verifier: record.data.verifier }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
