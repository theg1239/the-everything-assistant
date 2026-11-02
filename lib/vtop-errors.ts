/**
 * Structured classification of failed `queryVTOP` results. Reads only the fields the proxy and
 * the tool set (`success`, `requiresCredentials`, `errorKind`), never the error wording.
 * Kinds: services/proxy-service/src/cli/errors.js.
 */
import { isRecord } from '@/lib/json'

/** VTOP rejected the stored login: re-linking (not resubmitting) is the only fix. */
export const STALE_CREDENTIAL_ERROR_KINDS: ReadonlySet<string> = new Set([
  'invalid_credentials',
  'login_failed',
  'missing_credentials',
])

/** VTOP itself refused the username/password (or locked the account after failed logins). */
export const AUTH_REJECTED_ERROR_KINDS: ReadonlySet<string> = new Set([
  'invalid_credentials',
  'login_failed',
  'account_locked',
])

export type VtopFailure =
  /** The call succeeded or is a pending workflow step. */
  | 'none'
  /** VTOP refused the login: show "login failed" and offer re-linking. */
  | 'auth_rejected'
  /** No usable credentials were available (nothing linked yet). */
  | 'needs_credentials'
  /** Any other failure (VTOP down, timeout, invalid input, ...). */
  | 'other'

const errorKindOf = (result: Record<string, unknown>) =>
  typeof result.errorKind === 'string' ? result.errorKind : undefined

export function classifyVtopFailure(result: unknown): VtopFailure {
  if (!isRecord(result)) return 'none'
  const kind = errorKindOf(result)
  if (kind !== undefined && AUTH_REJECTED_ERROR_KINDS.has(kind)) return 'auth_rejected'
  if (result.requiresCredentials === true) return 'needs_credentials'
  if (result.success === false) return 'other'
  return 'none'
}

/** The stored credentials were rejected (or are missing server-side): open the re-link dialog. */
export const rejectedStoredCredentials = (result: unknown): boolean => {
  if (!isRecord(result)) return false
  const kind = errorKindOf(result)
  return kind !== undefined && STALE_CREDENTIAL_ERROR_KINDS.has(kind)
}

/** The result asks the user to (re)link VTOP credentials. */
export const requiresVtopCredentials = (result: unknown): boolean =>
  isRecord(result) && (result.requiresCredentials === true || rejectedStoredCredentials(result))
