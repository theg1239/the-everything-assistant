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
        archived: false, // Only return non-archived chats
      },
      orderBy: { updated_at: 'desc' },
      take: limit,
      skip: offset,
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
  })
  return chat as Chat
}

export async function updateChat(id: string, title: string): Promise<void> {
  await prisma.chat.update({
    where: { id },
    data: {
      title,
      updated_at: new Date(),
    },
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
  })
  return message as Message
}

export async function getCanvasDocuments(chatId: string): Promise<CanvasDocument[]> {
  try {
    const documents = await prisma.canvasDocument.findMany({
      where: { chatId },
      orderBy: { created_at: 'desc' },
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
  })
}

export async function deleteCanvasDocument(id: string): Promise<void> {
  await prisma.canvasDocument.delete({
    where: { id },
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
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    })

    if (!message) {
      console.error(`Message with ID ${messageId} not found`)
      throw new Error(`Message with ID ${messageId} not found`)
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
    })

    if (!chat) {
      console.error(`Chat with ID ${chatId} not found`)
      throw new Error(`Chat with ID ${chatId} not found`)
    }

    if (message.chatId !== chatId) {
      console.error(`Message ${messageId} does not belong to chat ${chatId}`)
      throw new Error(`Message ${messageId} does not belong to chat ${chatId}`)
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
    })
  } catch (error) {
    console.error('Error in saveVote:', error)
    throw error
  }
}
