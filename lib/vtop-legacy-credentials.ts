import CryptoJS from 'crypto-js'
import * as z from 'zod'

/**
 * The ONLY use of crypto-js in the Next.js app, and server-side only: reading the pre-server-
 * storage cookies once so they can be migrated into the encrypted server store, plus the legacy
 * proxy wire format for one edge case. Delete this module (and the crypto-js dependency) once
 * the legacy cookies have aged out (they were written with a 90-day expiry) and the deprecated
 * `getFormattedVTOPCredentials` has no callers.
 *
 * Old client format (lib/vtop-credentials.ts before server storage):
 *   vtop_master_key         = encodeURIComponent(hex(32 random bytes))   -- JS-readable!
 *   vtop_linked_credentials = encodeURIComponent(JSON.stringify({
 *     username, encryptedPassword: CryptoJS.AES.encrypt(password, masterKey).toString(),
 *     timestamp: Date.now() }))
 * i.e. crypto-js passphrase mode (OpenSSL EVP_BytesToKey/MD5 + AES-256-CBC, no MAC).
 */

export interface LegacyVTOPCredentials {
  username: string
  password: string
  /** `Date.now()` when the old client saved the cookie. */
  savedAt: number
}

const legacyCookieSchema = z.object({
  username: z.string(),
  encryptedPassword: z.string().min(1),
  timestamp: z.number().finite(),
})

/** The browser stored `encodeURIComponent(value)`; Next may or may not have decoded it already. */
function decodeCookieValue(value: string): string {
  if (!value.includes('%')) return value
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Decrypts the legacy cookie pair. Returns null for anything missing, malformed or wrong. */
export function decryptLegacyVTOPCookies(
  credentialsCookie: string | null | undefined,
  masterKeyCookie: string | null | undefined
): LegacyVTOPCredentials | null {
  if (!credentialsCookie || !masterKeyCookie) return null
  try {
    const parsedJson: unknown = JSON.parse(decodeCookieValue(credentialsCookie))
    const parsed = legacyCookieSchema.safeParse(parsedJson)
    if (!parsed.success) return null
    const password = CryptoJS.AES.decrypt(
      parsed.data.encryptedPassword,
      decodeCookieValue(masterKeyCookie)
    ).toString(CryptoJS.enc.Utf8)
    if (!password) return null
    return { username: parsed.data.username, password, savedAt: parsed.data.timestamp }
  } catch {
    // Wrong key / corrupt cipher makes crypto-js throw "Malformed UTF-8 data".
    return null
  }
}

/**
 * Legacy proxy wire format `cipher:::passphrase` (the passphrase travels with the cipher, so this
 * is NOT encryption). Only used by the deprecated `getFormattedVTOPCredentials` for passwords that
 * themselves contain `:::`, which callers would otherwise mis-split.
 */
export function encodeLegacyProxyPassword(password: string): string {
  const passphrase = CryptoJS.lib.WordArray.random(256 / 8).toString()
  return `${CryptoJS.AES.encrypt(password, passphrase).toString()}:::${passphrase}`
}
