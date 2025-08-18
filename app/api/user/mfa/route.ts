import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/mfa-otp'
import { prisma } from '@/lib/prisma'
import { logSecurityEvent, checkRateLimit } from '@/lib/auth/mfa-otp'

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitKey = `mfa-disable-${session.user.email}`
    if (!checkRateLimit(rateLimitKey, 3, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many disable attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
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

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        mfaMethod: null,
        mfaSecret: null,
        tempMfaSecret: null,
        backupCodes: [],
      },
    })

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

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
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
