import { prisma } from './prisma'

export class DbOptimizations {
  static async batchGetChatsWithMetadata(
    userId: string,
    chatIds: string[]
  ): Promise<
    Array<{
      id: string
      title: string
      messageCount: number
      lastMessageAt: Date | null
      hasCanvasDocuments: boolean
    }>
  > {
    const results = await prisma.chat.findMany({
      where: {
        id: { in: chatIds },
        userId,
      },
      relationLoadStrategy: 'join',
      select: {
        id: true,
        title: true,
        updated_at: true,
        _count: {
          select: {
            messages: true,
            canvas_documents: true,
          },
        },
        messages: {
          select: {
            created_at: true,
          },
          orderBy: {
            created_at: 'desc',
          },
          take: 1,
        },
      },
    })

    return results.map(chat => ({
      id: chat.id,
      title: chat.title,
      messageCount: chat._count.messages,
      lastMessageAt: chat.messages[0]?.created_at || null,
      hasCanvasDocuments: chat._count.canvas_documents > 0,
    }))
  }

  static async searchMessages(
    userId: string,
    searchTerm: string,
    limit: number = 20
  ): Promise<
    Array<{
      messageId: string
      chatId: string
      chatTitle: string
      content: string
      created_at: Date
    }>
  > {
    const results = await prisma.$queryRaw`
      SELECT 
        m.id as "messageId",
        m."chatId",
        c.title as "chatTitle",
        m.content,
        m.created_at
      FROM messages m
      INNER JOIN chats c ON m."chatId" = c.id
      WHERE 
        c."userId" = ${userId}
        AND c.archived = false
        AND m.content ILIKE ${`%${searchTerm}%`}
      ORDER BY m.created_at DESC
      LIMIT ${limit}
    `

    return results as Array<{
      messageId: string
      chatId: string
      chatTitle: string
      content: string
      created_at: Date
    }>
  }

  static async getUserActivitySummary(
    userId: string,
    days: number = 7
  ): Promise<{
    totalChats: number
    totalMessages: number
    activeChats: number
    recentActivity: Array<{ date: string; messageCount: number }>
  }> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const [totalChats, totalMessages, activeChats, recentActivity] = await Promise.all([
      prisma.chat.count({
        where: { userId, archived: false },
      }),

      prisma.message.count({
        where: {
          chat: { userId, archived: false },
        },
      }),

      prisma.chat.count({
        where: {
          userId,
          archived: false,
          messages: {
            some: {
              created_at: { gte: startDate },
            },
          },
        },
      }),

      prisma.$queryRaw`
        SELECT 
          DATE(m.created_at) as date,
          COUNT(*)::integer as "messageCount"
        FROM messages m
        INNER JOIN chats c ON m."chatId" = c.id
        WHERE 
          c."userId" = ${userId}
          AND c.archived = false
          AND m.created_at >= ${startDate}
        GROUP BY DATE(m.created_at)
        ORDER BY date DESC
      `,
    ])

    return {
      totalChats,
      totalMessages,
      activeChats,
      recentActivity: recentActivity as Array<{ date: string; messageCount: number }>,
    }
  }

  static async cleanupOldData(olderThanDays: number = 90): Promise<{
    deletedStreamIds: number
    archivedOldChats: number
  }> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    const [deletedStreamIds, archivedOldChats] = await Promise.all([
      prisma.streamId.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      }),

      // Archive very old chats with no recent activity
      prisma.chat.updateMany({
        where: {
          updated_at: { lt: cutoffDate },
          archived: false,
        },
        data: {
          archived: true,
        },
      }),
    ])

    return {
      deletedStreamIds: deletedStreamIds.count,
      archivedOldChats: archivedOldChats.count,
    }
  }

  static async healthCheck(): Promise<{
    isConnected: boolean
    responseTime: number
    connectionCount?: number
  }> {
    const startTime = Date.now()

    try {
      await prisma.$queryRaw`SELECT 1`
      const responseTime = Date.now() - startTime

      let connectionCount: number | undefined
      try {
        const result = (await prisma.$queryRaw`
          SELECT count(*) as count 
          FROM pg_stat_activity 
          WHERE datname = current_database()
        `) as Array<{ count: bigint }>
        connectionCount = Number(result[0]?.count || 0)
      } catch {}

      return {
        isConnected: true,
        responseTime,
        connectionCount,
      }
    } catch (error) {
      return {
        isConnected: false,
        responseTime: Date.now() - startTime,
      }
    }
  }

  static async getChatsPaginated(
    userId: string,
    cursor?: string,
    limit: number = 15,
    archived: boolean = false
  ): Promise<{
    chats: Array<{
      id: string
      title: string
      path: string
      created_at: Date
      updated_at: Date
      messageCount: number
    }>
    nextCursor?: string
    hasMore: boolean
  }> {
    const chats = await prisma.chat.findMany({
      where: {
        userId,
        archived,
        ...(cursor && {
          updated_at: {
            lt: new Date(cursor),
          },
        }),
      },
      orderBy: { updated_at: 'desc' },
      take: limit + 1,
      relationLoadStrategy: 'join',
      select: {
        id: true,
        title: true,
        path: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
    })

    const hasMore = chats.length > limit
    const items = hasMore ? chats.slice(0, -1) : chats
    const nextCursor = hasMore ? items[items.length - 1]?.updated_at.toISOString() : undefined

    return {
      chats: items.map(chat => ({
        id: chat.id,
        title: chat.title,
        path: chat.path,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
        messageCount: chat._count.messages,
      })),
      nextCursor,
      hasMore,
    }
  }
}

export class QueryCache {
  private static cache = new Map<string, { data: any; expiry: number }>()
  private static readonly DEFAULT_TTL = 5 * 60 * 1000

  static get<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    if (Date.now() > cached.expiry) {
      this.cache.delete(key)
      return null
    }

    return cached.data as T
  }

  static set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl,
    })
  }

  static invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      return
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }

  static async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL
  ): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== null) return cached

    const data = await fetchFn()
    this.set(key, data, ttl)
    return data
  }
}
