import { tool } from 'ai'
import * as z from 'zod'
import { memoryService } from './memory-service'

export function createMemoryTool(userId: string) {
  const saveMemoryInputSchema = z.object({
    memoryContent: z.string().describe('The content of the memory to save.'),
    memoryId: z
      .string()
      .optional()
      .describe(
        'Exact id of an existing memory (the id attribute in the saved <memories> list) to replace with memoryContent. Omit to create a new memory.'
      ),
    importance: z
      .number()
      .optional()
      .describe('The importance of the memory, from 1 (least important) to 5 (most important).'),
    tags: z.array(z.string()).optional().describe('Tags to help categorize the memory.'),
  })

  return {
    saveMemory: tool({
      description:
        'Save a memory to the knowledge base. Use this to remember important information about the user, their preferences, or key facts from the conversation. Use it when the user explicitly asks to remember something, or when you infer a piece of information is important for future interactions. Check the saved memories first: if one already covers this fact, pass its memoryId with the full updated content instead of creating a duplicate.',
      inputSchema: saveMemoryInputSchema,
      execute: async ({ memoryContent, memoryId, importance, tags }) => {
        try {
          if (memoryId) {
            const updated = await memoryService.updateOwnedMemory(userId, memoryId, {
              content: memoryContent,
              importance,
              tags,
            })
            if (!updated) {
              return {
                success: false,
                error: `No saved memory has id "${memoryId}". Omit memoryId to create a new memory.`,
              }
            }
            return {
              success: true,
              memoryId: updated.id,
              message: 'Memory updated.',
              updated: true,
            }
          }

          // Identical content is already stored: nothing to add.
          const existing = await memoryService.findMemoryWithContent(userId, memoryContent)
          if (existing) {
            return {
              success: true,
              memoryId: existing.id,
              message: 'This memory is already saved.',
              updated: false,
            }
          }

          const memory = await memoryService.upsertMemory(userId, {
            content: memoryContent.trim(),
            importance,
            tags: tags || [],
          })
          return {
            success: true,
            memoryId: memory.id,
            message: 'New memory saved successfully.',
            updated: false,
          }
        } catch (error) {
          return {
            success: false,
            error: (error instanceof Error && error.message) || 'Failed to save memory.',
          }
        }
      },
    }),
  }
}
