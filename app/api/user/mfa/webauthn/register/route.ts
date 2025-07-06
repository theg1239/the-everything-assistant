import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateRegistrationOptions } from '@simplewebauthn/server'

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
        tempMfaMethod: true,
        tempMfaExpires: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.tempMfaMethod || user.tempMfaMethod !== 'security_key') {
      return NextResponse.json({ error: 'No WebAuthn setup in progress' }, { status: 400 })
    }

    if (user.tempMfaExpires && new Date() > user.tempMfaExpires) {
      return NextResponse.json({ error: 'Setup session expired' }, { status: 400 })
    }

    const options = await generateRegistrationOptions({
      rpName: 'The Everything Assistant',
      rpID:
        process.env.NODE_ENV === 'production'
          ? process.env.WEBAUTHN_RP_ID || 'the-everything-assistant.vercel.app'
          : 'localhost',
      userID: new TextEncoder().encode(session.user.email),
      userName: session.user.email,
      userDisplayName: session.user.name || session.user.email,
      timeout: 120000,
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: undefined,
        userVerification: 'preferred',
        requireResidentKey: false,
        residentKey: 'discouraged',
      },
      supportedAlgorithmIDs: [-7, -257],
      excludeCredentials: [],
    })

    console.log(
      'Generated WebAuthn options for security_key:',
      JSON.stringify(
        {
          rpName: options.rp.name,
          rpID: options.rp.id,
          userEmail: session.user.email,
          timeout: options.timeout,
          authenticatorSelection: options.authenticatorSelection,
        },
        null,
        2
      )
    )

    await prisma.user.update({
      where: { id: user.id },
      data: {
        tempMfaSecret: options.challenge,
      },
    })

    return NextResponse.json(options)
  } catch (error) {
    console.error('WebAuthn registration options error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
