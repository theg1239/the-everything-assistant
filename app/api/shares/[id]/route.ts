import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getChatShareWithMessages } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: shareId } = await params
  const [shared, session] = await Promise.all([getChatShareWithMessages(shareId), auth()])

  if (!shared) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // The source chat id is private to its owner: anyone with the share link would
  // otherwise learn it. Viewers address the share by `shareId` (fork uses it too).
  const isOwner = Boolean(session?.user?.id && session.user.id === shared.chat.userId)

  return NextResponse.json({
    shareId,
    title: shared.share.title || shared.chat.title || 'Shared chat',
    chatTitle: shared.chat.title,
    ...(isOwner ? { chatId: shared.chat.id } : {}),
    messages: shared.messages.map(msg => ({
      id: msg.id,
      ...(isOwner ? { chatId: msg.chatId } : {}),
      role: msg.role,
      content: msg.content,
      toolInvocations: msg.toolInvocations,
      createdAt: msg.created_at,
    })),
  })
}
