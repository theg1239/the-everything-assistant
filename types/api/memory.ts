import * as z from 'zod'

/** Response schemas for `app/api/memories/**`, as they arrive over JSON (dates serialized). */

export const autoSaveFilterSchema = z.enum(['low', 'medium', 'high'])

/** A `Memory` from `lib/memory/memory-service` (`toMemory`). */
export const memoryResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  lastUsedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type MemoryResponse = z.infer<typeof memoryResponseSchema>

/** `GET /api/memories?page&pageSize` returns a bare array (no pagination envelope). */
export const memoriesResponseSchema = z.array(memoryResponseSchema)

/** `GET` / `PATCH /api/memories/settings` */
export const memorySettingsResponseSchema = z.object({
  isEnabled: z.boolean(),
  autoSave: z.boolean(),
  /** Stored as a free-form string column; anything unexpected reads as the default. */
  autoSaveFilter: autoSaveFilterSchema.catch('medium'),
  maxTokens: z.number(),
  maxOutputTokens: z.number(),
})

export type MemorySettingsResponse = z.infer<typeof memorySettingsResponseSchema>
