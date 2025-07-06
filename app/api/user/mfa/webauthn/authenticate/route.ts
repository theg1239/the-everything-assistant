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
        webAuthnCredentials: {
          select: {
            credentialId: true,
            publicKey: true,
            counter: true,
            transports: true,
            name: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.mfaEnabled || user.mfaMethod !== 'security_key') {
      return NextResponse.json({ error: 'WebAuthn not enabled for this user' }, { status: 400 })
    }

    if (!user.webAuthnCredentials || user.webAuthnCredentials.length === 0) {
      return NextResponse.json({ error: 'No WebAuthn credentials found' }, { status: 400 })
    }

    const rpID = process.env.NODE_ENV === 'production' 
      ? process.env.WEBAUTHN_RP_ID || 'the-everything-assistant.vercel.app' 
      : 'localhost'

    const allowCredentials = user.webAuthnCredentials.map(cred => ({
      id: cred.credentialId,
      transports: cred.transports.length > 0 ? cred.transports : ['usb', 'nfc', 'ble', 'hybrid', 'internal'],
    }))

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
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
      credentialCount: user.webAuthnCredentials.length,
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
