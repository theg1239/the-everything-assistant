import { prisma } from './prisma'

export interface User {
  id: string
  email: string
  name: string | null
  image: string | null
  preferences?: any
  created_at: Date
  updated_at: Date
}

export interface Chat {
  id: string
  userId: string
  title: string
  created_at: Date
  updated_at: Date
  path: string
}

export interface Message {
  id: string
  chatId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolInvocations?: any
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

export async function getUser(email: string): Promise<User | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    })
    return user as User
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
  return user as User
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
    return chats as Chat[]
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
    return chat as Chat | null
  } catch (error) {
    console.error('Error getting chat:', error)
    return null
  }
}

export async function createChat(userId: string, title: string, path: string): Promise<Chat> {
  const chat = await prisma.chat.create({
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
  return chat as Chat
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
        chat: chat as Chat, 
        message: { ...message, toolInvocations: message.tool_invocations } as Message 
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

export async function archiveChat(id: string, userId: string): Promise<void> {
  await prisma.chat.updateMany({
    where: {
      id,
      userId,
    },
    data: {
      archived: true,
    },
  })
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
    return chats as Chat[]
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

export async function getMessages(chatId: string): Promise<Message[]> {
  try {
    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        chatId: true,
        role: true,
        content: true,
        tool_invocations: true,
        created_at: true,
      },
    })
    return messages.map(msg => ({
      ...msg,
      toolInvocations: msg.tool_invocations ?? undefined,
    })) as Message[]
  } catch (error) {
    console.error('Error getting messages:', error)
    return []
  }
}

export async function saveMessage(
  chatId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  toolInvocations?: any,
  messageId?: string
): Promise<Message> {
  let safeToolInvocations = undefined
  if (toolInvocations) {
    try {
      safeToolInvocations = JSON.parse(JSON.stringify(toolInvocations))
    } catch (e) {
      console.error('Failed to serialize toolInvocations for DB:', e)
      safeToolInvocations = undefined
    }
  }
  const message = await prisma.message.create({
    data: {
      id: messageId,
      chatId,
      role,
      content,
      tool_invocations: safeToolInvocations,
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
  return { ...message, toolInvocations: message.tool_invocations } as Message
}

// Optimized canvas document queries
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
    return documents as CanvasDocument[]
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
  return document as CanvasDocument
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

export async function deleteCanvasDocument(id: string): Promise<void> {
  await prisma.canvasDocument.delete({
    where: { id },
    select: { id: true },
  })
}

export async function getVote(chatId: string, messageId: string): Promise<Vote | null> {
  try {
    const vote = await prisma.vote.findUnique({
      where: {
        chatId_messageId: {
          chatId,
          messageId,
        },
      },
      select: {
        chatId: true,
        messageId: true,
        is_upvoted: true,
      },
    })
    return vote as Vote
  } catch (error) {
    console.error('Error getting vote:', error)
    return null
  }
}

export async function saveVote(
  chatId: string,
  messageId: string,
  isUpvoted: boolean
): Promise<void> {
  try {
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

export async function createStreamId(streamId: string, chatId: string): Promise<void> {
  await prisma.streamId.create({
    data: {
      streamId,
      chatId,
    },
    select: { id: true },
  })
}

export async function getStreamIdsByChatId(chatId: string): Promise<string[]> {
  const streamIds = await prisma.streamId.findMany({
    where: { chatId },
    orderBy: { createdAt: 'asc' },
    select: { streamId: true },
  })

  return streamIds.map((s: { streamId: string }) => s.streamId)
}

export async function getMostRecentStreamId(chatId: string): Promise<string | null> {
  const streamId = await prisma.streamId.findFirst({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    select: { streamId: true },
  })
  return streamId?.streamId || null
}

export async function getLastAssistantMessage(chatId: string): Promise<any | null> {
  const message = await prisma.message.findFirst({
    where: {
      chatId,
      role: 'assistant',
    },
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      chatId: true,
      role: true,
      content: true,
      tool_invocations: true,
      created_at: true,
    },
  })

  return message
    ? {
        ...message,
        toolInvocations: message.tool_invocations,
      }
    : null
}

export async function deleteStreamIdsByChatId(chatId: string): Promise<void> {
  await prisma.streamId.deleteMany({
    where: { chatId },
  })
}

export async function getMessageCountByUserId(
  userId: string,
  differenceInHours: number = 24
): Promise<number> {
  const timeThreshold = new Date(Date.now() - differenceInHours * 60 * 60 * 1000)

  const count = await prisma.message.count({
    where: {
      chat: {
        userId,
      },
      created_at: {
        gte: timeThreshold,
      },
    },
  })

  return count
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

export async function batchUpdateChatTimestamps(chatIds: string[]): Promise<void> {
  await prisma.chat.updateMany({
    where: {
      id: {
        in: chatIds,
      },
    },
    data: {
      updated_at: new Date(),
    },
  })
}

export async function getRecentMessagesForUser(
  userId: string,
  limit: number = 50
): Promise<Message[]> {
  const messages = await prisma.message.findMany({
    where: {
      chat: {
        userId,
        archived: false,
      },
    },
    orderBy: { created_at: 'desc' },
    take: limit,
    select: {
      id: true,
      chatId: true,
      role: true,
      content: true,
      tool_invocations: true,
      created_at: true,
    },
  })

  return messages.map(msg => ({
    ...msg,
    toolInvocations: msg.tool_invocations ?? undefined,
  })) as Message[]
}
