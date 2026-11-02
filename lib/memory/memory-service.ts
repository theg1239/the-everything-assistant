import { prisma } from '@/lib/prisma'
import type {
  Memory as MemoryRow,
  MemorySettings as MemorySettingsRow,
} from '@/prisma/generated/client'
import * as z from 'zod'

export type MemoryImportance = 1 | 2 | 3 | 4 | 5

export const memorySchema = z.object({
  id: z.string().optional(),
  content: z.string().min(1, 'Memory content is required').max(1000, 'Memory is too long'),
  // No `.default([])`: zod 4 applies defaults inside `.partial()`, which would wipe tags on PATCH.
  // `upsertMemory` fills in `[]` for new memories.
  tags: z.array(z.string()).optional(),
  importance: z.number().min(1).max(5).optional(),
})

export const memorySettingsSchema = z.object({
  isEnabled: z.boolean().optional(),
  maxTokens: z.number().min(100).max(10000).optional(),
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
  maxTokens: number
  maxOutputTokens: number
  autoSave: boolean
  autoSaveFilter: string
  createdAt: Date
  updatedAt: Date
}

/** DB importance is a plain Int; clamp it into the 1-5 scale the app uses. */
const toImportance = (value: number): MemoryImportance => {
  const rounded = Math.round(value)
  if (rounded <= 1) return 1
  if (rounded === 2) return 2
  if (rounded === 3) return 3
  if (rounded === 4) return 4
  return 5
}

const toMemory = (row: MemoryRow): Memory => ({
  id: row.id,
  userId: row.userId,
  content: row.content,
  tags: row.tags,
  importance: toImportance(row.importance),
  lastUsedAt: row.lastUsedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

export class MemoryService {
  private readonly MAX_MEMORY_TOKENS = 2000
  private readonly DEFAULT_IMPORTANCE: MemoryImportance = 3

  private toMemorySettingsResponse(settings: MemorySettingsRow): MemorySettings {
    const maxTokens = settings.maxTokens

    return {
      ...settings,
      maxTokens,
      maxOutputTokens: maxTokens,
    }
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
      const updated = await prisma.memory.update({
        where: { id, userId },
        data: {
          ...memoryData,
          lastUsedAt: new Date(),
        },
      })
      return toMemory(updated)
    }

    const created = await prisma.memory.create({
      data: {
        ...memoryData,
        userId,
        lastUsedAt: new Date(),
      },
    })
    return toMemory(created)
  }

  async getUserMemories(userId: string, { page = 1, pageSize = 20 } = {}): Promise<Memory[]> {
    const skip = (page - 1) * pageSize

    const rows = await prisma.memory.findMany({
      where: { userId },
      orderBy: [{ importance: 'desc' }, { lastUsedAt: 'desc' }],
      skip,
      take: pageSize,
    })
    return rows.map(toMemory)
  }

  /**
   * Hot-path read for the chat routes: only the flag, no default-row upsert.
   * A missing settings row means the schema default (`isEnabled: true`).
   */
  async isMemoryEnabled(userId: string): Promise<boolean> {
    const settings = await prisma.memorySettings.findUnique({
      where: { userId },
      select: { isEnabled: true },
    })
    return settings?.isEnabled ?? true
  }

  /**
   * Memories for the system prompt, same order as `getUserMemories`, only the used columns.
   * `id` is shown to the model so `saveMemory` can update a memory by exact id.
   */
  async getMemoriesForPrompt(
    userId: string,
    limit: number
  ): Promise<Array<{ id: string; content: string; updatedAt: Date }>> {
    return prisma.memory.findMany({
      where: { userId },
      orderBy: [{ importance: 'desc' }, { lastUsedAt: 'desc' }],
      take: limit,
      select: { id: true, content: true, updatedAt: true },
    })
  }

  async getUserMemorySettings(userId: string): Promise<MemorySettings | null> {
    let settings = await prisma.memorySettings.findUnique({
      where: { userId },
    })

    if (!settings) {
      settings = await prisma.memorySettings.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          isEnabled: true,
          maxTokens: this.MAX_MEMORY_TOKENS,
          autoSave: true,
          autoSaveFilter: 'medium',
        },
      })
    }

    return this.toMemorySettingsResponse(settings)
  }

  async updateMemorySettings(
    userId: string,
    data: Partial<z.infer<typeof memorySettingsSchema>>
  ): Promise<MemorySettings> {
    const settings = memorySettingsSchema.partial().parse(data)
    const resolvedMaxTokens = settings.maxTokens ?? settings.maxOutputTokens
    const { maxTokens: _maxTokens, maxOutputTokens: _maxOutputTokens, ...rest } = settings
    const dbSettings = resolvedMaxTokens === undefined ? rest : { ...rest, maxTokens: resolvedMaxTokens }

    const result = await prisma.memorySettings.upsert({
      where: { userId },
      update: dbSettings,
      create: {
        userId,
        ...dbSettings,
      },
    })

    return this.toMemorySettingsResponse(result)
  }

  async toggleMemoryEnabled(userId: string, enabled: boolean): Promise<MemorySettings> {
    return this.updateMemorySettings(userId, { isEnabled: enabled })
  }

  async deleteMemory(userId: string, memoryId: string): Promise<void> {
    await prisma.memory.delete({
      where: { id: memoryId, userId },
    })
  }

  /**
   * Applies a validated partial update to one of the user's memories in a single
   * ownership-scoped statement (no read-then-write). Fields left out keep their stored values.
   * Returns null when the memory doesn't exist or isn't the user's.
   */
  async updateOwnedMemory(
    userId: string,
    memoryId: string,
    patch: Partial<z.infer<typeof memorySchema>>
  ): Promise<Memory | null> {
    const { content, tags, importance } = memorySchema.partial().parse(patch)
    const [updated] = await prisma.memory.updateManyAndReturn({
      where: { id: memoryId, userId },
      data: {
        ...(content !== undefined ? { content } : {}),
        ...(tags !== undefined ? { tags } : {}),
        // `upsertMemory` treated a missing/falsy importance as "keep" (it merged the stored one).
        ...(importance ? { importance } : {}),
        lastUsedAt: new Date(),
      },
    })
    return updated ? toMemory(updated) : null
  }

  /** Deletes one of the user's memories in one statement; false when there was none. */
  async deleteOwnedMemory(userId: string, memoryId: string): Promise<boolean> {
    const { count } = await prisma.memory.deleteMany({ where: { id: memoryId, userId } })
    return count > 0
  }

  async getMemory(id: string, userId: string): Promise<Memory | null> {
    const memory = await prisma.memory.findUnique({
      where: { id, userId },
    })
    return memory ? toMemory(memory) : null
  }

  /** One of the user's memories whose stored content is exactly `content` (trimmed), if any. */
  async findMemoryWithContent(userId: string, content: string): Promise<Memory | null> {
    const row = await prisma.memory.findFirst({ where: { userId, content: content.trim() } })
    return row ? toMemory(row) : null
  }
}

export const memoryService = new MemoryService()
