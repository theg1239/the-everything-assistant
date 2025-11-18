import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/mfa'
import {
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
  type AuthenticatorTransport,
} from '@simplewebauthn/server'
import { webAuthnVerifyAuthSchema } from '@/types/api/mfa'

const VALID_TRANSPORTS: AuthenticatorTransport[] = ['usb', 'nfc', 'ble', 'hybrid', 'internal']

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawBody = await request.json().catch(() => null)
  const parsedBody = webAuthnVerifyAuthSchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Credential is required' }, { status: 400 })
  }
  const { credential } = parsedBody.data

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

  const credentialPublicKey = Buffer.isBuffer(stored.publicKey)
    ? new Uint8Array(stored.publicKey)
    : new Uint8Array(Buffer.from(stored.publicKey))

  const prevCounter = typeof stored.counter === 'bigint' ? Number(stored.counter) : stored.counter

  const formattedResponse = {
    id: credential.id,
    rawId: credential.rawId,
    type: credential.type,
    response: {
      authenticatorData: credential.response.authenticatorData,
      clientDataJSON: credential.response.clientDataJSON,
      signature: credential.response.signature,
      userHandle: credential.response.userHandle ?? undefined,
    },
    clientExtensionResults: credential.clientExtensionResults || {},
  }

  const filteredTransports: AuthenticatorTransport[] = stored.transports.filter(
    (t): t is AuthenticatorTransport => VALID_TRANSPORTS.includes(t as AuthenticatorTransport)
  )
  const transportsToUse = filteredTransports.length ? filteredTransports : VALID_TRANSPORTS

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

    if (verification.authenticationInfo?.newCounter !== undefined) {
      await prisma.webAuthnCredential.update({
        where: { id: stored.id },
        data: {
          counter: BigInt(verification.authenticationInfo.newCounter),
          lastUsedAt: new Date(),
        },
      })
    }

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
