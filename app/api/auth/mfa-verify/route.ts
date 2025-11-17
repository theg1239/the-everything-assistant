import { NextResponse } from 'next/server'
import { checkBotId } from 'botid/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyTOTP, verifyBackupCode } from '@/lib/mfa'

export async function POST(request: Request) {
  try {
    if (process.env.DISABLE_BOTID !== 'true' && process.env.NODE_ENV !== 'development') {
      const verification = await checkBotId()
      if (verification.isBot) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code, backupCode } = await request.json()

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        mfaEnabled: true,
        mfaMethod: true,
        mfaSecret: true,
        backupCodes: true,
      },
    })

    if (!user || !user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA not enabled' }, { status: 400 })
    }
    let isValid = false
    let message = ''

    if (backupCode) {
      const hashedBackupCodes = user.backupCodes

      const isValidBackupCode = verifyBackupCode(backupCode, hashedBackupCodes)

      if (isValidBackupCode) {
        isValid = true

        const hashedInput = require('crypto')
          .createHash('sha256')
          .update(backupCode.toUpperCase())
          .digest('hex')
        const updatedBackupCodes = hashedBackupCodes.filter(code => code !== hashedInput)

        await prisma.user.update({
          where: { id: user.id },
          data: { backupCodes: updatedBackupCodes },
        })

        const remainingCodes = updatedBackupCodes.length
        message = `Backup code used successfully. ${remainingCodes} backup codes remaining.`
      } else {
      }
    } else if (code) {
      if (user.mfaMethod === 'authenticator' && user.mfaSecret) {
        isValid = verifyTOTP(code, user.mfaSecret)
      } else if (user.mfaMethod === 'email') {
        return NextResponse.json(
          { error: 'Email MFA verification not yet implemented for login' },
          { status: 400 }
        )
      } else if (user.mfaMethod === 'security_key') {
        return NextResponse.json(
          { error: 'WebAuthn methods require authentication via their dedicated endpoints' },
          { status: 400 }
        )
      } else {
      }
    } else {
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: message || 'MFA verification successful',
    })
  } catch (error) {
    console.error('MFA verification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
