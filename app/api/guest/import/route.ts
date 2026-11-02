import { auth } from '@/lib/auth'
import { createChat, getChat, saveMessage } from '@/lib/db'
import { extractTitleFromContent, generateUUID } from '@/lib/utils'
import {
  uiMessagesToLegacyMessages,
  type AppUIMessage,
  type LegacyAttachment,
} from '@/lib/ai-message-conversion'
import type { Attachment } from '@/types/attachment'
import { safeValidateUIMessages } from 'ai'
import * as z from 'zod'

/** Legacy attachments built from UI file parts always carry a contentType; drop any that don't. */
function toStoredAttachments(attachments: LegacyAttachment[] | undefined): Attachment[] | undefined {
  return attachments?.flatMap(({ url, name, contentType }) =>
    contentType ? [{ url, name, contentType }] : []
  )
}

const importPayloadSchema = z.object({
  chatId: z.string().optional().catch(undefined),
  messages: z.array(z.unknown()),
})

export async function POST(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const raw = await req.json().catch(() => null)
  const parsedPayload = importPayloadSchema.safeParse(raw)

  if (!parsedPayload.success) {
    return new Response('Invalid payload', { status: 400 })
  }
  const payload = parsedPayload.data

  if (payload.messages.length === 0) {
    return new Response('No messages to import', { status: 400 })
  }

  const validatedMessages = await safeValidateUIMessages<AppUIMessage>({
    messages: payload.messages,
  })
  if (!validatedMessages.success) {
    return new Response('Invalid payload', { status: 400 })
  }

  const legacyMessages = uiMessagesToLegacyMessages(validatedMessages.data)

  if (legacyMessages.length === 0) {
    return new Response('No messages to import', { status: 400 })
  }

  const preferredId =
    payload.chatId && payload.chatId.trim().length > 0
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
    await saveMessage(chat.id, message.role, content, message.toolInvocations, message.id, toStoredAttachments(message.attachments))
  }

  return new Response(
    JSON.stringify({ chatId: chat.id, path: chat.path || `/chat/${chat.id}` }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
