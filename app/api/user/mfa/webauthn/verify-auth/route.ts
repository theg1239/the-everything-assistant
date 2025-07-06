import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/mfa'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { credential } = await request.json()
    
    if (!credential) {
      return NextResponse.json({ error: 'Credential is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        mfaEnabled: true,
        mfaMethod: true,
        mfaSecret: true,
        tempMfaSecret: true,
        tempMfaExpires: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.mfaEnabled || user.mfaMethod !== 'security_key') {
      return NextResponse.json({ error: 'WebAuthn not enabled for this user' }, { status: 400 })
    }

    if (!user.tempMfaSecret) {
      return NextResponse.json({ error: 'No authentication challenge found' }, { status: 400 })
    }

    if (user.tempMfaExpires && new Date() > user.tempMfaExpires) {
      return NextResponse.json({ error: 'Authentication challenge expired' }, { status: 400 })
    }

    try {
      // Log the received credential for debugging
      console.log('🔐 Received WebAuthn credential:', {
        id: credential.id,
        type: credential.type,
        rawIdType: typeof credential.rawId,
        responseType: typeof credential.response,
      })

      // Convert credential ID to base64url format for comparison
      let credentialIdBase64url = credential.id
      if (credential.rawId) {
        // If rawId is present, convert it to base64url
        const rawIdArray = new Uint8Array(credential.rawId)
        credentialIdBase64url = Buffer.from(rawIdArray).toString('base64url')
      }

      // Handle potential migration from old base64 format
      let storedCredentialId = user.mfaSecret
      if (storedCredentialId) {
        try {
          // Try to decode as base64url first
          Buffer.from(storedCredentialId, 'base64url')
        } catch (e) {
          // If that fails, try base64 and convert to base64url
          try {
            const buffer = Buffer.from(storedCredentialId, 'base64')
            storedCredentialId = buffer.toString('base64url')
            console.log('🔄 Migrating stored credential ID from base64 to base64url format during auth')
          } catch (e2) {
            console.error('❌ Invalid stored credential ID format:', e2)
          }
        }
      }

      console.log('🔐 Comparing credential IDs:', {
        received: credentialIdBase64url,
        stored: storedCredentialId,
        match: credentialIdBase64url === storedCredentialId
      })

      // For now, we'll do a basic credential ID verification
      // In a full implementation, you'd verify the signature using the stored public key
      if (!credentialIdBase64url || credentialIdBase64url !== storedCredentialId) {
        await logSecurityEvent(
          user.id,
          'MFA_WEBAUTHN_AUTH_FAILED',
          { method: user.mfaMethod, credentialId: storedCredentialId, receivedId: credentialIdBase64url },
          request
        )
        return NextResponse.json({ error: 'WebAuthn authentication failed' }, { status: 400 })
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          tempMfaSecret: null,
          tempMfaExpires: null,
        },
      })

      await logSecurityEvent(
        user.id,
        'MFA_WEBAUTHN_AUTH_SUCCESS',
        { method: user.mfaMethod, credentialId: user.mfaSecret },
        request
      )

      return NextResponse.json({
        success: true,
        message: 'WebAuthn authentication successful',
      })
    } catch (verificationError) {
      console.error('WebAuthn authentication error:', verificationError)
      await logSecurityEvent(
        user.id,
        'MFA_WEBAUTHN_AUTH_ERROR',
        { method: user.mfaMethod, error: String(verificationError) },
        request
      )
      return NextResponse.json({ error: 'WebAuthn authentication failed' }, { status: 400 })
    }
  } catch (error) {
    console.error('WebAuthn authentication error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
