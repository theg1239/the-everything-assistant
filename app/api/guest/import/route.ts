import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createChat, getChat, saveMessage } from '@/lib/db'
import { extractTitleFromContent, generateUUID } from '@/lib/utils'
import { uiMessagesToLegacyMessages, type AppUIMessage } from '@/lib/ai-message-conversion'

type ImportPayload = {
  chatId?: string
  messages?: AppUIMessage[]
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const raw = await req.json().catch(() => null)
  const payload = raw as ImportPayload | null

  if (!payload || !Array.isArray(payload.messages)) {
    return new Response('Invalid payload', { status: 400 })
  }

  const uiMessages = payload.messages as AppUIMessage[]
  const legacyMessages = uiMessagesToLegacyMessages(uiMessages)

  if (legacyMessages.length === 0) {
    return new Response('No messages to import', { status: 400 })
  }

  const preferredId =
    typeof payload.chatId === 'string' && payload.chatId.trim().length > 0
      ? payload.chatId.trim()
      : generateUUID()

  const existing = await getChat(preferredId, session.user.id)

  const firstUserMessage =
    legacyMessages.find(m => m.role === 'user') || legacyMessages.find(m => m.content)

  const fallbackTitle = extractTitleFromContent(firstUserMessage?.content || 'New Chat')
  let chat = existing

  if (!chat) {
    try {
      chat = await createChat(session.user.id, fallbackTitle, `/chat/${preferredId}`, preferredId)
    } catch (error) {
      console.warn('Preferred chat id already in use, creating a fresh chat id')
      const freshId = generateUUID()
      chat = await createChat(session.user.id, fallbackTitle, `/chat/${freshId}`, freshId)
    }
  }

  for (const message of legacyMessages) {
    const content = message.content || ''
    if (!content.trim()) continue
    if (message.role !== 'user' && message.role !== 'assistant') continue
    await saveMessage(chat.id, message.role, content, message.toolInvocations, message.id, (message as any).attachments)
  }

  return new Response(
    JSON.stringify({ chatId: chat.id, path: chat.path || `/chat/${chat.id}` }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
