import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateBackupCodes, getMfaPepper, hashBackupCodes, logSecurityEvent } from '@/lib/mfa'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import type { VerifyRegistrationResponseOpts } from '@simplewebauthn/server'
import { webAuthnRelyingParty } from '@/lib/mfa-challenge'
import {
  getMfaKv,
  hasFreshMfa,
  limitVerificationAttempt,
  mfaStepUpRequiredResponse,
  mfaUnavailableResponse,
  recordCurrentSessionVerification,
} from '@/lib/session'
import { webAuthnRegistrationSchema } from '@/types/api/mfa'

/**
 * Completes security-key registration (enrolment, or switching method). When MFA is already
 * enabled this requires a recent MFA verification (step-up); on enrolment the session is
 * marked MFA-verified.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsedBody = webAuthnRegistrationSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid credential or method' }, { status: 400 })
    }
    const { credential, method } = parsedBody.data

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        mfaEnabled: true,
        tempMfaMethod: true,
        tempMfaSecret: true,
        tempMfaExpires: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!(await hasFreshMfa({ userId: user.id, mfaEnabled: user.mfaEnabled }))) {
      return mfaStepUpRequiredResponse()
    }

    const kv = getMfaKv()
    if (!kv) return mfaUnavailableResponse()
    const limited = await limitVerificationAttempt(kv, user.id, request)
    if (limited) return limited

    if (user.tempMfaMethod !== method) {
      return NextResponse.json({ error: 'Method mismatch' }, { status: 400 })
    }

    if (user.tempMfaExpires && new Date() > user.tempMfaExpires) {
      return NextResponse.json({ error: 'Setup session expired' }, { status: 400 })
    }

    if (!user.tempMfaSecret) {
      return NextResponse.json({ error: 'No challenge found' }, { status: 400 })
    }

    try {
      const verificationOpts: VerifyRegistrationResponseOpts = {
        response: {
          ...credential,
          clientExtensionResults: credential.clientExtensionResults ?? {},
        },
        expectedChallenge: user.tempMfaSecret,
        expectedOrigin: webAuthnRelyingParty().origin,
        expectedRPID: webAuthnRelyingParty().rpID,
        requireUserVerification: false,
      }
      const verification = await verifyRegistrationResponse(verificationOpts)

      if (!verification.verified || !verification.registrationInfo) {
        await logSecurityEvent(
          user.id,
          'MFA_WEBAUTHN_VERIFICATION_FAILED',
          { method, credentialId: credential.id },
          request
        )
        return NextResponse.json({ error: 'WebAuthn verification failed' }, { status: 400 })
      }

      const registrationInfo = verification.registrationInfo
      const webauthnCredential = registrationInfo.credential
      const credentialPublicKey = webauthnCredential.publicKey
      const signatureCounter = webauthnCredential.counter

      const credentialIdBase64url = credential.id

      const backupCodes = generateBackupCodes()
      const hashedBackupCodes = hashBackupCodes(backupCodes, getMfaPepper())

      await prisma.webAuthnCredential.create({
        data: {
          userId: user.id,
          credentialId: credentialIdBase64url,
          publicKey: Buffer.from(credentialPublicKey),
          counter: BigInt(signatureCounter),
          transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
          name: 'Security Key',
        },
      })

      await prisma.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: true,
          mfaMethod: method,
          // Switching from an authenticator app: drop its TOTP secret like the other paths do.
          mfaSecret: null,
          tempMfaSecret: null,
          tempMfaMethod: null,
          tempMfaExpires: null,
          backupCodes: hashedBackupCodes,
        },
      })

      if (!user.mfaEnabled) {
        try {
          await recordCurrentSessionVerification({
            userId: user.id,
            factor: 'security_key',
            sessionExpires: session.expires,
          })
        } catch (error) {
          console.error('[mfa] failed to record verification after enrolment', error)
        }
      }

      await logSecurityEvent(
        user.id,
        'MFA_WEBAUTHN_ENABLED',
        { method, credentialId: credentialIdBase64url },
        request
      )

      return NextResponse.json({
        success: true,
        message:
          'Security key registered successfully (supports both platform authenticators and external keys)',
        backupCodes,
        mfaEnabled: true,
        mfaMethod: method,
      })
    } catch (verificationError) {
      console.error('WebAuthn verification error:', verificationError)
      await logSecurityEvent(
        user.id,
        'MFA_WEBAUTHN_VERIFICATION_ERROR',
        { method, error: String(verificationError) },
        request
      )
      return NextResponse.json({ error: 'WebAuthn verification failed' }, { status: 400 })
    }
  } catch (error) {
    console.error('WebAuthn verification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
