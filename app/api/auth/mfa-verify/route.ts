import { NextResponse } from 'next/server'
import { checkBotId } from 'botid/server'
import { handleCodeChallenge } from '@/lib/mfa-challenge'
import { mfaVerifyRequestSchema } from '@/types/api/mfa'

/**
 * MFA challenge with a code: `{ code }` (authenticator TOTP or emailed code) or `{ backupCode }`.
 * On success the session is recorded as MFA-verified server-side (login and step-up).
 */
export async function POST(request: Request) {
  try {
    if (process.env.DISABLE_BOTID !== 'true' && process.env.NODE_ENV !== 'development') {
      const verification = await checkBotId()
      if (verification.isBot) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const rawBody: unknown = await request.json().catch(() => null)
    const parsedBody = mfaVerifyRequestSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const { code, backupCode } = parsedBody.data

    if (backupCode) {
      return await handleCodeChallenge(request, { kind: 'backup_code', code: backupCode })
    }
    if (code) {
      return await handleCodeChallenge(request, { kind: 'code', code })
    }
    return NextResponse.json({ error: 'Verification code is required' }, { status: 400 })
  } catch (error) {
    console.error('MFA verification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
