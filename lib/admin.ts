import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export type AdminCheck = { ok: true; email: string } | { ok: false; response: NextResponse }

/**
 * Fail-closed admin gate: the signed-in user's email must equal
 * `RATE_LIMIT_ADMIN_EMAIL`. When the env var is unset nobody is admin (503), so a
 * missing session email can never match a missing admin email.
 */
export async function requireAdmin(): Promise<AdminCheck> {
  const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL?.trim()
  if (!adminEmail) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Admin access not configured' }, { status: 503 }),
    }
  }
  const session = await auth()
  const email = session?.user?.email
  if (!email || email !== adminEmail) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, email }
}
