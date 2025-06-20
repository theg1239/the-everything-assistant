import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateBackupCodes, hashBackupCodes, checkRateLimit, logSecurityEvent } from '@/lib/mfa'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitKey = `mfa-backup-${session.user.email}`
    if (!checkRateLimit(rateLimitKey, 3, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        mfaEnabled: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA is not enabled' }, { status: 400 })
    }

    const backupCodes = generateBackupCodes(10)
    const hashedBackupCodes = hashBackupCodes(backupCodes)

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
