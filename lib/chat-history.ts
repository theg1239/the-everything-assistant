import * as z from 'zod'
import { chatDetailResponseSchema } from '@/types/api/chats'
import type { Message } from '@/lib/db'

/**
 * Messages per history page: what `app/chat/[id]/page.tsx` loads up front (the newest ones) and
 * what each "show earlier messages" request fetches. At least the transcript's render window.
 *
 * The initial page is also the model's prior context for a reopened chat: the client sends the
 * `useChat` messages (this page + anything sent since) to /api/chat; older pages loaded for
 * reading are display-only and never sent.
 */
export const CHAT_HISTORY_PAGE_SIZE = 100

/** A persisted message as the chat page and the history endpoint hand it to the client. */
export const toClientMessage = (message: Message) => ({
  id: message.id,
  role: message.role,
  content: message.content,
  toolInvocations: message.toolInvocations,
  attachments: message.attachments,
  createdAt: message.created_at,
})

/** `GET /api/chat/[id]/messages?before=<messageId>&limit=<n>`: oldest first. */
export const chatHistoryPageResponseSchema = z.object({
  messages: chatDetailResponseSchema.shape.messages,
  hasMore: z.boolean(),
})
