import * as z from 'zod'
import { prisma } from './prisma'
import { sanitizeToolInvocations } from './sanitize-tools'
import { generateChatPath } from './utils'
import type { Attachment } from '@/types/attachment'
import type { Prisma, TokenUsage } from '@/prisma/generated/client'

export interface User {
  id: string
  email: string
  name: string | null
  image: string | null
  preferences?: Prisma.JsonValue
  created_at: Date
  updated_at: Date
}

/**
 * Tool invocations persisted in `messages.tool_invocations` (legacy AI SDK shape).
 * Entries without a tool name are dropped; unknown keys are kept.
 */
const storedToolInvocationSchema = z.looseObject({
  toolCallId: z.string().catch(''),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()).optional().catch(undefined),
  result: z.unknown().optional(),
  state: z.enum(['partial-call', 'call', 'result', 'error']).optional().catch(undefined),
  error: z.string().optional().catch(undefined),
})

export type StoredToolInvocation = z.infer<typeof storedToolInvocationSchema>

const attachmentSchema = z.object({
  url: z.string(),
  name: z.string().nullish(),
  contentType: z.string(),
})

/** Sanitizes DB tool-invocation JSON (strips VTOP credentials) and keeps well-formed entries. */
function readToolInvocations(value: Prisma.JsonValue): StoredToolInvocation[] | undefined {
  if (!Array.isArray(value)) return undefined
  return sanitizeToolInvocations(value).flatMap(item => {
    const parsed = storedToolInvocationSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

function readAttachments(value: Prisma.JsonValue): Attachment[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap(item => {
    const parsed = attachmentSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

/** Sanitized, JSON-only copy of tool invocations for a DB write. */
function toToolInvocationsJson(toolInvocations: unknown): Prisma.InputJsonValue | undefined {
  if (!toolInvocations) return undefined
  try {
    return sanitizeToolInvocations(Array.isArray(toolInvocations) ? toolInvocations : [toolInvocations])
  } catch (error) {
    console.error('Failed to serialize toolInvocations for DB:', error)
    return undefined
  }
}

const isMessageRole = (role: string): role is Message['role'] =>
  role === 'user' || role === 'assistant' || role === 'system'

/** DB roles are free-form strings; anything unexpected is treated as an assistant message. */
const toMessageRole = (role: string): Message['role'] => (isMessageRole(role) ? role : 'assistant')

export interface Chat {
  id: string
  userId: string
  title: string
  created_at: Date
  updated_at: Date
  path: string
}

export interface ChatShare {
  id: string
  chatId: string
  userId: string
  title?: string | null
  revoked: boolean
  createdAt: Date
}

export interface Message {
  id: string
  chatId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolInvocations?: StoredToolInvocation[]
  attachments?: Attachment[]
  created_at: Date
}

export interface CanvasDocument {
  id: string
  chatId: string
  title: string
  content: string
  type: string
  created_at: Date
  updated_at: Date
}

export interface Vote {
  chatId: string
  messageId: string
  is_upvoted: boolean
}

export type TokenUsageLog = TokenUsage

export async function getUser(email: string): Promise<User | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    })
    return user ? { ...user, email: user.email ?? email } : null
  } catch (error) {
    console.error('Error getting user:', error)
    return null
  }
}

export async function createUser(email: string, name: string, image?: string): Promise<User> {
  const user = await prisma.user.create({
    data: {
      email,
      name,
      image,
    },
  })
  return { ...user, email: user.email ?? email }
}

export async function getChats(
  userId: string,
  limit: number = 15,
  offset: number = 0
): Promise<Chat[]> {
  try {
    const chats = await prisma.chat.findMany({
      where: {
        userId,
        archived: false,
      },
      orderBy: { updated_at: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        userId: true,
        title: true,
        created_at: true,
        updated_at: true,
        path: true,
      },
    })
    return chats
  } catch (error) {
    console.error('Error getting chats:', error)
    return []
  }
}

export async function getChat(id: string, userId: string): Promise<Chat | null> {
  try {
    const chat = await prisma.chat.findFirst({
      where: {
        id,
        userId,
      },
      select: {
        id: true,
        userId: true,
        title: true,
        created_at: true,
        updated_at: true,
        path: true,
      },
    })
    return chat
  } catch (error) {
    console.error('Error getting chat:', error)
    return null
  }
}

export async function createChatShare(
  chatId: string,
  userId: string,
  title?: string | null
): Promise<ChatShare | null> {
  try {
    const existing = await prisma.chatShare.findFirst({
      where: { chatId, userId, revoked: false },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) return existing

    const share = await prisma.chatShare.create({
      data: { chatId, userId, title },
    })
    return share
  } catch (error) {
    console.error('Error creating chat share:', error)
    return null
  }
}

export async function getChatShareWithMessages(
  shareId: string
): Promise<{ share: ChatShare; chat: Chat; messages: Message[] } | null> {
  try {
    const share = await prisma.chatShare.findFirst({
      where: { id: shareId, revoked: false },
      include: {
        chat: {
          select: {
            id: true,
            userId: true,
            title: true,
            created_at: true,
            updated_at: true,
            path: true,
          },
        },
      },
    })
    if (!share || !share.chat) return null
    const messages = await getMessages(share.chatId)
    return {
      share,
      chat: share.chat,
      messages,
    }
  } catch (error) {
    console.error('Error loading shared chat:', error)
    return null
  }
}
export async function createChat(
  userId: string,
  title: string,
  path?: string,
  id?: string
): Promise<Chat> {
  const resolvedPath = path ?? (id ? `/chat/${id}` : generateChatPath())

  const chat = await prisma.chat.create({
    data: {
      ...(id ? { id } : {}),
      userId,
      title,
      path: resolvedPath,
    },
    select: {
      id: true,
      userId: true,
      title: true,
      created_at: true,
      updated_at: true,
      path: true,
    },
  })

  return { ...chat, path: resolvedPath }
}

export async function createChatWithFirstMessage(
  userId: string,
  title: string,
  path: string,
  messageContent: string,
  messageId?: string
): Promise<{ chat: Chat; message: Message }> {
  const result = await prisma.$transaction(
    async tx => {
      const chat = await tx.chat.create({
        data: {
          userId,
          title,
          path,
        },
        select: {
          id: true,
          userId: true,
          title: true,
          created_at: true,
          updated_at: true,
          path: true,
        },
      })

      const message = await tx.message.create({
        data: {
          id: messageId,
          chatId: chat.id,
          role: 'user',
          content: messageContent,
          tool_invocations: undefined,
        },
        select: {
          id: true,
          chatId: true,
          role: true,
          content: true,
          tool_invocations: true,
          created_at: true,
        },
      })

      return {
        chat,
        message: {
          ...message,
          role: toMessageRole(message.role),
          toolInvocations: readToolInvocations(message.tool_invocations),
        },
      }
    },
    {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    }
  )

  return result
}

export async function updateChat(id: string, title: string): Promise<void> {
  await prisma.chat.update({
    where: { id },
    data: {
      title,
      updated_at: new Date(),
    },
    select: { id: true },
  })
}

export async function deleteChat(id: string, userId: string): Promise<void> {
  await prisma.chat.deleteMany({
    where: {
      id,
      userId,
    },
  })
}

export async function deleteAllChats(userId: string): Promise<number> {
  const result = await prisma.chat.deleteMany({
    where: {
      userId,
      archived: false,
    },
  })
  return result.count
}

export async function archiveAllChats(userId: string): Promise<number> {
  const result = await prisma.chat.updateMany({
    where: {
      userId,
      archived: false,
    },
    data: {
      archived: true,
    },
  })
  return result.count
}

export async function saveTokenUsage(params: {
  userId?: string | null
  chatId?: string | null
  model?: string | null
  stepIndex?: number | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  meta?: Prisma.InputJsonValue
}): Promise<void> {
  // Insert-only (several per chat turn): don't read the row back.
  await prisma.tokenUsage.create({
    select: { id: true },
    data: {
      userId: params.userId || null,
      chatId: params.chatId || null,
      model: params.model || null,
      stepIndex: params.stepIndex ?? null,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens: params.totalTokens,
      meta: params.meta,
    },
  })
}

export async function getRecentTokenUsage(limit: number = 50): Promise<TokenUsageLog[]> {
  const rows = await prisma.tokenUsage.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(200, limit)),
  })
  return rows
}

