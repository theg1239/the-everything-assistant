import * as z from 'zod'

/** Response schemas for `app/api/chats/**`, as they arrive over JSON (dates serialized). */

/** One entry of `GET /api/chats` (also the `newChatCreated` event detail). */
export const chatSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  path: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ChatSummary = z.infer<typeof chatSummarySchema>

/** `GET /api/chats?limit&offset[&archived=true]` */
export const chatSummariesResponseSchema = z.array(chatSummarySchema)

/** `DELETE /api/chats?action=delete-all|delete-archived`, `PATCH /api/chats?action=archive-all` */
export const chatBulkActionResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  count: z.number(),
})

export type ChatBulkActionResponse = z.infer<typeof chatBulkActionResponseSchema>

/** `GET /api/chats/[id]/title` */
export const chatTitleResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string(),
})

/** A stored tool invocation as `lib/db` returns it (`readToolInvocations`). */
const storedToolInvocationSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
  result: z.unknown().optional(),
  state: z.enum(['partial-call', 'call', 'result', 'error']).optional(),
  error: z.string().optional(),
})

/**
 * `GET /api/chats/[id]`. Messages carry `content` + `toolInvocations` (the route also sends
 * legacy `parts`, which clients rebuild from those two, and omits attachments).
 */
export const chatDetailResponseSchema = chatSummarySchema.extend({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
      toolInvocations: z.array(storedToolInvocationSchema).optional(),
      createdAt: z.string(),
    })
  ),
})
