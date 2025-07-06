import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateAuthenticationOptions } from '@simplewebauthn/server'
import type {
  PublicKeyCredentialDescriptor,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server'

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
            transports: true,
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
    if (user.webAuthnCredentials.length === 0) {
      return NextResponse.json({ error: 'No WebAuthn credentials found' }, { status: 400 })
    }

    const rpID =
      process.env.NODE_ENV === 'production'
        ? process.env.WEBAUTHN_RP_ID || 'the-everything-assistant.vercel.app'
        : 'localhost'

    const allowCredentials: PublicKeyCredentialDescriptor[] = user.webAuthnCredentials.map(
      cred => ({
        id: cred.credentialId,
        type: 'public-key',
        transports: (cred.transports.length > 0
          ? cred.transports
          : ['usb', 'nfc', 'ble', 'hybrid', 'internal']) as AuthenticatorTransportFuture[],
      })
    )

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
      timeout: 300_000,
    })

    console.log('Generated WebAuthn authentication options:', {
      userVerification: options.userVerification,
      allowCredentials: options.allowCredentials?.map(c => ({
        id: typeof c.id === 'string' ? c.id.slice(0, 10) + '…' : '[Buffer]',
        transports: c.transports,
      })),
      timeout: options.timeout,
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
