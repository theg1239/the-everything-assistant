import { NextRequest, NextResponse } from 'next/server'
import { handleCodeChallenge } from '@/lib/mfa-challenge'
import { mfaVerifyLoginSchema } from '@/types/api/mfa'

/** Alias of `POST /api/auth/mfa-verify` taking `{ code, useBackupCode? }`. */
export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json().catch(() => null)
    const parsedBody = mfaVerifyLoginSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Verification code is required' }, { status: 400 })
    }
    const { code, useBackupCode } = parsedBody.data
    return await handleCodeChallenge(request, {
      kind: useBackupCode ? 'backup_code' : 'code',
      code,
    })
  } catch (error) {
    console.error('MFA login verification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