export async function getTokenUsageSummary(days: number = 1): Promise<{
  from: string
  to: string
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  count: number
}> {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - Math.max(0, days))
  const rows = await prisma.tokenUsage.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { inputTokens: true, outputTokens: true, totalTokens: true },
  })
  const summary = rows.reduce(
    (acc, r) => {
      acc.totalPromptTokens += r.inputTokens
      acc.totalCompletionTokens += r.outputTokens
      acc.totalTokens += r.totalTokens
      acc.count++
      return acc
    },
    { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, count: 0 }
  )
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    ...summary,
  }
}

export async function getTokenUsageAllTimeSummary(): Promise<{
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  count: number
}> {
  try {
    const agg = await prisma.tokenUsage.aggregate({
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
      _count: { _all: true },
    })
    return {
      totalPromptTokens: agg._sum?.inputTokens || 0,
      totalCompletionTokens: agg._sum?.outputTokens || 0,
      totalTokens: agg._sum?.totalTokens || 0,
      count: agg._count?._all || 0,
    };
  } catch {
    const rows = await prisma.tokenUsage.findMany({
      select: { inputTokens: true, outputTokens: true, totalTokens: true },
    })
    const s = rows.reduce(
      (acc, r) => {
        acc.totalPromptTokens += r.inputTokens
        acc.totalCompletionTokens += r.outputTokens
        acc.totalTokens += r.totalTokens
        acc.count++
        return acc
      },
      { totalPromptTokens: 0, totalCompletionTokens: 0, totalTokens: 0, count: 0 }
    )
    return s
  }
}

