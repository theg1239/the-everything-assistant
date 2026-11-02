import { NextRequest, NextResponse } from 'next/server'
import { auth, authAllowingPendingMfa } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent } from '@/lib/mfa'
import { hasFreshMfa, mfaStepUpRequiredResponse } from '@/lib/session'

/** Disables MFA. Requires a recent MFA verification (step-up). */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        mfaEnabled: true,
        mfaMethod: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (!user.mfaEnabled) {
      return NextResponse.json(
        { error: 'MFA is not currently enabled for this account' },
        { status: 400 }
      )
    }
    if (!(await hasFreshMfa({ userId: user.id, mfaEnabled: user.mfaEnabled }))) {
      return mfaStepUpRequiredResponse()
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: false,
          mfaMethod: null,
          mfaSecret: null,
          tempMfaSecret: null,
          tempMfaMethod: null,
          tempMfaExpires: null,
          backupCodes: [],
        },
      }),
      // A disabled factor must not linger: re-enabling security keys registers a new one.
      prisma.webAuthnCredential.deleteMany({ where: { userId: user.id } }),
    ])

    await logSecurityEvent(user.id, 'MFA_DISABLED', { previousMethod: user.mfaMethod }, request)

    return NextResponse.json({
      success: true,
      message: 'MFA has been successfully disabled',
    })
  } catch (error) {
    console.error('MFA disable error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** MFA status. Also used by the MFA challenge, so it accepts sessions pending MFA. */
export async function GET() {
  try {
    const session = await authAllowingPendingMfa()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        mfaEnabled: true,
        mfaMethod: true,
        backupCodes: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      mfaEnabled: user.mfaEnabled,
      mfaMethod: user.mfaMethod,
      hasBackupCodes: user.backupCodes.length > 0,
      backupCodesCount: user.backupCodes.length,
    })
  } catch (error) {
    console.error('MFA status check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
