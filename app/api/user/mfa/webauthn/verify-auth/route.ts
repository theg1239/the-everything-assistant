import { NextRequest, NextResponse } from 'next/server'
import { handleWebAuthnAssertion } from '@/lib/mfa-challenge'
import { webAuthnVerifyAuthSchema } from '@/types/api/mfa'

/** Verifies a security-key assertion for the MFA challenge (login and step-up). */
export async function POST(request: NextRequest) {
  try {
    const rawBody: unknown = await request.json().catch(() => null)
    const parsedBody = webAuthnVerifyAuthSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Credential is required' }, { status: 400 })
    }
    return await handleWebAuthnAssertion(request, parsedBody.data.credential)
  } catch (error) {
    console.error('WebAuthn authentication error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
