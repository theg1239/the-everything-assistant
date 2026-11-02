import { NextResponse } from 'next/server'
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransport,
} from '@simplewebauthn/server'
import { prisma } from '@/lib/prisma'
import { authAllowingPendingMfa, type SessionAllowingPendingMfa } from '@/lib/auth'
import { findBackupCode, getMfaPepper, hashEmailCode, logSecurityEvent, matchTOTP } from '@/lib/mfa'
import {
  claimTotpTimeStep,
  consumeEmailLoginCode,
  storeWebAuthnChallenge,
  takeWebAuthnChallenge,
  type MfaFactor,
  type MfaKv,
} from '@/lib/mfa-state'
import {
  getMfaKv,
  limitVerificationAttempt,
  mfaUnavailableResponse,
  readSessionTokenHash,
  recordCurrentSessionVerification,
  resetVerificationAttemptLimit,
} from '@/lib/session'
import type { WebAuthnAuthenticationCredential } from '@/types/api/mfa'

/**
 * The MFA challenge (login and step-up): verifies a factor for the signed-in user and, in the
 * same request, records the session as MFA-verified (`lib/session.ts`). These handlers accept
 * sessions that are still pending MFA; every other route goes through `auth()`, which doesn't.
 */

const VALID_TRANSPORTS: AuthenticatorTransport[] = ['usb', 'nfc', 'ble', 'hybrid', 'internal']
const VALID_TRANSPORT_SET: ReadonlySet<string> = new Set(VALID_TRANSPORTS)

function isAuthenticatorTransport(transport: string): transport is AuthenticatorTransport {
  return VALID_TRANSPORT_SET.has(transport)
}

/** WebAuthn relying party for the current environment. */
export function webAuthnRelyingParty(): { rpID: string; origin: string } {
  if (process.env.NODE_ENV !== 'production') {
    return { rpID: 'localhost', origin: 'http://localhost:3000' }
  }
  return {
    rpID: process.env.WEBAUTHN_RP_ID || 'everything-assistant.com',
    origin: process.env.WEBAUTHN_ORIGIN || 'https://everything-assistant.com',
  }
}

interface ChallengeContext {
  session: SessionAllowingPendingMfa
  kv: MfaKv
  tokenHash: string
}

async function challengeContext(): Promise<ChallengeContext | NextResponse> {
  const session = await authAllowingPendingMfa()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const kv = getMfaKv()
  const tokenHash = await readSessionTokenHash()
  if (!kv || !tokenHash) return mfaUnavailableResponse()
  return { session, kv, tokenHash }
}

function badRequest(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status })
}

/** Records the verification on the session, then answers `{ success: true, message }`. */
async function completeChallenge(
  context: ChallengeContext,
  userId: string,
  factor: MfaFactor,
  request: Request,
  message: string
): Promise<NextResponse> {
  try {
    await recordCurrentSessionVerification({
      userId,
      factor,
      sessionExpires: context.session.expires,
    })
  } catch (error) {
    console.error('[mfa] failed to record session verification', error)
    return mfaUnavailableResponse()
  }
  await resetVerificationAttemptLimit(context.kv, userId, request)
  await logSecurityEvent(userId, 'MFA_LOGIN_SUCCESS', { method: factor }, request)
  return NextResponse.json({ success: true, message })
}

type FactorOutcome =
  { ok: true; factor: MfaFactor; message: string } | { ok: false; error: string; status?: number }

interface ChallengeUser {
  id: string
  mfaMethod: string | null
  mfaSecret: string | null
  backupCodes: string[]
}

async function verifyBackupCodeFactor(user: ChallengeUser, code: string): Promise<FactorOutcome> {
  const match = findBackupCode(code, user.backupCodes, getMfaPepper())
  if (!match) return { ok: false, error: 'Invalid backup code' }
  const remaining = user.backupCodes.filter((_, index) => index !== match.index)
  // Optimistic concurrency: only consume if the list is unchanged since we read it, so the
  // same code can't be redeemed twice by parallel requests.
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, backupCodes: { equals: user.backupCodes } },
    data: { backupCodes: remaining },
  })
  if (count !== 1) {
    return { ok: false, error: 'Backup code could not be used. Please try again.', status: 409 }
  }
  return {
    ok: true,
    factor: 'backup_code',
    message: `Backup code used successfully. ${remaining.length} backup codes remaining.`,
  }
}

async function verifyCodeFactor(
  kv: MfaKv,
  user: ChallengeUser,
  code: string
): Promise<FactorOutcome> {
  if (user.mfaMethod === 'authenticator') {
    if (!user.mfaSecret) return { ok: false, error: 'Authenticator is not set up' }
    const match = matchTOTP(code, user.mfaSecret)
    if (!match) return { ok: false, error: 'Invalid verification code' }
    const fresh = await claimTotpTimeStep(kv, {
      userId: user.id,
      secret: user.mfaSecret,
      timeStep: match.timeStep,
    })
    if (!fresh) {
      return { ok: false, error: 'This code was already used. Wait for the next code.' }
    }
    return { ok: true, factor: 'authenticator', message: 'MFA verification successful' }
  }
  if (user.mfaMethod === 'email') {
    const consumed = await consumeEmailLoginCode(kv, {
      userId: user.id,
      codeHash: hashEmailCode(code, getMfaPepper()),
    })
    if (!consumed) return { ok: false, error: 'Invalid or expired verification code' }
    return { ok: true, factor: 'email', message: 'MFA verification successful' }
  }
  if (user.mfaMethod === 'security_key') {
    return { ok: false, error: 'Use your security key or a backup code' }
  }
  return { ok: false, error: 'Invalid verification code' }
}

