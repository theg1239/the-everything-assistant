import { memoryService } from '@/lib/memory/memory-service'

export async function buildMemoryContext(userId: string) {
  const memorySettings = await memoryService.getUserMemorySettings(userId)
  const isEnabled = memorySettings?.isEnabled ?? true

  if (!isEnabled) {
    return { context: '', isEnabled }
  }

  let memoryContext = ''

  const memories = await memoryService.getUserMemories(userId, { pageSize: 100 })
  if (memories.length > 0) {
    memoryContext = `
<memories>
  <context>Saved information from previous conversations:</context>
  <memory_list>
${memories
  .map(
    (m: { content: string; updatedAt: string | number | Date }) =>
      `    <memory>
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

