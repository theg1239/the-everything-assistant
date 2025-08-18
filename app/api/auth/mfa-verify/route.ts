import { NextResponse } from 'next/server'
import { checkBotId } from 'botid/server'
import { auth } from '@/lib/auth/mfa-otp'
import { prisma } from '@/lib/prisma'
import { verifyTOTP, verifyBackupCode } from '@/lib/auth/mfa-otp'

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
    // console.log('MFA Verify Request:', {
    //   hasCode: !!code,
    //   hasBackupCode: !!backupCode,
    //   codeLength: code?.length,
    //   backupCodeLength: backupCode?.length,
    // })

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
    // console.log('User MFA Status:', {
    //   mfaEnabled: user?.mfaEnabled,
    //   mfaMethod: user?.mfaMethod,
    //   hasSecret: !!user?.mfaSecret,
    //   backupCodeCount: user?.backupCodes?.length,
    // })

    if (!user || !user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA not enabled' }, { status: 400 })
    }
    let isValid = false
    let message = ''

    if (backupCode) {
      // console.log('Verifying backup code...')
      const hashedBackupCodes = user.backupCodes
      // console.log('Available backup codes count:', hashedBackupCodes.length)

      const isValidBackupCode = verifyBackupCode(backupCode, hashedBackupCodes)
      // console.log('Backup code verification result:', isValidBackupCode)

      if (isValidBackupCode) {
        // console.log('Backup code verified successfully')
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
        // console.log('Backup code verification failed')
      }
    } else if (code) {
      // console.log('Verifying authenticator code...')
      if (user.mfaMethod === 'authenticator' && user.mfaSecret) {
        // console.log('MFA Secret exists, verifying TOTP...')
        isValid = verifyTOTP(code, user.mfaSecret)
        // console.log('TOTP verification result:', isValid)
      } else if (user.mfaMethod === 'email') {
        // console.log('Email MFA detected')
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
        // console.log('No valid MFA method found')
      }
    } else {
      // console.log('No code or backup code provided')
    }
    // console.log('Final validation - isValid:', isValid)

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
