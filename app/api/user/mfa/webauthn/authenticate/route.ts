import { NextRequest, NextResponse } from 'next/server'
import { handleWebAuthnAssertion, handleWebAuthnAssertionOptions } from '@/lib/mfa-challenge'
import { isRecord } from '@/lib/json'
import { webAuthnAuthenticationCredentialSchema } from '@/types/api/mfa'

/**
 * Without a body (or without `credential`): assertion options for the MFA challenge.
 * With `{ credential }`: verifies it, like `POST /api/user/mfa/webauthn/verify-auth`.
 */
export async function POST(request: NextRequest) {
  try {
    const text = await request.text()
    let body: unknown = null
    if (text.trim()) {
      try {
        body = JSON.parse(text)
      } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
      }
    }

    const rawCredential = isRecord(body) ? body.credential : undefined
    if (rawCredential === undefined) {
      return await handleWebAuthnAssertionOptions()
    }

    const parsedCredential = webAuthnAuthenticationCredentialSchema.safeParse(rawCredential)
    if (!parsedCredential.success) {
      return NextResponse.json({ error: 'Invalid credential' }, { status: 400 })
    }
    return await handleWebAuthnAssertion(request, parsedCredential.data)
  } catch (error) {
    console.error('WebAuthn authentication error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
