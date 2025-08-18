import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/mfa-otp'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import {
  verifyTOTP,
  verifyBackupCode,
  generateEmailCode,
  sendEmailCode,
  checkRateLimit,
  logSecurityEvent,
} from '@/lib/auth/mfa-otp'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code, useBackupCode } = await request.json()

    if (!code) {
      return NextResponse.json({ error: 'Verification code is required' }, { status: 400 })
    }

    const rateLimitKey = `mfa-login-${session.user.email}`
    if (!checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000)) {
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
        mfaMethod: true,
        mfaSecret: true,
        backupCodes: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA is not enabled for this account' }, { status: 400 })
    }

    let isValidCode = false

    if (useBackupCode) {
      if (!user.backupCodes || user.backupCodes.length === 0) {
        return NextResponse.json({ error: 'No backup codes available' }, { status: 400 })
      }

      const hashedCodes = user.backupCodes.map(code =>
        typeof code === 'string' ? code : String(code)
      )

      isValidCode = verifyBackupCode(code, hashedCodes)

      if (isValidCode) {
        const codeIndex = hashedCodes.findIndex(hashedCode => {
          const testHash = require('crypto')
            .createHash('sha256')
            .update(code.toUpperCase())
            .digest('hex')
          return hashedCode === testHash
        })

        if (codeIndex !== -1) {
          const updatedBackupCodes = [...hashedCodes]
          updatedBackupCodes.splice(codeIndex, 1)

          await prisma.user.update({
            where: { id: user.id },
            data: { backupCodes: updatedBackupCodes },
          })
        }
      }
    } else {
      if (user.mfaMethod === 'authenticator' && user.mfaSecret) {
        isValidCode = verifyTOTP(code, user.mfaSecret)
      } else if (user.mfaMethod === 'email') {
        // For email MFA, we would need to implement a flow where:
        // 1. User requests login email verification
        // 2. System sends code to email
        // 3. User enters code here
        // For now, return error asking user to set up proper MFA
        return NextResponse.json(
          {
            error:
              'Email MFA login flow not implemented. Please use authenticator app or backup codes.',
          },
          { status: 400 }
        )
      }
    }

    if (!isValidCode) {
      await logSecurityEvent(
        user.id,
        'MFA_LOGIN_FAILED',
        {
          method: useBackupCode ? 'backup_code' : user.mfaMethod,
          reason: 'Invalid verification code',
        },
        request
      )
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
    }

    await logSecurityEvent(
      user.id,
      'MFA_LOGIN_SUCCESS',
      {
        method: useBackupCode ? 'backup_code' : user.mfaMethod,
      },
      request
    )

    return NextResponse.json({
      success: true,
      message: 'MFA verification successful',
    })
  } catch (error) {
    console.error('MFA login verification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
