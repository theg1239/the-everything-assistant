import { auth } from '@/lib/auth'
import { createChat, getChat, saveMessage } from '@/lib/db'
import { extractTitleFromContent, generateUUID } from '@/lib/utils'
import * as z from 'zod'

const MAX_IMPORTED_MESSAGES = 50
const MAX_MESSAGE_CHARS = 32_000

const textPartSchema = z.object({ type: z.literal('text'), text: z.string() })

/**
 * Guest history comes from localStorage, i.e. it is fully client-controlled. Only
 * the user/assistant text survives the import: tool invocations/outputs, file
 * parts, metadata and system messages are dropped, because imported messages are
 * later rendered (including on public /share pages) as if the server produced them.
 */
const importMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(z.unknown()).max(200),
})

const importPayloadSchema = z.object({
  chatId: z.string().max(128).optional().catch(undefined),
  messages: z.array(z.unknown()).min(1).max(200),
})

type ImportedMessage = { role: 'user' | 'assistant'; content: string }

function toImportedMessages(raw: unknown[]): ImportedMessage[] {
  return raw
    .flatMap(item => {
      const parsed = importMessageSchema.safeParse(item)
      if (!parsed.success || parsed.data.role === 'system') return []
      const content = parsed.data.parts
        .flatMap(part => {
          const text = textPartSchema.safeParse(part)
          return text.success ? [text.data.text] : []
        })
        .join('')
        .slice(0, MAX_MESSAGE_CHARS)
      return content.trim() ? [{ role: parsed.data.role, content }] : []
    })
    .slice(-MAX_IMPORTED_MESSAGES)
}

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

  const messages = toImportedMessages(payload.messages)

  if (messages.length === 0) {
    return new Response('No messages to import', { status: 400 })
  }

  const preferredId =
    payload.chatId && payload.chatId.trim().length > 0 ? payload.chatId.trim() : generateUUID()

  const existing = await getChat(preferredId, session.user.id)

  const firstUserMessage = messages.find(m => m.role === 'user') ?? messages[0]

  const fallbackTitle = extractTitleFromContent(firstUserMessage?.content || 'New Chat')
  let chat = existing

  if (!chat) {
    try {
      chat = await createChat(session.user.id, fallbackTitle, `/chat/${preferredId}`, preferredId)
    } catch {
      console.warn('Preferred chat id already in use, creating a fresh chat id')
      const freshId = generateUUID()
      chat = await createChat(session.user.id, fallbackTitle, `/chat/${freshId}`, freshId)
    }
  }

  // Server-generated ids: client ids could collide with (or probe for) existing rows.
  for (const message of messages) {
    await saveMessage(chat.id, message.role, message.content, undefined, generateUUID())
  }

  return new Response(
    JSON.stringify({ chatId: chat.id, path: chat.path || `/chat/${chat.id}` }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
