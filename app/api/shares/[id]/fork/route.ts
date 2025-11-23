import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { forkSharedChatToUser } from '@/lib/db'

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const chat = await forkSharedChatToUser(params.id, session.user.id)

  if (!chat) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return NextResponse.json({
    chatId: chat.id,
    path: chat.path,
    title: chat.title,
  })
}
