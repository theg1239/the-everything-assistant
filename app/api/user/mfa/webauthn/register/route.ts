import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateRegistrationOptions } from '@simplewebauthn/server'
import { webAuthnRelyingParty } from '@/lib/mfa-challenge'
import { hasFreshMfa, mfaStepUpRequiredResponse } from '@/lib/session'

/**
 * Registration options for a security key (enrolment, or switching method). When MFA is
 * already enabled this requires a recent MFA verification (step-up).
 */
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        mfaEnabled: true,
        tempMfaMethod: true,
        tempMfaExpires: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!(await hasFreshMfa({ userId: user.id, mfaEnabled: user.mfaEnabled }))) {
      return mfaStepUpRequiredResponse()
    }

    if (!user.tempMfaMethod || user.tempMfaMethod !== 'security_key') {
      return NextResponse.json({ error: 'No WebAuthn setup in progress' }, { status: 400 })
    }

    if (user.tempMfaExpires && new Date() > user.tempMfaExpires) {
      return NextResponse.json({ error: 'Setup session expired' }, { status: 400 })
    }

    const options = await generateRegistrationOptions({
      rpName: 'The Everything Assistant',
      rpID: webAuthnRelyingParty().rpID,
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
