import { useEffect, useSyncExternalStore } from 'react'
import {
  LEGACY_VTOP_COOKIES,
  vtopCredentialStatusSchema,
  type VTOPCredentialStatus,
} from './vtop-credential-schema'

/**
 * Client side of VTOP credential linking. The password never stays in the browser: it is sent
 * once (HTTPS) to `PUT /api/user/vtop-credentials`, stored AES-256-GCM encrypted on the server,
 * and never returned. The browser only knows `{ linked, username }`, cached here for the
 * synchronous checks in the chat / hub UI.
 *
 * No crypto-js, cookies or storage of secrets on the client any more.
 */

const ENDPOINT = '/api/user/vtop-credentials'
/** Pre-server-storage browser keys: username-only prefill, and the old per-tab cipher key. */
const LEGACY_STORAGE_KEYS = [
  ['localStorage', 'vtop_credentials'],
  ['sessionStorage', 'vtop_session_key'],
] as const

/** A request to the credentials API failed. `message` is safe to show to the user. */
export class VTOPCredentialsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'VTOPCredentialsRequestError'
  }
}

let status: VTOPCredentialStatus | null = null
let inflight: Promise<VTOPCredentialStatus> | null = null
const listeners = new Set<() => void>()

function setStatus(next: VTOPCredentialStatus) {
  status = next.linked ? { linked: true, username: next.username } : { linked: false }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const UNKNOWN: null = null
const getSnapshot = () => status
const getServerSnapshot = () => UNKNOWN

/** True if the browser still holds either pre-server-storage cookie. */
export function hasLegacyVTOPCookies(): boolean {
  if (typeof document === 'undefined') return false
  const jar = `; ${document.cookie}`
  return LEGACY_VTOP_COOKIES.some(name => jar.includes(`; ${name}=`))
}

/**
 * Deletes the pre-server-storage cookies and storage keys. The server also expires the cookies
 * (they were JS-written, non-HttpOnly), but call this before `signOut()` so a shared browser
 * keeps nothing for the next account.
 */
export function clearLegacyVTOPClientState(): void {
  if (typeof document === 'undefined') return
  const secure = window.location.protocol === 'https:' ? ';secure' : ''
  for (const name of LEGACY_VTOP_COOKIES) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;samesite=strict${secure}`
  }
  for (const [area, key] of LEGACY_STORAGE_KEYS) {
    try {
      window[area].removeItem(key)
    } catch {
      // Storage disabled (privacy mode): nothing to clear.
    }
  }
}

async function request(init?: RequestInit): Promise<VTOPCredentialStatus> {
  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch {
    throw new VTOPCredentialsRequestError('Network error. Check your connection and try again.', 0)
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Something went wrong. Please try again.'
    throw new VTOPCredentialsRequestError(
      response.status === 401 ? 'Sign in to link your VTOP account.' : message,
      response.status
    )
  }
  const parsed = vtopCredentialStatusSchema.safeParse(body)
  if (!parsed.success) {
    throw new VTOPCredentialsRequestError('Unexpected response from the server.', response.status)
  }
  setStatus(parsed.data)
  return parsed.data
}

/**
 * Fetches `{ linked, username }` from the server (deduplicated while in flight). The server
 * also migrates and expires the legacy cookies on this call.
 */
export function refreshVTOPCredentialStatus(): Promise<VTOPCredentialStatus> {
  inflight ??= request().finally(() => {
    inflight = null
  })
  return inflight
}

/** Stores the credentials server-side. Throws {@link VTOPCredentialsRequestError}. */
export async function linkVTOPCredentials(
  username: string,
  password: string
): Promise<VTOPCredentialStatus> {
  const result = await request({ method: 'PUT', body: JSON.stringify({ username, password }) })
  clearLegacyVTOPClientState()
  return result
}

/** Deletes the server-side credentials and any legacy browser state. */
export async function unlinkVTOPCredentials(): Promise<void> {
  clearLegacyVTOPClientState()
  await request({ method: 'DELETE' })
}

/** Last known status, or null if not fetched yet. */
export function getCachedVTOPCredentialStatus(): VTOPCredentialStatus | null {
  return status
}

/**
 * Subscribes to the link status, fetching it on first use. `null` while unknown (and during
 * SSR). Pass `enabled: false` for signed-out users to skip the request.
 */
export function useVTOPCredentialStatus(enabled = true): VTOPCredentialStatus | null {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  useEffect(() => {
    if (!enabled || status !== null) return
    refreshVTOPCredentialStatus().catch(() => undefined)
  }, [enabled])
  return current
}

/**
 * Mount once near the root of signed-in UI (VTOPProvider). Fetches the link status that the
 * synchronous checks read (without re-rendering the caller), and if the browser still holds the
 * legacy cookies, lets the server import + expire them, then clears them client-side too.
 */
export function useVTOPCredentialBootstrap(): void {
  useEffect(() => {
    const hadLegacy = hasLegacyVTOPCookies()
    if (status !== null && !hadLegacy) return
    refreshVTOPCredentialStatus().then(
      () => {
        if (hadLegacy) clearLegacyVTOPClientState()
      },
      (error: unknown) => {
        // Signed out: drop them. Network / server errors: keep them for the next attempt.
        if (hadLegacy && error instanceof VTOPCredentialsRequestError && error.status === 401) {
          clearLegacyVTOPClientState()
        }
      }
    )
  }, [])
}

/**
 * @deprecated Use {@link useVTOPCredentialStatus} / {@link refreshVTOPCredentialStatus}.
 * Synchronous read of the cached server status (false until fetched).
 */
export function hasVTOPCredentials(): boolean {
  return status?.linked === true
}

/**
 * @deprecated The browser no longer has the password. Omit credentials instead: the server
 * resolves the signed-in user's stored ones. Kept so existing callers (vtop-tool-handler,
 * hub-shell) keep compiling: returns `{ username, encryptedPassword: '' }` when linked; an
 * empty `encryptedPassword` makes every server path fall back to the stored credentials.
 */
export function getFormattedVTOPCredentials(): {
  username: string
  encryptedPassword: string
} | null {
  return status?.linked && status.username
    ? { username: status.username, encryptedPassword: '' }
    : null
}
