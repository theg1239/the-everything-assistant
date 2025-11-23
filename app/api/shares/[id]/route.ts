import { NextRequest, NextResponse } from 'next/server'
import { getChatShareWithMessages } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: shareId } = await params
  const shared = await getChatShareWithMessages(shareId)

  if (!shared) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return NextResponse.json({
    shareId,
    title: shared.share.title || shared.chat.title || 'Shared chat',
    chatTitle: shared.chat.title,
    chatId: shared.chat.id,
    messages: shared.messages.map(msg => ({
      id: msg.id,
      chatId: msg.chatId,
      role: msg.role,
      content: msg.content,
      toolInvocations: msg.toolInvocations,
      createdAt: (msg as any).created_at || (msg as any).createdAt,
    })),
  })
}
