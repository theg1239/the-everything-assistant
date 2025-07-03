import { tool } from 'ai'
import { z } from 'zod'
import { memoryService } from './memory-service'

export function createMemoryTool(userId: string) {
  return {
    saveMemory: tool({
      description:
        'Save a memory to the knowledge base. Use this to remember important information about the user, their preferences, or key facts from the conversation. Use it when the user explicitly asks to remember something, or when you infer a piece of information is important for future interactions.',
      parameters: z.object({
        memoryContent: z.string().describe('The content of the memory to save.'),
        importance: z
          .number()
          .optional()
          .describe('The importance of the memory, from 1 (least important) to 5 (most important).'),
        tags: z.array(z.string()).optional().describe('Tags to help categorize the memory.'),
      }),
      execute: async ({ memoryContent, importance, tags }) => {
        try {
          const memory = await memoryService.upsertMemory(userId, {
            content: memoryContent,
            importance: importance as any,
            tags: tags || [],
          })
          return {
            success: true,
            memoryId: memory.id,
            message: 'Memory saved successfully.',
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message || 'Failed to save memory.',
          }
        }
      },
    }),
  }
}
