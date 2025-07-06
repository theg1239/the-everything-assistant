import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateAuthenticationOptions } from '@simplewebauthn/server'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        mfaEnabled: true,
        mfaMethod: true,
        mfaSecret: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.mfaEnabled || user.mfaMethod !== 'security_key') {
      return NextResponse.json({ error: 'WebAuthn not enabled for this user' }, { status: 400 })
    }

    if (!user.mfaSecret) {
      return NextResponse.json({ error: 'No WebAuthn credential found' }, { status: 400 })
    }

    let credentialId = user.mfaSecret
    try {
      Buffer.from(credentialId, 'base64url')
    } catch (e) {
      try {
        const buffer = Buffer.from(credentialId, 'base64')
        credentialId = buffer.toString('base64url')
        console.log('Migrating credential ID from base64 to base64url format')
        
        await prisma.user.update({
          where: { id: user.id },
          data: { mfaSecret: credentialId }
        })
      } catch (e2) {
        console.error('❌ Invalid credential ID format:', e2)
        return NextResponse.json({ error: 'Invalid credential format' }, { status: 400 })
      }
    }

    const rpID = process.env.NODE_ENV === 'production' 
      ? process.env.WEBAUTHN_RP_ID || 'the-everything-assistant.vercel.app' 
      : 'localhost'

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: [
        {
          id: credentialId,
          transports: ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
        },
      ],
      userVerification: 'preferred',
      timeout: 300000,
    })

    console.log('Generated WebAuthn authentication options for security_key:', {
      userVerification: options.userVerification,
      allowCredentials: options.allowCredentials?.map(cred => ({
        transports: cred.transports,
        id: typeof cred.id === 'string' ? cred.id.substring(0, 20) + '...' : '[Buffer]'
      })),
      timeout: options.timeout,
      credentialIdStored: credentialId?.substring(0, 20) + '...',
      credentialIdOriginal: user.mfaSecret?.substring(0, 20) + '...',
    })

    await prisma.user.update({
      where: { id: user.id },
      data: {
        tempMfaSecret: options.challenge,
        tempMfaExpires: new Date(Date.now() + 5 * 60 * 1000),
      },
    })

    return NextResponse.json(options)
  } catch (error) {
    console.error('WebAuthn authentication options error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
