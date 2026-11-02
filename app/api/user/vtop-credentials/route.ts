import { NextResponse } from 'next/server'
import { auth, authAllowingPendingMfa } from '@/lib/auth'
import { logSecurityEvent } from '@/lib/mfa'
import { importLegacyVTOPCookiesForUser } from '@/lib/server-vtop-credentials'
import { VTOPCredentialsConfigError } from '@/lib/vtop-credential-crypto'
import {
  LEGACY_VTOP_COOKIES,
  vtopCredentialInputSchema,
  type VTOPCredentialStatus,
} from '@/lib/vtop-credential-schema'
import {
  deleteVTOPCredentials,
  hasVTOPCredentials,
  saveVTOPCredentials,
  VTOPCredentialValidationError,
} from '@/lib/vtop-credential-store'
import { enforceUserRateLimit, UserRateLimitError } from '@/lib/user-rate-limiter'

/**
 * The signed-in user's VTOP credentials, stored encrypted server-side. No method ever returns
 * the password.
 *
 *   GET    -> { linked, username? }  (also migrates + expires the legacy cookies)
 *   PUT    { username, password } -> { linked: true, username }  (rate limited)
 *   DELETE -> { linked: false }
 */

const NO_STORE = { 'Cache-Control': 'no-store' }

function json(body: VTOPCredentialStatus | { error: string }, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

/** Expires the pre-server-storage cookies on this response, if the request carried any. */
function withLegacyCookiesExpired(request: Request, response: NextResponse): NextResponse {
  const cookieHeader = request.headers.get('cookie') ?? ''
  for (const name of LEGACY_VTOP_COOKIES) {
    if (cookieHeader.includes(`${name}=`)) response.cookies.delete({ name, path: '/' })
  }
  return response
}

function serverError(operation: string, error: unknown) {
  if (error instanceof VTOPCredentialsConfigError) {
    console.error(`[api/user/vtop-credentials] ${operation}: ${error.message}`)
    return json({ error: 'VTOP credential storage is not configured on this server.' }, 503)
  }
  console.error(
    `[api/user/vtop-credentials] ${operation} failed:`,
    error instanceof Error ? error.name : 'unknown error'
  )
  return json({ error: 'Something went wrong. Please try again.' }, 500)
}

async function unauthorized(request: Request) {
  const response = json({ error: 'Unauthorized' }, 401)
  // Fully signed out (not merely mid-MFA): drop legacy cookies so the next account to sign in
  // on this browser (shared lab PCs) can never import them.
  if (!(await authAllowingPendingMfa())) withLegacyCookiesExpired(request, response)
  return response
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized(request)
  const userId = session.user.id
  try {
    let status = await hasVTOPCredentials(userId)
    if (!status.linked) {
      const imported = await importLegacyVTOPCookiesForUser(userId, request)
      if (imported.status === 'imported') status = { linked: true, username: imported.username }
    }
    return withLegacyCookiesExpired(request, json(status))
  } catch (error) {
    return serverError('GET', error)
  }
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized(request)
  const userId = session.user.id

  try {
    await enforceUserRateLimit(userId)
  } catch (error) {
    if (error instanceof UserRateLimitError) {
      return json({ error: 'Too many attempts. Please wait and try again.' }, 429)
    }
    return serverError('rate limit', error)
  }

  const body: unknown = await request.json().catch(() => null)
  const parsed = vtopCredentialInputSchema.safeParse(body)
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid VTOP credentials.' }, 400)
  }

  try {
    const { username } = await saveVTOPCredentials(userId, parsed.data)
    await logSecurityEvent(userId, 'vtop_credentials_linked', {}, request)
    return withLegacyCookiesExpired(request, json({ linked: true, username }))
  } catch (error) {
    if (error instanceof VTOPCredentialValidationError) return json({ error: error.message }, 400)
    return serverError('PUT', error)
  }
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized(request)
  const userId = session.user.id
  try {
    await deleteVTOPCredentials(userId)
    await logSecurityEvent(userId, 'vtop_credentials_unlinked', {}, request)
    return withLegacyCookiesExpired(request, json({ linked: false }))
  } catch (error) {
    return serverError('DELETE', error)
  }
}
