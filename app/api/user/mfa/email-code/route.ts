import { NextResponse } from 'next/server'
import { authAllowingPendingMfa } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateEmailCode, getMfaPepper, hashEmailCode, sendEmailCode } from '@/lib/mfa'
import { issueEmailLoginCode } from '@/lib/mfa-state'
import { getMfaKv, mfaUnavailableResponse } from '@/lib/session'

/**
 * Emails a single-use login/step-up code to a user whose MFA method is `email`. The code is
 * checked by `POST /api/auth/mfa-verify` with `{ code }`. Allowed while MFA is pending.
 */
export async function POST() {
  try {
    const session = await authAllowingPendingMfa()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const kv = getMfaKv()
    if (!kv) return mfaUnavailableResponse()

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, mfaEnabled: true, mfaMethod: true },
    })
    if (!user || !user.mfaEnabled || user.mfaMethod !== 'email' || !user.email) {
      return NextResponse.json({ error: 'Email verification is not enabled' }, { status: 400 })
    }

    const code = generateEmailCode()
    const issued = await issueEmailLoginCode(kv, {
      userId: user.id,
      codeHash: hashEmailCode(code, getMfaPepper()),
      now: Date.now(),
    })
    if (issued === 'cooldown') {
      return NextResponse.json({
        success: true,
        sent: false,
        message: 'A code was sent less than a minute ago. Check your email.',
      })
    }
    if (issued === 'rate_limited') {
      return NextResponse.json(
        { error: 'Too many codes requested. Please try again later.' },
        { status: 429 }
      )
    }

    const sent = await sendEmailCode(user.email, code, 'login')
    if (!sent) {
      return NextResponse.json({ error: 'Failed to send verification email' }, { status: 502 })
    }
    return NextResponse.json({
      success: true,
      sent: true,
      message: 'Verification code sent to your email',
    })
  } catch (error) {
    console.error('MFA email code error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