export async function getTokenUsageLifetimeBuckets(granularity: 'day' | 'month' | 'hour' = 'day') {
  const unit = granularity === 'month' ? 'month' : granularity === 'hour' ? 'hour' : 'day'
  try {
    const rawRows: unknown = await prisma.$queryRaw`
      SELECT date_trunc(${unit}, "createdAt") AS bucket,
             sum("totalTokens") AS "totalTokens",
             sum("promptTokens") AS "promptTokens",
             sum("completionTokens") AS "completionTokens",
             count(*) AS count
      FROM "TokenUsage"
      GROUP BY bucket
      ORDER BY bucket ASC
    `

    const sqlNumber = z.unknown().transform(value => Number(value || 0))
    const rows = z
      .array(
        z.object({
          bucket: z.union([z.date(), z.string()]),
          totalTokens: sqlNumber,
          promptTokens: sqlNumber,
          completionTokens: sqlNumber,
          count: sqlNumber,
        })
      )
      .parse(rawRows)

    return rows.map(r => ({
      ts: new Date(r.bucket).getTime(),
      date: new Date(r.bucket).toISOString(),
      totalTokens: r.totalTokens,
      inputTokens: r.promptTokens,
      outputTokens: r.completionTokens,
      count: r.count,
    }))
  } catch (err) {
    try {
      const all = await prisma.tokenUsage.findMany({
        select: { createdAt: true, totalTokens: true, inputTokens: true, outputTokens: true },
      })
      const buckets: Record<
        string,
        {
          ts: number
          date: string
          totalTokens: number
          inputTokens: number
          outputTokens: number
          count: number
        }
      > = {}
      for (const r of all) {
        const d = new Date(r.createdAt)
        let key: string
        if (unit === 'hour')
          key = d.toISOString().slice(0, 13) // YYYY-MM-DDTHH
        else key = d.toISOString().slice(0, 10) // YYYY-MM-DD
        const bucket = (buckets[key] ??= {
          ts: new Date(key).getTime(),
          date: key,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          count: 0,
        })
        bucket.totalTokens += Number(r.totalTokens || 0)
        bucket.inputTokens += Number(r.inputTokens || 0)
        bucket.outputTokens += Number(r.outputTokens || 0)
        bucket.count += 1
      }
      return Object.values(buckets).sort((a, b) => a.ts - b.ts)
    } catch (err2) {
      console.error('Failed to aggregate token usage buckets:', err, err2)
      return []
    }
  }
}

