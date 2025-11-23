import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createChatShare, getChat } from '@/lib/db'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const chatId = params.id
  const chat = await getChat(chatId, session.user.id)

  if (!chat) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const share = await createChatShare(chat.id, session.user.id, chat.title)
  if (!share) {
    return NextResponse.json({ error: 'unable to create share link' }, { status: 500 })
  }

  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    req.headers.get('origin') ||
    'http://localhost:3000'

  const shareUrl = `${origin.replace(/\/$/, '')}/share/${share.id}`

  return NextResponse.json({
    shareId: share.id,
    shareUrl,
    title: share.title || chat.title,
    createdAt: share.createdAt,
  })
}
