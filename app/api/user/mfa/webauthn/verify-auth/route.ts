import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/mfa-otp'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/auth/mfa-otp'
import {
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
  type AuthenticatorTransport,
} from '@simplewebauthn/server'

const VALID_TRANSPORTS: AuthenticatorTransport[] = ['usb', 'nfc', 'ble', 'hybrid', 'internal']

export async function POST(request: NextRequest) {
  // 1) Ensure user is signed in
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2) Parse incoming credential from client
  const { credential } = await request.json()
  if (!credential) {
    return NextResponse.json({ error: 'Credential is required' }, { status: 400 })
  }

  // 3) Load user and their stored WebAuthn credentials
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      mfaEnabled: true,
      mfaMethod: true,
      tempMfaSecret: true,
      tempMfaExpires: true,
      webAuthnCredentials: {
        select: {
          id: true,
          credentialId: true,
          publicKey: true, // Buffer | Uint8Array
          counter: true,
          transports: true, // string[]
        },
      },
    },
  })

  if (
    !user ||
    !user.mfaEnabled ||
    user.mfaMethod !== 'security_key' ||
    !user.tempMfaSecret ||
    (user.tempMfaExpires && new Date() > user.tempMfaExpires)
  ) {
    return NextResponse.json(
      { error: 'WebAuthn not enabled or challenge missing/expired' },
      { status: 400 }
    )
  }

  // 4) Find the matching stored credential
  const stored = user.webAuthnCredentials.find(c => c.credentialId === credential.id)
  if (!stored) {
    await logSecurityEvent(
      user.id,
      'MFA_WEBAUTHN_AUTH_FAILED',
      {
        method: user.mfaMethod,
        credentialId: credential.id,
        reason: 'no_matching_credential',
      },
      request
    )
    return NextResponse.json({ error: 'No matching credential found' }, { status: 400 })
  }

  // 5) Convert stored.publicKey (Buffer or Uint8Array) into a Node Buffer
  const credentialPublicKey = Buffer.isBuffer(stored.publicKey)
    ? stored.publicKey
    : Buffer.from(stored.publicKey)

  // 6) Normalize the counter
  const prevCounter = typeof stored.counter === 'bigint' ? Number(stored.counter) : stored.counter

  // 7) Reconstruct the client's assertion object
  const formattedResponse = {
    id: credential.id,
    rawId: credential.rawId,
    type: credential.type,
    response: {
      authenticatorData: credential.response.authenticatorData,
      clientDataJSON: credential.response.clientDataJSON,
      signature: credential.response.signature,
      userHandle: credential.response.userHandle,
    },
    clientExtensionResults: credential.clientExtensionResults || {},
  }

  // 8) Filter transports down to the spec-defined set
  const filteredTransports: AuthenticatorTransport[] = stored.transports.filter(
    (t): t is AuthenticatorTransport => VALID_TRANSPORTS.includes(t as AuthenticatorTransport)
  )
  const transportsToUse = filteredTransports.length ? filteredTransports : VALID_TRANSPORTS

  // 9) Build the VerifyAuthenticationResponseOpts
  const verificationOpts: VerifyAuthenticationResponseOpts = {
    response: formattedResponse,
    expectedChallenge: user.tempMfaSecret,
    expectedOrigin:
      process.env.NODE_ENV === 'production'
        ? process.env.WEBAUTHN_ORIGIN!
        : 'http://localhost:3000',
    expectedRPID: process.env.NODE_ENV === 'production' ? process.env.WEBAUTHN_RP_ID! : 'localhost',
    credential: {
      id: stored.credentialId, // base64url string
      publicKey: credentialPublicKey,
      counter: prevCounter,
      transports: transportsToUse,
    },
    requireUserVerification: false,
  }

  // 10) Perform verification
  try {
    const verification = await verifyAuthenticationResponse(verificationOpts)

    if (!verification.verified) {
      await logSecurityEvent(
        user.id,
        'MFA_WEBAUTHN_AUTH_FAILED',
        {
          method: user.mfaMethod,
          credentialId: stored.credentialId,
          reason: 'verification_failed',
        },
        request
      )
      return NextResponse.json({ error: 'WebAuthn authentication failed' }, { status: 400 })
    }

    // 11) Persist the new counter to prevent replay
    if (verification.authenticationInfo?.newCounter !== undefined) {
      await prisma.webAuthnCredential.update({
        where: { id: stored.id },
        data: {
          counter: BigInt(verification.authenticationInfo.newCounter),
          lastUsedAt: new Date(),
        },
      })
    }

    // 12) Clear the one-time challenge
    await prisma.user.update({
      where: { id: user.id },
      data: { tempMfaSecret: null, tempMfaExpires: null },
    })

    await logSecurityEvent(
      user.id,
      'MFA_WEBAUTHN_AUTH_SUCCESS',
      { method: user.mfaMethod, credentialId: stored.credentialId },
      request
    )
    return NextResponse.json({ success: true, message: 'WebAuthn authentication successful' })
  } catch (err: any) {
    console.error('🔐 WebAuthn authentication error:', err)
    await logSecurityEvent(
      user.id,
      'MFA_WEBAUTHN_AUTH_ERROR',
      { method: user.mfaMethod, error: String(err) },
      request
    )
    return NextResponse.json({ error: 'WebAuthn authentication failed' }, { status: 400 })
  }
}
