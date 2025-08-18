import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import {
  generateTOTPSecret,
  generateQRCode,
  verifyTOTP,
  generateEmailCode,
  sendEmailCode,
  checkRateLimit,
  logSecurityEvent,
} from '@/lib/auth/mfa-otp'

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { newMethod, verificationCode } = await request.json()

    if (!newMethod || !['email', 'authenticator', 'security_key'].includes(newMethod)) {
      return NextResponse.json({ error: 'Invalid method' }, { status: 400 })
    }

    const rateLimitKey = `mfa-method-${session.user.email}`
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
        tempMfaSecret: true,
        tempMfaMethod: true,
        tempMfaExpires: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.mfaEnabled) {
      return NextResponse.json({ error: 'MFA is not enabled' }, { status: 400 })
    }

    if (user.mfaMethod === newMethod) {
      return NextResponse.json({ error: 'Already using this method' }, { status: 400 })
    }

    if (verificationCode) {
      if (!user.tempMfaSecret || !user.tempMfaExpires || user.tempMfaMethod !== newMethod) {
        return NextResponse.json({ error: 'No pending method change found' }, { status: 400 })
      }

      if (new Date() > user.tempMfaExpires) {
        return NextResponse.json({ error: 'Verification code expired' }, { status: 400 })
      }

      let isValidCode = false

      if (newMethod === 'email') {
        isValidCode = await bcrypt.compare(verificationCode, user.tempMfaSecret)
      } else if (newMethod === 'authenticator') {
        isValidCode = verifyTOTP(verificationCode, user.tempMfaSecret)
      } else if (newMethod === 'security_key') {
        return NextResponse.json(
          { error: 'WebAuthn verification should be handled separately' },
          { status: 400 }
        )
      }

      if (!isValidCode) {
        await logSecurityEvent(
          user.id,
          'MFA_METHOD_CHANGE_FAILED',
          {
            newMethod,
            reason: 'Invalid verification code',
          },
          request
        )
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          mfaMethod: newMethod,
          mfaSecret: newMethod === 'authenticator' ? user.tempMfaSecret : null,
          tempMfaSecret: null,
          tempMfaMethod: null,
          tempMfaExpires: null,
        },
      })

      await logSecurityEvent(
        user.id,
        'MFA_METHOD_CHANGED',
        {
          oldMethod: user.mfaMethod,
          newMethod,
        },
        request
      )

      return NextResponse.json({
        success: true,
        message: `MFA method changed to ${newMethod}`,
      })
    }

    if (newMethod === 'email') {
      const verificationCode = generateEmailCode()
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

      const hashedCode = await bcrypt.hash(verificationCode, 12)

      await prisma.user.update({
        where: { id: user.id },
        data: {
          tempMfaSecret: hashedCode,
          tempMfaMethod: newMethod,
          tempMfaExpires: expiresAt,
        },
      })

      const emailSent = await sendEmailCode(user.email!, verificationCode, 'setup')

      if (!emailSent) {
        return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Verification code sent to your email',
      })
    } else if (newMethod === 'authenticator') {
      const secret = generateTOTPSecret()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

      await prisma.user.update({
        where: { id: user.id },
        data: {
          tempMfaSecret: secret,
          tempMfaMethod: newMethod,
          tempMfaExpires: expiresAt,
        },
      })

      const qrCodeUrl = await generateQRCode(secret, user.email!, 'the everything assistant')

      return NextResponse.json({
        success: true,
        qrCode: qrCodeUrl,
        secret: secret,
        manualEntryKey: secret,
      })
    } else if (newMethod === 'security_key') {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

      await prisma.user.update({
        where: { id: user.id },
        data: {
          tempMfaMethod: newMethod,
          tempMfaExpires: expiresAt,
          tempMfaSecret: null,
        },
      })

      return NextResponse.json({
        success: true,
        message:
          'Please register your security key (supports both platform authenticators and external keys)',
        requiresRegistration: true,
        method: newMethod,
      })
    }
  } catch (error) {
    console.error('MFA method change error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
