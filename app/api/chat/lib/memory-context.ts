import { memoryService } from '@/lib/memory/memory-service'

/**
 * Memory block for the system prompt. Settings and memories are read in parallel
 * (one round-trip instead of two); the memories are discarded when memory is off.
 */
export async function buildMemoryContext(userId: string) {
  const [isEnabled, memories] = await Promise.all([
    memoryService.isMemoryEnabled(userId),
    memoryService.getMemoriesForPrompt(userId, 100),
  ])

  if (!isEnabled) {
    return { context: '', isEnabled }
  }

  let memoryContext = ''

  if (memories.length > 0) {
    memoryContext = `
<memories>
  <context>Saved information from previous conversations:</context>
  <memory_list>
${memories
  .map(
    m =>
      `    <memory id="${m.id}">
      <content>${m.content}</content>
      <last_updated>${new Date(m.updatedAt).toLocaleDateString()}</last_updated>
    </memory>`
  )
  .join('\n')}
  </memory_list>
</memories>`
  }

  return { context: memoryContext, isEnabled }
}
