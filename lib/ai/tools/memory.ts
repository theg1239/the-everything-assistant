import { createMemoryTool } from '@/lib/memory/memory-tools'

export function memoryTools(userId: string) {
  return createMemoryTool(userId)
}

