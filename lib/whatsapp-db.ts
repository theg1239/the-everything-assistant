import { prisma } from './prisma'

export interface WhatsAppConversation {
  id: string
  phoneNumber: string
  userName: string | null
  userId: string | null
  isActive: boolean
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface WhatsAppMessage {
  id: string
  conversationId: string
  messageId: string
  direction: 'inbound' | 'outbound'
  content: string
  messageType: string
  status: string
  isCommand: boolean
  command: string | null
  aiResponse: string | null
  processingTimeMs: number | null
  createdAt: Date
}

export async function getOrCreateWhatsAppConversation(
  phoneNumber: string,
  userName?: string
): Promise<WhatsAppConversation> {
  try {
    let conversation = await prisma.whatsAppConversation.findUnique({
      where: { phoneNumber },
    })

    if (!conversation) {
      conversation = await prisma.whatsAppConversation.create({
        data: {
          phoneNumber,
          userName: userName || null,
          lastMessageAt: new Date(),
        },
      })
      console.log(`Created new WhatsApp conversation for ${phoneNumber}`)
    } else if (userName && !conversation.userName) {
      conversation = await prisma.whatsAppConversation.update({
        where: { phoneNumber },
        data: {
          userName,
          lastMessageAt: new Date(),
        },
      })
    } else {
      conversation = await prisma.whatsAppConversation.update({
        where: { phoneNumber },
        data: { lastMessageAt: new Date() },
      })
    }

    return conversation as WhatsAppConversation
  } catch (error) {
    console.error('Error in getOrCreateWhatsAppConversation:', error)
    throw error
  }
}

export async function saveWhatsAppMessage(
  conversationId: string,
  messageId: string,
  direction: 'inbound' | 'outbound',
  content: string,
  options: {
    messageType?: string
    status?: string
    isCommand?: boolean
    command?: string
    aiResponse?: string
    processingTimeMs?: number
  } = {}
): Promise<WhatsAppMessage> {
  try {
    const message = await prisma.whatsAppMessage.create({
      data: {
        conversationId,
        messageId,
        direction,
        content,
        messageType: options.messageType || 'text',
        status: options.status || 'sent',
        isCommand: options.isCommand || false,
        command: options.command || null,
        aiResponse: options.aiResponse || null,
        processingTimeMs: options.processingTimeMs || null,
      },
    })

    return message as WhatsAppMessage
  } catch (error) {
    console.error('Error saving WhatsApp message:', error)
    throw error
  }
}

export async function getWhatsAppMessages(
  conversationId: string,
  limit: number = 50,
  offset: number = 0
): Promise<WhatsAppMessage[]> {
  try {
    const messages = await prisma.whatsAppMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })

    return messages as WhatsAppMessage[]
  } catch (error) {
    console.error('Error getting WhatsApp messages:', error)
    return []
  }
}

export async function getActiveWhatsAppConversations(
  limit: number = 20,
  offset: number = 0
): Promise<(WhatsAppConversation & { messageCount: number })[]> {
  try {
    const conversations = await prisma.whatsAppConversation.findMany({
      where: { isActive: true },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        _count: {
          select: {
            messages: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return conversations.map(conv => ({
      id: conv.id,
      phoneNumber: conv.phoneNumber,
      userName: conv.userName,
      userId: conv.userId,
      isActive: conv.isActive,
      lastMessageAt: conv.lastMessageAt,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv._count.messages,
      user: conv.user,
    })) as any[]
  } catch (error) {
    console.error('Error getting active WhatsApp conversations:', error)
    return []
  }
}

export async function getWhatsAppConversationByPhone(
  phoneNumber: string
): Promise<WhatsAppConversation | null> {
  try {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { phoneNumber },
    })

    return conversation as WhatsAppConversation | null
  } catch (error) {
    console.error('Error getting WhatsApp conversation by phone:', error)
    return null
  }
}

export async function linkWhatsAppConversationToUser(
  phoneNumber: string,
  userId: string
): Promise<WhatsAppConversation | null> {
  try {
    const conversation = await prisma.whatsAppConversation.update({
      where: { phoneNumber },
      data: { userId },
    })

    console.log(`Linked WhatsApp conversation ${phoneNumber} to user ${userId}`)
    return conversation as WhatsAppConversation
  } catch (error) {
    console.error('Error linking WhatsApp conversation to user:', error)
    return null
  }
}

export async function updateWhatsAppConversationStatus(
  phoneNumber: string,
  isActive: boolean
): Promise<WhatsAppConversation | null> {
  try {
    const conversation = await prisma.whatsAppConversation.update({
      where: { phoneNumber },
      data: { isActive },
    })

    return conversation as WhatsAppConversation
  } catch (error) {
    console.error('Error updating WhatsApp conversation status:', error)
    return null
  }
}

export async function getWhatsAppStats(days: number = 7): Promise<{
  totalConversations: number
  activeConversations: number
  totalMessages: number
  commandMessages: number
  averageResponseTime: number
  messagesPerDay: { date: string; count: number }[]
}> {
  try {
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)

    const [
      totalConversations,
      activeConversations,
      totalMessages,
      commandMessages,
      responseTimeData,
      dailyMessages,
    ] = await Promise.all([
      prisma.whatsAppConversation.count(),

      prisma.whatsAppConversation.count({
        where: { isActive: true },
      }),

      prisma.whatsAppMessage.count({
        where: {
          createdAt: { gte: fromDate },
        },
      }),

      prisma.whatsAppMessage.count({
        where: {
          isCommand: true,
          createdAt: { gte: fromDate },
        },
      }),

      prisma.whatsAppMessage.findMany({
        where: {
          processingTimeMs: { not: null },
          createdAt: { gte: fromDate },
        },
        select: {
          processingTimeMs: true,
        },
      }),

      // Daily message counts
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM whatsapp_messages 
        WHERE created_at >= ${fromDate}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
    ])

    const averageResponseTime =
      responseTimeData.length > 0
        ? responseTimeData.reduce((sum, msg) => sum + (msg.processingTimeMs || 0), 0) /
          responseTimeData.length
        : 0

    return {
      totalConversations,
      activeConversations,
      totalMessages,
      commandMessages,
      averageResponseTime,
      messagesPerDay: (dailyMessages as any[]).map(row => ({
        date: new Date(row.date).toISOString().split('T')[0],
        count: Number(row.count),
      })),
    }
  } catch (error) {
    console.error('Error getting WhatsApp stats:', error)
    return {
      totalConversations: 0,
      activeConversations: 0,
      totalMessages: 0,
      commandMessages: 0,
      averageResponseTime: 0,
      messagesPerDay: [],
    }
  }
}

export async function cleanupInactiveWhatsAppConversations(
  daysInactive: number = 30
): Promise<number> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive)

    const result = await prisma.whatsAppConversation.updateMany({
      where: {
        lastMessageAt: { lt: cutoffDate },
        isActive: true,
      },
      data: {
        isActive: false,
      },
    })

    console.log(`Marked ${result.count} WhatsApp conversations as inactive`)
    return result.count
  } catch (error) {
    console.error('Error cleaning up inactive WhatsApp conversations:', error)
    return 0
  }
}
