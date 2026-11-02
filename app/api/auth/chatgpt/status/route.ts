import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getChatgptStatus } from '@/lib/codex/app-server'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const status = await getChatgptStatus(session.user.id)
    return NextResponse.json(status)
  } catch (error) {
    console.error('[chatgpt-auth] status failed:', error)
    return NextResponse.json(
      {
        available: false,
        connected: false,
        authMode: null,
        email: null,
        planType: null,
        planUsage: null,
        pendingLoginId: null,
        lastLoginError: null,
        requiresOpenaiAuth: null,
        error: (error instanceof Error && error.message) || 'Unable to reach Codex app-server',
      },
      { status: 503 }
    )
  }
}
