import { prisma } from '@/lib/prisma'
import * as z from 'zod/v3';

export type MemoryImportance = 1 | 2 | 3 | 4 | 5
export type AutoSaveFilter = 'low' | 'medium' | 'high'

export const memorySchema = z.object({
  id: z.string().optional(),
  content: z.string().min(1, 'Memory content is required').max(1000, 'Memory is too long'),
  tags: z.array(z.string()).optional().default([]),
  importance: z.number().min(1).max(5).optional(),
})

export const memorySettingsSchema = z.object({
  isEnabled: z.boolean().optional(),
  maxOutputTokens: z.number().min(100).max(10000).optional(),
  autoSave: z.boolean().optional(),
  autoSaveFilter: z.enum(['low', 'medium', 'high']).optional(),
})

export interface Memory {
  id: string
  userId: string
  content: string
  tags: string[]
  importance: MemoryImportance
  lastUsedAt: Date
  createdAt: Date
  updatedAt: Date
}

export interface MemorySettings {
  id: string
  userId: string
  isEnabled: boolean
  maxOutputTokens: number
  autoSave: boolean
  autoSaveFilter: string
  createdAt: Date
  updatedAt: Date
}

export class MemoryService {
  private readonly MAX_MEMORY_TOKENS = 2000
  private readonly DEFAULT_IMPORTANCE: MemoryImportance = 3

  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4)
  }

  calculateSimilarity(a: string, b: string): number {
    const setA = new Set(a.toLowerCase().split(/\s+/))
    const setB = new Set(b.toLowerCase().split(/\s+/))

    const intersection = new Set([...setA].filter(x => setB.has(x)))
    const union = new Set([...setA, ...setB])

    return union.size > 0 ? intersection.size / union.size : 0
  }

  async upsertMemory(userId: string, data: z.infer<typeof memorySchema>): Promise<Memory> {
    const { id, ...memoryData } = memorySchema.parse(data)

    if (!memoryData.importance) {
      memoryData.importance = this.DEFAULT_IMPORTANCE
    }

    if (!memoryData.tags) {
      memoryData.tags = []
    }

    if (id) {
      return (prisma as any).memory.update({
        where: { id, userId },
        data: {
          ...memoryData,
          lastUsedAt: new Date(),
        },
      }) as Promise<Memory>
    }

    return (prisma as any).memory.create({
      data: {
        ...memoryData,
        userId,
        lastUsedAt: new Date(),
      },
    })
  }

  async getUserMemories(userId: string, { page = 1, pageSize = 20 } = {}): Promise<Memory[]> {
    const skip = (page - 1) * pageSize

    return (prisma as any).memory.findMany({
      where: { userId },
      orderBy: [{ importance: 'desc' }, { lastUsedAt: 'desc' }],
      skip,
      take: pageSize,
    }) as Promise<Memory[]>
  }

  async getRelevantMemories(
    userId: string,
    query: string,
    maxTokens: number = this.MAX_MEMORY_TOKENS
  ): Promise<Memory[]> {
    const memories = await this.getUserMemories(userId)
    const queryTerms = new Set(query.toLowerCase().split(/\s+/))

    const scoredMemories = memories.map((memory: Memory) => {
      const contentTerms = new Set(memory.content.toLowerCase().split(/\s+/))
      const intersection = new Set([...queryTerms].filter(term => contentTerms.has(term)))
      const score = intersection.size / queryTerms.size
      return { ...memory, score }
    })

    const relevantMemories = scoredMemories
      .sort((a, b) => {
        if (a.score !== b.score) return b.score - a.score
        return b.importance - a.importance
      })
      .filter(m => m.score > 0)

    let totalTokens = 0
    const result: Memory[] = []

    for (const memory of relevantMemories) {
      const tokens = this.estimateTokenCount(memory.content)
      if (totalTokens + tokens > maxTokens) break
      result.push(memory)
      totalTokens += tokens
    }

    return result
  }

  async getUserMemorySettings(userId: string): Promise<MemorySettings | null> {
    let settings = (await (prisma as any).memorySettings.findUnique({
      where: { userId },
    })) as Promise<MemorySettings | null>

    if (!settings) {
      settings = (await (prisma as any).memorySettings.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          isEnabled: true,
          maxOutputTokens: this.MAX_MEMORY_TOKENS,
          autoSave: true,
          autoSaveFilter: 'medium',
        },
      })) as Promise<MemorySettings>
    }

    return settings
  }

  async updateMemorySettings(
    userId: string,
    data: Partial<z.infer<typeof memorySettingsSchema>>
  ): Promise<MemorySettings> {
    const settings = memorySettingsSchema.partial().parse(data)
    return (prisma as any).memorySettings.upsert({
      where: { userId },
      update: settings,
      create: {
        userId,
        ...settings,
      },
    }) as Promise<MemorySettings>
  }

  async toggleMemoryEnabled(userId: string, enabled: boolean): Promise<MemorySettings> {
    return this.updateMemorySettings(userId, { isEnabled: enabled })
  }

  async deleteMemory(userId: string, memoryId: string): Promise<void> {
    return (prisma as any).memory.delete({
      where: { id: memoryId, userId },
    })
  }

  async getMemory(id: string, userId: string): Promise<Memory | null> {
    const memory = await (prisma as any).memory.findUnique({
      where: { id, userId },
    })
    return memory as Memory | null
  }

  async extractAndSaveMemory(
    userId: string,
    content: string,
    importance: MemoryImportance = 3
  ): Promise<Memory | null> {
    const settings = await this.getUserMemorySettings(userId)
    if (!settings?.autoSave) return null

    const sentences = content.split(/[.!?]+/).filter(Boolean)
    const relevantSentences = sentences.filter(
      (s: string) =>
        (s.includes('I ') || s.includes('My ') || s.includes(`I'm `)) &&
        s.length > 20 &&
        s.length < 200
    )

    if (relevantSentences.length === 0) return null

    const memoryContent = relevantSentences.join('. ').trim()

    const existingMemory = await this.findSimilarMemory(userId, memoryContent)
    if (existingMemory) return null

    return this.upsertMemory(userId, {
      content: memoryContent,
      importance,
      tags: [],
    })
  }

  private isPotentialMemory(text: string): boolean {
    const hasPersonalPronoun = /\b(I|you|your|my|mine|we|our|us)\b/i.test(text)
    const isQuestion = text.trim().endsWith('?')
    const isTooShort = text.length < 20
    const isTooLong = text.length > 500

    return hasPersonalPronoun && !isQuestion && !isTooShort && !isTooLong
  }

  private async checkSimilarMemoryExists(userId: string, text: string): Promise<boolean> {
    const existingMemories = await (prisma as any).memory.findMany({
      where: { userId },
      select: { content: true },
    })

    const normalizedText = text.toLowerCase().trim()

    return existingMemories.some((memory: { content: string }) => {
      const normalizedMemory = memory.content.toLowerCase().trim()
      return (
        normalizedMemory.includes(normalizedText) ||
        normalizedText.includes(normalizedMemory) ||
        this.calculateSimilarity(normalizedText, normalizedMemory) > 0.8
      )
    })
  }

  private estimateMemoryImportance(text: string, filter: AutoSaveFilter): MemoryImportance {
    let importance: MemoryImportance = 3

    if (/(schedule|time|meeting|class|exam)/i.test(text)) importance += 1
    if (/(prefer|like|dislike|hate|love)/i.test(text)) importance += 1
    if (/(important|critical|urgent|must)/i.test(text)) importance = 5

    const filterThreshold = {
      low: 2,
      medium: 3,
      high: 4,
    }[filter]

    return Math.min(Math.max(importance, filterThreshold), 5) as MemoryImportance
  }

  async findSimilarMemory(
    userId: string,
    content: string,
    threshold: number = 0.8
  ): Promise<Memory | null> {
    const memories = await this.getUserMemories(userId)

    return (
      memories.find(memory => this.calculateSimilarity(memory.content, content) > threshold) || null
    )
  }
}

export const memoryService = new MemoryService()
