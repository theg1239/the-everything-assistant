import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateBackupCodes, getMfaPepper, hashBackupCodes, logSecurityEvent } from '@/lib/mfa'
import { consumeRateLimit } from '@/lib/mfa-state'
import {
  getMfaKv,
  hasFreshMfa,
  mfaStepUpRequiredResponse,
  mfaUnavailableResponse,
} from '@/lib/session'

/** Regenerates backup codes. Requires a recent MFA verification (step-up). */
export async function POST(request: NextRequest) {
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
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA is not enabled' }, { status: 400 })
    }

    if (!(await hasFreshMfa({ userId: user.id, mfaEnabled: user.mfaEnabled }))) {
      return mfaStepUpRequiredResponse()
    }

    const kv = getMfaKv()
    if (!kv) return mfaUnavailableResponse()
    if (
      !(await consumeRateLimit(kv, `backup-codes:${user.id}`, { max: 3, windowSeconds: 60 * 60 }))
    ) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const backupCodes = generateBackupCodes(10)
    const hashedBackupCodes = hashBackupCodes(backupCodes, getMfaPepper())

    await prisma.user.update({
      where: { id: user.id },
      data: {
        backupCodes: hashedBackupCodes,
      },
    })

    await logSecurityEvent(
      user.id,
      'MFA_BACKUP_CODES_REGENERATED',
      {
        method: 'backup_codes',
      },
      request
    )

    return NextResponse.json({
      success: true,
      backupCodes,
      message: 'Backup codes regenerated successfully',
    })
  } catch (error) {
    console.error('Backup codes regeneration error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
