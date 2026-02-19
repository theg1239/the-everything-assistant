import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { disconnectChatgpt } from '@/lib/codex/app-server'

export const runtime = 'nodejs'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const status = await disconnectChatgpt(session.user.id)
    return NextResponse.json(status)
  } catch (error: any) {
    console.error('[chatgpt-auth] disconnect failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Unable to disconnect ChatGPT' },
      { status: 500 }
    )
  }
}
