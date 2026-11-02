import type { Redis } from '@upstash/redis'
import * as z from 'zod'

/**
 * Server-side quota for guest (signed-out) chat.
 *
 * The cap is counted here, per request, never from client-supplied history. Two
 * counters are consumed in order:
 * 1. per guest id: a random id kept in an HMAC-signed httpOnly cookie, so the
 *    "2 free messages" UX is per browser even behind shared NAT (campus Wi-Fi);
 * 2. per client IP: a looser cap that bounds cookie-clearing / scripted abuse.
 *
 * Everything here uses Web Crypto and plain strings, so it runs unchanged on the
 * Node runtime (Vercel) and on Cloudflare Workers.
 */

export interface GuestQuotaStore {
  /** Increments `key`, setting `ttlSeconds` when it is created; returns the new count. */
  increment(key: string, ttlSeconds: number): Promise<number>
}

export interface GuestQuotaConfig {
  perGuestLimit: number
  perIpLimit: number
  windowSeconds: number
}

export const GUEST_MESSAGE_LIMIT = 2

const positiveInt = (raw: string | undefined, fallback: number) => {
  const value = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function loadGuestQuotaConfig(
  env: Record<string, string | undefined> = process.env
): GuestQuotaConfig {
  return {
    perGuestLimit: GUEST_MESSAGE_LIMIT,
    perIpLimit: positiveInt(env.GUEST_IP_DAILY_LIMIT, 20),
    windowSeconds: 24 * 60 * 60,
  }
}

export type GuestQuotaResult =
  | { allowed: true; guestCount: number; ipCount: number }
  | { allowed: false; reason: 'guest' | 'ip' }

export async function consumeGuestQuota(
  store: GuestQuotaStore,
  identity: { guestId: string; ip: string | null },
  config: GuestQuotaConfig
): Promise<GuestQuotaResult> {
  const guestCount = await store.increment(`guest_quota:id:${identity.guestId}`, config.windowSeconds)
  if (guestCount > config.perGuestLimit) return { allowed: false, reason: 'guest' }
  // Without a trustworthy IP every such guest shares one bucket (fails closed, not open).
  const ipCount = await store.increment(
    `guest_quota:ip:${identity.ip ?? 'unknown'}`,
    config.windowSeconds
  )
  if (ipCount > config.perIpLimit) return { allowed: false, reason: 'ip' }
  return { allowed: true, guestCount, ipCount }
}

const multiResultSchema = z.tuple([z.coerce.number(), z.unknown()])

export function createRedisGuestQuotaStore(redis: Redis): GuestQuotaStore {
  return {
    async increment(key, ttlSeconds) {
      // MULTI: the TTL is attached atomically with the first increment.
      const raw: unknown = await redis.multi().incr(key).expire(key, ttlSeconds, 'NX').exec()
      return multiResultSchema.parse(raw)[0]
    },
  }
}

/** Per-process store for local development and tests. */
export function createMemoryGuestQuotaStore(now: () => number = Date.now): GuestQuotaStore {
  const entries = new Map<string, { count: number; expiresAt: number }>()
  return {
    async increment(key, ttlSeconds) {
      const current = entries.get(key)
      const entry =
        current && current.expiresAt > now()
          ? current
          : { count: 0, expiresAt: now() + ttlSeconds * 1000 }
      entry.count += 1
      entries.set(key, entry)
      return entry.count
    },
  }
}

export type HostingPlatform = 'vercel' | 'cloudflare' | 'other'

export function detectHostingPlatform(): HostingPlatform {
  if (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers') {
    return 'cloudflare'
  }
  if (process.env.VERCEL) return 'vercel'
  return 'other'
}

const IP_PATTERN = /^[0-9a-f:.]{2,45}$/i

const cleanIp = (value: string | null | undefined): string | null => {
  const ip = value?.trim()
  return ip && IP_PATTERN.test(ip) ? ip.toLowerCase() : null
}

/**
 * The client IP from the header the hosting platform itself sets. The leftmost
 * `X-Forwarded-For` entry is client-controlled almost everywhere, so it is only
 * used where the platform overwrites the header:
 * - Cloudflare: `CF-Connecting-IP` (Cloudflare replaces any client value);
 * - Vercel: `X-Real-IP` / `X-Vercel-Forwarded-For` (Vercel overwrites
 *   `X-Forwarded-For` too and does not forward client-supplied values);
 * - elsewhere: the rightmost `X-Forwarded-For` hop (added by the nearest proxy).
 */
export function getClientIp(headers: Headers, platform: HostingPlatform): string | null {
  switch (platform) {
    case 'cloudflare':
      return cleanIp(headers.get('cf-connecting-ip'))
    case 'vercel':
      return (
        cleanIp(headers.get('x-real-ip')) ??
        cleanIp(headers.get('x-vercel-forwarded-for')?.split(',')[0]) ??
        cleanIp(headers.get('x-forwarded-for')?.split(',')[0])
      )
    case 'other':
      return cleanIp(headers.get('x-forwarded-for')?.split(',').at(-1)) ?? cleanIp(headers.get('x-real-ip'))
  }
}

// ---------------------------------------------------------------------------
// Signed guest cookie: `<id>.<base64url(HMAC-SHA256(secret, "guest:" + id))>`.
// ---------------------------------------------------------------------------

const GUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/

const encoder = new TextEncoder()

function base64UrlEncode(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])

export function createGuestId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

export async function signGuestId(guestId: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    encoder.encode(`guest:${guestId}`)
  )
  return `${guestId}.${base64UrlEncode(signature)}`
}

/** The guest id when the cookie value carries a valid signature, else null. */
export async function verifyGuestCookie(
  value: string | null | undefined,
  secret: string
): Promise<string | null> {
  if (!value) return null
  const [guestId, signature, ...rest] = value.split('.')
  if (!guestId || !signature || rest.length > 0 || !GUEST_ID_PATTERN.test(guestId)) return null
  const signatureBytes = base64UrlDecode(signature)
  if (!signatureBytes) return null
  // subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signatureBytes,
    encoder.encode(`guest:${guestId}`)
  )
  return valid ? guestId : null
}
