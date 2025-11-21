import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import type { Prisma } from '@/prisma/generated/client'
import {
  verifyTOTP,
  hashBackupCodes,
  generateBackupCodes,
  logSecurityEvent,
  checkRateLimit,
} from '@/lib/mfa'
import { mfaVerificationSchema } from '@/types/api/mfa'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsedBody = mfaVerificationSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Verification code is required' }, { status: 400 })
    }
    const { code, method, credential } = parsedBody.data

    if (method === 'security_key') {
      if (!credential) {
        return NextResponse.json(
          { error: 'Credential is required for WebAuthn methods' },
          { status: 400 }
        )
      }
    } else if (!code) {
      return NextResponse.json({ error: 'Verification code is required' }, { status: 400 })
    }

    const rateLimitKey = `mfa-verify-${session.user.email}`
    if (!checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please try again later.' },
        { status: 429 }
      )
    }
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        tempMfaSecret: true,
        tempMfaMethod: true,
        tempMfaExpires: true,
        mfaEnabled: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (!user.tempMfaSecret) {
      return NextResponse.json(
        { error: 'No MFA setup in progress. Please start setup first.' },
        { status: 400 }
      )
    }
    if (!user.tempMfaMethod) {
      return NextResponse.json(
        { error: 'MFA method not set. Please start setup again.' },
        { status: 400 }
      )
    }
    if (user.tempMfaExpires && new Date() > user.tempMfaExpires) {
      return NextResponse.json(
        { error: 'Setup session expired. Please start setup again.' },
        { status: 400 }
      )
    }
    let isValidCode = false

    const tempSecret = user.tempMfaSecret
    if (user.tempMfaMethod === 'email') {
      isValidCode = await bcrypt.compare(code as string, tempSecret)
    } else if (user.tempMfaMethod === 'authenticator') {
      isValidCode = verifyTOTP(code as string, tempSecret)
    } else if (user.tempMfaMethod === 'security_key') {
      return NextResponse.json(
        { error: 'Please use the WebAuthn verification endpoint for security keys' },
        { status: 400 }
      )
    }

    if (!isValidCode) {
      await logSecurityEvent(
        user.id,
        'MFA_VERIFICATION_FAILED',
        { method: user.tempMfaMethod },
        request
      )
      return NextResponse.json(
        { error: 'Invalid verification code. Please try again.' },
        { status: 400 }
      )
    }

    const backupCodes = generateBackupCodes()
    const hashedBackupCodes = hashBackupCodes(backupCodes)
    const updateData: Prisma.UserUpdateInput = {
      mfaEnabled: true,
      mfaMethod: user.tempMfaMethod,
      tempMfaSecret: null,
      tempMfaMethod: null,
      tempMfaExpires: null,
      backupCodes: hashedBackupCodes,
      mfaSecret: user.tempMfaMethod === 'authenticator' ? user.tempMfaSecret : null,
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    })

    await logSecurityEvent(user.id, 'MFA_ENABLED', { method: user.tempMfaMethod }, request)

    return NextResponse.json({
      success: true,
      message: 'MFA has been successfully enabled',
      backupCodes,
      mfaEnabled: true,
      mfaMethod: user.tempMfaMethod,
    })
  } catch (error) {
    console.error('MFA verification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