export async function getArchivedChats(
  userId: string,
  limit: number = 15,
  offset: number = 0
): Promise<Chat[]> {
  try {
    const chats = await prisma.chat.findMany({
      where: {
        userId,
        archived: true,
      },
      orderBy: { updated_at: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        userId: true,
        title: true,
        created_at: true,
        updated_at: true,
        path: true,
      },
    })
    return chats
  } catch (error) {
    console.error('Error getting archived chats:', error)
    return []
  }
}

export async function restoreChat(id: string, userId: string): Promise<void> {
  await prisma.chat.updateMany({
    where: {
      id,
      userId,
      archived: true,
    },
    data: {
      archived: false,
    },
  })
}

const messageSelect = {
  id: true,
  chatId: true,
  role: true,
  content: true,
  tool_invocations: true,
  attachments: true,
  created_at: true,
} as const

export type GetMessagesOptions = {
  /**
   * Only the most recent `limit` messages (still returned oldest-first). Uses the
   * `(chatId, created_at)` index; omit for the full history.
   */
  limit?: number
}

export async function getMessages(
  chatId: string,
  options: GetMessagesOptions = {}
): Promise<Message[]> {
  try {
    const { limit } = options
    const messages =
      limit !== undefined && limit > 0
        ? (
            await prisma.message.findMany({
              where: { chatId },
              orderBy: { created_at: 'desc' },
              take: limit,
              select: messageSelect,
            })
          ).reverse()
        : await prisma.message.findMany({
            where: { chatId },
            orderBy: { created_at: 'asc' },
            select: messageSelect,
          })
    return messages.map(msg => ({
      ...msg,
      role: toMessageRole(msg.role),
      toolInvocations: readToolInvocations(msg.tool_invocations),
      attachments: readAttachments(msg.attachments),
    }))
  } catch (error) {
    console.error('Error getting messages:', error)
    return []
  }
}

export async function saveMessage(
  chatId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  toolInvocations?: unknown,
  messageId?: string,
  attachments?: Attachment[]
): Promise<Pick<Message, 'id' | 'created_at'>> {
  const safeToolInvocations = toToolInvocationsJson(toolInvocations)
  // Callers already hold the content/tool invocations; don't ship them back from the DB.
  return prisma.message.create({
    data: {
      id: messageId,
      chatId,
      role,
      content,
      tool_invocations: safeToolInvocations,
      attachments,
    },
    select: { id: true, created_at: true },
  })
}

/** Replaces a saved message's tool invocations (used to attach post-processed tool output). */
export async function updateMessageToolInvocations(
  messageId: string,
  toolInvocations: unknown
): Promise<void> {
  await prisma.message.update({
    where: { id: messageId },
    data: { tool_invocations: toToolInvocationsJson(toolInvocations) },
    select: { id: true },
  })
}

/** The newest message of a chat (any role), or null. Single indexed row read. */
export async function getLatestMessage(chatId: string): Promise<Message | null> {
  const message = await prisma.message.findFirst({
    where: { chatId },
    orderBy: { created_at: 'desc' },
    select: messageSelect,
  })
  return message
    ? {
        ...message,
        role: toMessageRole(message.role),
        toolInvocations: readToolInvocations(message.tool_invocations),
        attachments: readAttachments(message.attachments),
      }
    : null
}

