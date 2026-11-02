import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { cancelChatgptLogin } from '@/lib/codex/app-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let loginId: string | null = null
  try {
    const body = await request.json().catch(() => null)
    if (body && typeof body === 'object' && 'loginId' in body) {
      const rawLoginId = body.loginId
      if (typeof rawLoginId === 'string') {
        loginId = rawLoginId
      }
    }
  } catch {
    loginId = null
  }

  try {
    const status = await cancelChatgptLogin(session.user.id, loginId)
    return NextResponse.json(status)
  } catch (error) {
    console.error('[chatgpt-auth] cancel failed:', error)
    return NextResponse.json(
      { error: (error instanceof Error && error.message) || 'Unable to cancel ChatGPT login' },
      { status: 500 }
    )
  }
}
