import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { logSecurityEvent } from '@/lib/mfa'
import { prisma } from '@/lib/prisma'
import { VTOPCredentialsConfigError } from './vtop-credential-crypto'
import {
  LEGACY_VTOP_COOKIES,
  LEGACY_VTOP_CREDENTIALS_COOKIE,
  LEGACY_VTOP_MASTER_KEY_COOKIE,
  type VTOPCredentialStatus,
} from './vtop-credential-schema'
import {
  getVTOPCredentialStore,
  type LegacyImportResult,
  type VTOPCredentials,
} from './vtop-credential-store'
import { encodeLegacyProxyPassword } from './vtop-legacy-credentials'

/**
 * Request-scoped VTOP credential access for the signed-in `auth()` user, on top of the
 * encrypted server store (lib/vtop-credential-store.ts). Server-only.
 *
 * Also performs the one-time migration of the pre-server-storage cookies
 * (`vtop_linked_credentials` + `vtop_master_key`): if the user has no server record but the
 * request carries both cookies, they are decrypted here, saved under this user (subject to
 * `isPlausibleLegacyImport`, never over an existing record), and expired when the context
 * allows setting cookies (route handlers / server actions; in RSC the next
 * `GET /api/user/vtop-credentials` clears them).
 */

function logFailure(operation: string, error: unknown) {
  if (error instanceof VTOPCredentialsConfigError) {
    console.error(`[vtop-credentials] ${operation} failed: ${error.message}`)
  } else {
    console.error(
      `[vtop-credentials] ${operation} failed:`,
      error instanceof Error ? error.name : 'unknown error'
    )
  }
}

async function readLegacyCookies() {
  const store = await cookies()
  return {
    credentialsCookie: store.get(LEGACY_VTOP_CREDENTIALS_COOKIE)?.value,
    masterKeyCookie: store.get(LEGACY_VTOP_MASTER_KEY_COOKIE)?.value,
  }
}

/** True if the request still carries either legacy cookie. */
export async function hasLegacyVTOPCookies(): Promise<boolean> {
  const store = await cookies()
  return LEGACY_VTOP_COOKIES.some(name => store.has(name))
}

/**
 * Expires both legacy cookies via `next/headers`. Works in route handlers (before the response
 * is returned) and server actions; a no-op where cookies are read-only (RSC).
 */
export async function expireLegacyVTOPCookies(): Promise<void> {
  try {
    const store = await cookies()
    for (const name of LEGACY_VTOP_COOKIES) {
      if (store.has(name)) store.delete({ name, path: '/' })
    }
  } catch {
    // Read-only cookie context (Server Component render): cleared by the next API call instead.
  }
}

/**
 * Imports the request's legacy cookies for `userId` when it has no server record.
 * Does NOT expire the cookies; callers do that (route handlers on their response).
 */
export async function importLegacyVTOPCookiesForUser(
  userId: string,
  request?: Request
): Promise<LegacyImportResult> {
  const legacy = await readLegacyCookies()
  if (!legacy.credentialsCookie || !legacy.masterKeyCookie) {
    return { status: 'skipped', reason: 'absent' }
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { created_at: true },
  })
  if (!user) return { status: 'skipped', reason: 'implausible' }
  const result = await getVTOPCredentialStore().importLegacy(userId, legacy, {
    createdAt: user.created_at,
  })
  if (result.status === 'imported') {
    await logSecurityEvent(userId, 'vtop_credentials_imported_from_cookie', {}, request)
  }
  return result
}

/** Imports (if applicable) then expires legacy cookies; for non-route-handler resolve paths. */
async function migrateLegacyCookies(userId: string): Promise<void> {
  if (!(await hasLegacyVTOPCookies())) return
  try {
    await importLegacyVTOPCookiesForUser(userId)
  } finally {
    await expireLegacyVTOPCookies()
  }
}

async function currentUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

/**
 * Decrypted credentials of `userId` (migrating this request's legacy cookies first if needed),
 * or null. For callers that already authenticated the request and hold the user id: it skips
 * the extra `auth()` (not memoised in route handlers / server actions). Never throws: failures
 * are logged without secrets. Server-side use only.
 */
export async function getUserVTOPCredentials(userId: string): Promise<VTOPCredentials | null> {
  try {
    const store = getVTOPCredentialStore()
    const stored = await store.get(userId)
    if (stored) return stored
    await migrateLegacyCookies(userId)
    return await store.get(userId)
  } catch (error) {
    logFailure('reading credentials', error)
    return null
  }
}

/** Link status of `userId` (migrating legacy cookies first if needed). Never throws. */
export async function getUserVTOPCredentialStatus(userId: string): Promise<VTOPCredentialStatus> {
  try {
    const store = getVTOPCredentialStore()
    const current = await store.status(userId)
    if (current.linked) return current
    await migrateLegacyCookies(userId)
    return await store.status(userId)
  } catch (error) {
    logFailure('reading link status', error)
    return { linked: false }
  }
}

/**
 * Decrypted credentials of the signed-in user (migrating legacy cookies first if needed), or
 * null. Never throws: failures are logged without secrets. Server-side use only.
 */
export async function getCurrentUserVTOPCredentials(): Promise<VTOPCredentials | null> {
  try {
    const userId = await currentUserId()
    return userId ? await getUserVTOPCredentials(userId) : null
  } catch (error) {
    logFailure('reading credentials', error)
    return null
  }
}

/** Link status of the signed-in user (migrating legacy cookies first if needed). Never throws. */
export async function getCurrentUserVTOPCredentialStatus(): Promise<VTOPCredentialStatus> {
  try {
    const userId = await currentUserId()
    return userId ? await getUserVTOPCredentialStatus(userId) : { linked: false }
  } catch (error) {
    logFailure('reading link status', error)
    return { linked: false }
  }
}

/**
 * @deprecated Use {@link getCurrentUserVTOPCredentials} (or `getVTOPCredentialsForUser(userId)`
 * from `@/lib/vtop-credential-store`) and send `{ username, password }` to the proxy.
 *
 * Kept for backwards compatibility. The
 * `cipher:::key` format only existed to carry the browser cookie key; now `encryptedPassword`
 * holds the PLAINTEXT password, which every caller already forwards as the proxy's `password`
 * field when it contains no `:::`. Passwords that do contain `:::` are wrapped in the legacy
 * format so callers that split on `:::` keep working.
 */
export async function getFormattedVTOPCredentials(): Promise<{
  username: string
  encryptedPassword: string
} | null> {
  const credentials = await getCurrentUserVTOPCredentials()
  if (!credentials) return null
  return {
    username: credentials.username,
    encryptedPassword: credentials.password.includes(':::')
      ? encodeLegacyProxyPassword(credentials.password)
      : credentials.password,
  }
}

/**
 * @deprecated Use {@link getCurrentUserVTOPCredentials}, or `getVTOPCredentialsForUser(userId)`
 * from `@/lib/vtop-credential-store`.
 */
export const getDecryptedVTOPCredentials = getCurrentUserVTOPCredentials

/**
 * @deprecated Use {@link getCurrentUserVTOPCredentialStatus}, or `hasVTOPCredentials(userId)`
 * from `@/lib/vtop-credential-store` (returns `{ linked, username? }`).
 */
export async function hasVTOPCredentials(): Promise<boolean> {
  return (await getCurrentUserVTOPCredentialStatus()).linked
}