export async function createChatFromMessages(
  userId: string,
  title: string,
  messages: Message[]
): Promise<Chat> {
  const path = generateChatPath()

  const chat = await prisma.$transaction(
    async tx => {
      const createdChat = await tx.chat.create({
        data: { userId, title, path },
        select: {
          id: true,
          userId: true,
          title: true,
          created_at: true,
          updated_at: true,
          path: true,
        },
      })

      if (messages.length > 0) {
        const preparedMessages = messages.map(msg => {
          const createdAt = msg.created_at || new Date()
          return {
            chatId: createdChat.id,
            role: msg.role,
            content: msg.content,
            tool_invocations: toToolInvocationsJson(msg.toolInvocations),
            attachments: msg.attachments || undefined,
            created_at: createdAt instanceof Date ? createdAt : new Date(createdAt),
          }
        })

        await tx.message.createMany({
          data: preparedMessages,
        })
      }

      return createdChat
    },
    {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 10000,
    }
  )

  return { ...chat, path }
}

export async function forkSharedChatToUser(shareId: string, userId: string): Promise<Chat | null> {
  const shared = await getChatShareWithMessages(shareId)
  if (!shared) return null
  const title = shared.share.title || shared.chat.title || 'Shared chat'
  return createChatFromMessages(userId, title, shared.messages)
}

export async function getCanvasDocuments(chatId: string): Promise<CanvasDocument[]> {
  try {
    const documents = await prisma.canvasDocument.findMany({
      where: { chatId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        chatId: true,
        title: true,
        content: true,
        type: true,
        created_at: true,
        updated_at: true,
      },
    })
    return documents
  } catch (error) {
    console.error('Error getting canvas documents:', error)
    return []
  }
}

export async function createCanvasDocument(
  chatId: string,
  title: string,
  content: string,
  type = 'document'
): Promise<CanvasDocument> {
  const document = await prisma.canvasDocument.create({
    data: {
      chatId,
      title,
      content,
      type,
    },
    select: {
      id: true,
      chatId: true,
      title: true,
      content: true,
      type: true,
      created_at: true,
      updated_at: true,
    },
  })
  return document
}

export async function updateCanvasDocument(
  id: string,
  title: string,
  content: string
): Promise<void> {
  await prisma.canvasDocument.update({
    where: { id },
    data: {
      title,
      content,
      updated_at: new Date(),
    },
    select: { id: true },
  })
}

type VoteMessageMetadata = {
  content?: string
  role?: string
}

export async function saveVote(
  chatId: string,
  messageId: string,
  isUpvoted: boolean,
  messageMetadata?: VoteMessageMetadata
): Promise<void> {
  try {
    const messageExists = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true },
    })

    if (!messageExists && messageMetadata?.content) {
      await prisma.message.create({
        data: {
          id: messageId,
          chatId,
          role: messageMetadata.role || 'assistant',
          content: messageMetadata.content,
        },
        select: { id: true },
      })
    }

    await prisma.vote.upsert({
      where: {
        chatId_messageId: {
          chatId,
          messageId,
        },
      },
      update: {
        is_upvoted: isUpvoted,
      },
      create: {
        chatId,
        messageId,
        is_upvoted: isUpvoted,
      },
      select: { chatId: true },
    })
  } catch (error) {
    console.error('Error in saveVote:', error)
    throw error
  }
}

export async function deleteAllArchivedChats(userId: string): Promise<number> {
  const result = await prisma.chat.deleteMany({
    where: {
      userId,
      archived: true,
    },
  })
  return result.count
}

export async function getChatsWithMessageCounts(
  userId: string,
  limit: number = 15,
  offset: number = 0
): Promise<(Chat & { messageCount: number })[]> {
  const chatsWithCounts = await prisma.chat.findMany({
    where: {
      userId,
      archived: false,
    },
    orderBy: { updated_at: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true,
      userId: true,
      title: true,
      created_at: true,
      updated_at: true,
      path: true,
      _count: {
        select: {
          messages: true,
        },
      },
    },
  })

  return chatsWithCounts.map(chat => ({
    id: chat.id,
    userId: chat.userId,
    title: chat.title,
    created_at: chat.created_at,
    updated_at: chat.updated_at,
    path: chat.path,
    messageCount: chat._count.messages,
  }))
}
