import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cancelChatgptLogin } from '@/lib/codex/app-server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let loginId: string | null = null
  try {
    const body = await request.json().catch(() => null)
    if (body && typeof body === 'object') {
      const rawLoginId = (body as Record<string, unknown>).loginId
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
  } catch (error: any) {
    console.error('[chatgpt-auth] cancel failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Unable to cancel ChatGPT login' },
      { status: 500 }
    )
  }
}
