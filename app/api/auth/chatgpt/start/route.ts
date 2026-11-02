import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { startChatgptLogin } from '@/lib/codex/app-server'

export const runtime = 'nodejs'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await startChatgptLogin(session.user.id)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[chatgpt-auth] start failed:', error)
    return NextResponse.json(
      { error: (error instanceof Error && error.message) || 'Unable to start ChatGPT login' },
      { status: 500 }
    )
  }
}
