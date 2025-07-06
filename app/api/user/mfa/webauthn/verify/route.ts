import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateBackupCodes, hashBackupCodes, logSecurityEvent } from '@/lib/mfa'
import { verifyRegistrationResponse } from '@simplewebauthn/server'
import type { VerifyRegistrationResponseOpts } from '@simplewebauthn/server'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { credential, method } = await request.json()
    
    if (!credential || !method || method !== 'security_key') {
      return NextResponse.json({ error: 'Invalid credential or method' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        tempMfaMethod: true,
        tempMfaSecret: true, // This contains the challenge
        tempMfaExpires: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

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
      // Log the credential structure for debugging
      console.log('Received credential structure:', {
        id: credential.id,
        type: credential.type,
        rawIdType: typeof credential.rawId,
        responseType: typeof credential.response,
        hasAttestationObject: !!credential.response?.attestationObject,
        hasClientDataJSON: !!credential.response?.clientDataJSON,
      })

      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: user.tempMfaSecret,
        expectedOrigin: process.env.NODE_ENV === 'production' 
          ? process.env.WEBAUTHN_ORIGIN || 'https://the-everything-assistant.vercel.app'
          : 'http://localhost:3000',
        expectedRPID: process.env.NODE_ENV === 'production' 
          ? process.env.WEBAUTHN_RP_ID || 'the-everything-assistant.vercel.app' 
          : 'localhost',
        requireUserVerification: false, // Keep false for compatibility
      } as VerifyRegistrationResponseOpts)

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
      const credentialID = webauthnCredential.id
      const credentialPublicKey = webauthnCredential.publicKey
      const signatureCounter = webauthnCredential.counter

      // Convert Uint8Array to base64url for consistent storage and retrieval
      const credentialIdBase64url = Buffer.from(credentialID).toString('base64url')

      const backupCodes = generateBackupCodes()
      const hashedBackupCodes = hashBackupCodes(backupCodes)

      await prisma.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: true,
          mfaMethod: method,
          mfaSecret: credentialIdBase64url,
          tempMfaSecret: null,
          tempMfaMethod: null,
          tempMfaExpires: null,
          backupCodes: hashedBackupCodes,
        },
      })

      await logSecurityEvent(
        user.id, 
        'MFA_WEBAUTHN_ENABLED', 
        { method, credentialId: credentialIdBase64url }, 
        request
      )

      return NextResponse.json({
        success: true,
        message: 'Security key registered successfully (supports both platform authenticators and external keys)',
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
