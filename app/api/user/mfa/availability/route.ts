import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isSMTPConfigured } from '@/lib/env-config'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const availability = {
      email: isSMTPConfigured(),
      authenticator: true,
      security_key: true,
    }

    return NextResponse.json({
      success: true,
      availability,
    })
  } catch (error) {
    console.error('MFA availability check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