/**
 * `POST /api/auth/mfa-verify` and `POST /api/user/mfa/verify-login`: a code from the user's
 * method (authenticator TOTP or emailed code) or a backup code.
 */
export async function handleCodeChallenge(
  request: Request,
  input: { kind: 'code' | 'backup_code'; code: string }
): Promise<NextResponse> {
  const context = await challengeContext()
  if (context instanceof NextResponse) return context

  const user = await prisma.user.findUnique({
    where: { id: context.session.user.id },
    select: { id: true, mfaEnabled: true, mfaMethod: true, mfaSecret: true, backupCodes: true },
  })
  if (!user || !user.mfaEnabled) return badRequest('MFA not enabled')

  const limited = await limitVerificationAttempt(context.kv, user.id, request)
  if (limited) return limited

  const outcome =
    input.kind === 'backup_code'
      ? await verifyBackupCodeFactor(user, input.code)
      : await verifyCodeFactor(context.kv, user, input.code)

  if (!outcome.ok) {
    await logSecurityEvent(
      user.id,
      'MFA_LOGIN_FAILED',
      { method: input.kind === 'backup_code' ? 'backup_code' : user.mfaMethod },
      request
    )
    return badRequest(outcome.error, outcome.status)
  }
  return completeChallenge(context, user.id, outcome.factor, request, outcome.message)
}

/** `POST /api/user/mfa/webauthn/authenticate` without a credential: assertion options. */
export async function handleWebAuthnAssertionOptions(): Promise<NextResponse> {
  const context = await challengeContext()
  if (context instanceof NextResponse) return context

  const user = await prisma.user.findUnique({
    where: { id: context.session.user.id },
    select: {
      id: true,
      mfaEnabled: true,
      mfaMethod: true,
      webAuthnCredentials: { select: { credentialId: true, transports: true } },
    },
  })
  if (!user || !user.mfaEnabled || user.mfaMethod !== 'security_key') {
    return badRequest('WebAuthn not enabled for this user')
  }

  const options = await generateAuthenticationOptions({
    rpID: webAuthnRelyingParty().rpID,
    timeout: 120000,
    userVerification: 'preferred',
    allowCredentials: user.webAuthnCredentials.map(cred => ({
      id: cred.credentialId,
      transports: cred.transports.filter(isAuthenticatorTransport),
    })),
  })

  try {
    await storeWebAuthnChallenge(context.kv, context.tokenHash, {
      userId: user.id,
      challenge: options.challenge,
    })
  } catch (error) {
    console.error('[mfa] failed to store WebAuthn challenge', error)
    return mfaUnavailableResponse()
  }
  return NextResponse.json(options)
}

/**
 * `POST /api/user/mfa/webauthn/verify-auth` (and `/authenticate` with a credential): verifies
 * a security-key assertion against the challenge issued to this session.
 */
export async function handleWebAuthnAssertion(
  request: Request,
  credential: WebAuthnAuthenticationCredential
): Promise<NextResponse> {
  const context = await challengeContext()
  if (context instanceof NextResponse) return context

  const user = await prisma.user.findUnique({
    where: { id: context.session.user.id },
    select: {
      id: true,
      mfaEnabled: true,
      mfaMethod: true,
      webAuthnCredentials: {
        select: { id: true, credentialId: true, publicKey: true, counter: true, transports: true },
      },
    },
  })
  if (!user || !user.mfaEnabled || user.mfaMethod !== 'security_key') {
    return badRequest('WebAuthn not enabled for this user')
  }

  const limited = await limitVerificationAttempt(context.kv, user.id, request)
  if (limited) return limited

  const expectedChallenge = await takeWebAuthnChallenge(context.kv, context.tokenHash, user.id)
  if (!expectedChallenge) {
    return badRequest('Authentication challenge missing or expired. Please try again.')
  }

  const stored = user.webAuthnCredentials.find(c => c.credentialId === credential.id)
  if (!stored) {
    await logSecurityEvent(
      user.id,
      'MFA_WEBAUTHN_AUTH_FAILED',
      { method: user.mfaMethod, reason: 'no_matching_credential' },
      request
    )
    return badRequest('No matching credential found')
  }

  const filteredTransports = stored.transports.filter(isAuthenticatorTransport)
  const { rpID, origin } = webAuthnRelyingParty()

  let verified = false
  let newCounter: number | undefined
  try {
    const verification = await verifyAuthenticationResponse({
      response: {
        id: credential.id,
        rawId: credential.rawId,
        type: credential.type,
        response: {
          authenticatorData: credential.response.authenticatorData,
          clientDataJSON: credential.response.clientDataJSON,
          signature: credential.response.signature,
          userHandle: credential.response.userHandle ?? undefined,
        },
        clientExtensionResults: credential.clientExtensionResults ?? {},
      },
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: Number(stored.counter),
        transports: filteredTransports.length ? filteredTransports : VALID_TRANSPORTS,
      },
      requireUserVerification: false,
    })
    verified = verification.verified
    newCounter = verification.authenticationInfo?.newCounter
  } catch (error) {
    console.error('[mfa] WebAuthn assertion verification error', error)
  }

  if (!verified) {
    await logSecurityEvent(
      user.id,
      'MFA_WEBAUTHN_AUTH_FAILED',
      { method: user.mfaMethod, reason: 'verification_failed' },
      request
    )
    return badRequest('WebAuthn authentication failed')
  }

  if (newCounter !== undefined) {
    await prisma.webAuthnCredential.update({
      where: { id: stored.id },
      data: { counter: BigInt(newCounter), lastUsedAt: new Date() },
    })
  }

  return completeChallenge(
    context,
    user.id,
    'security_key',
    request,
    'WebAuthn authentication successful'
  )
}
