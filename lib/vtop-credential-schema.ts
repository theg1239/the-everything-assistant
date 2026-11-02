import * as z from 'zod'

/**
 * Shared, client-safe VTOP credential definitions: validation for the link form and the
 * `/api/user/vtop-credentials` route, and the names of the pre-server-storage cookies so the
 * client can clear them. No crypto lives here.
 */

/**
 * VIT registration number (e.g. `21BCE0001`, `21BCE10001`). Mirrors the proxy service's default
 * `usernamePattern` (services/proxy-service/src/config.js), which rejects anything else anyway.
 */
export const VTOP_USERNAME_PATTERN = /^[0-9]{2}[A-Za-z]{2,4}[0-9]{3,5}$/

/** Upper bound on the stored password; VTOP's own limit is far lower. */
export const VTOP_PASSWORD_MAX_LENGTH = 128

export const vtopUsernameSchema = z
  .string()
  .trim()
  .regex(VTOP_USERNAME_PATTERN, 'Enter your VIT registration number (e.g. 21BCE0001).')

export const vtopPasswordSchema = z
  .string()
  .min(1, 'Enter your VTOP password.')
  .max(VTOP_PASSWORD_MAX_LENGTH, `Password must be at most ${VTOP_PASSWORD_MAX_LENGTH} characters.`)
  .refine(value => value.trim().length > 0, 'Enter your VTOP password.')

/** Body of `PUT /api/user/vtop-credentials`. The password is deliberately not trimmed. */
export const vtopCredentialInputSchema = z.object({
  username: vtopUsernameSchema,
  password: vtopPasswordSchema,
})

export type VTOPCredentialInput = z.infer<typeof vtopCredentialInputSchema>

/** Response of every `/api/user/vtop-credentials` method. Never contains the password. */
export const vtopCredentialStatusSchema = z.object({
  linked: z.boolean(),
  username: z.string().optional(),
})

export type VTOPCredentialStatus = z.infer<typeof vtopCredentialStatusSchema>

/** Legacy (pre-server-storage) cookie holding `{ username, encryptedPassword, timestamp }`. */
export const LEGACY_VTOP_CREDENTIALS_COOKIE = 'vtop_linked_credentials'
/** Legacy JS-readable cookie holding the crypto-js passphrase for the cookie above. */
export const LEGACY_VTOP_MASTER_KEY_COOKIE = 'vtop_master_key'
export const LEGACY_VTOP_COOKIES = [
  LEGACY_VTOP_CREDENTIALS_COOKIE,
  LEGACY_VTOP_MASTER_KEY_COOKIE,
] as const
/** The legacy credentials cookie was written with a 90-day expiry. */
export const LEGACY_VTOP_COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
