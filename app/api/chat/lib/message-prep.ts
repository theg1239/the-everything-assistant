import type { LegacyMessage } from '@/lib/ai-message-conversion'

import { getToolInputPayload, getToolOutputPayload } from './tool-helpers'

type DirectToolCallResult = any

function buildToolContextFromInvocation(toolCall: any): string {
  if (!toolCall?.result) return ''

  if (toolCall.toolName === 'knowledgeBase' && toolCall.result.success && toolCall.result.chunks) {
    const knowledgeContext = toolCall.result.chunks
      .map((c: any) => (c.content || '').trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 6000)

    if (knowledgeContext) {
      return `\n\n[KNOWLEDGE BASE CONTEXT]:\n${knowledgeContext}\n\n[IMPORTANT]: Use the above knowledge base information to answer the user's question. Format your response naturally with proper markdown formatting, bullet points, and lowercase text (except for proper nouns and course codes).`
    }
    return ''
  }

  if (toolCall.toolName === 'queryVTOP' && toolCall.result.success) {
    const command = toolCall.result.command || toolCall.args?.command || 'data'
    let dataContext = ''

    if (toolCall.result.formatted_content) {
      dataContext = toolCall.result.formatted_content
    } else if (toolCall.result.summary) {
      dataContext = toolCall.result.summary
    } else if (toolCall.result.data || toolCall.result.output) {
      const rawData = toolCall.result.data || toolCall.result.output
      if (typeof rawData === 'string') {
        dataContext = rawData.substring(0, 500) + (rawData.length > 500 ? '...' : '')
      } else if (Array.isArray(rawData)) {
        dataContext = `Retrieved ${rawData.length} items for ${command}`
      } else {
        dataContext = `Retrieved ${command} data from VTOP`
      }
    }

    return dataContext
      ? `\n\n[VTOP ${command.toUpperCase()} DATA CONTEXT]:\n${dataContext}\n\n[IMPORTANT]: VTOP ${command} data was successfully retrieved above. Use this data to answer any follow-up questions about ${command}.`
      : ''
  }

  if (toolCall.result.papers?.length) {
    return `\n\n[PAPERS DATA CONTEXT]:\nFound ${toolCall.result.papers.length} past papers`
  }

  if (toolCall.result.faculty?.length) {
    return `\n\n[FACULTY DATA CONTEXT]:\nFound ${toolCall.result.faculty.length} faculty members`
  }

  if (toolCall.result.companies?.length) {
    return `\n\n[COMPANIES DATA CONTEXT]:\nFound ${toolCall.result.companies.length} companies`
  }

  if (toolCall.result.data?.todayMenu) {
    return `\n\n[MESS MENU DATA CONTEXT]:\nRetrieved mess menu for ${toolCall.result.data.messType}`
  }

  return ''
}

export function enhanceMessagesWithToolContext(
  messages: LegacyMessage[],
  directToolCallResult?: DirectToolCallResult
): LegacyMessage[] {
  const enhanced = messages.map((message: any, index: number) => {
    if (message.role === 'user' && index === messages.length - 1) return message

    if (message.role === 'assistant' && message.toolInvocations?.length) {
      let toolContext = ''
      for (const toolCall of message.toolInvocations) {
        toolContext += buildToolContextFromInvocation(toolCall)
      }
      if (toolContext) {
        return { ...message, content: (message.content || '') + toolContext }
      }
    }
    return message
  })

  if (directToolCallResult) {
    const lastUserMessage = enhanced[enhanced.length - 1]
    if (lastUserMessage && lastUserMessage.role === 'user') {
      let toolContext = ''
      if (directToolCallResult.toolName === 'queryVTOP') {
        const directResultPayload = getToolOutputPayload(directToolCallResult)
        if (directResultPayload?.success) {
          const command =
            directResultPayload.command || getToolInputPayload(directToolCallResult)?.command || 'data'
          let dataContext = ''

          if (directResultPayload.formatted_content) {
            dataContext = directResultPayload.formatted_content
          } else if (directResultPayload.summary) {
            dataContext = directResultPayload.summary
          } else if (directResultPayload.data || directResultPayload.output) {
            const rawData = directResultPayload.data || directResultPayload.output
            if (typeof rawData === 'string') {
              dataContext = rawData.substring(0, 500) + (rawData.length > 500 ? '...' : '')
            } else if (Array.isArray(rawData)) {
              dataContext = `Retrieved ${rawData.length} items for ${command}`
            } else {
              dataContext = `Retrieved ${command} data from VTOP`
            }
          }

          if (dataContext) {
            toolContext = `\n\n[VTOP ${command.toUpperCase()} DATA CONTEXT]:\n${dataContext}\n\n[IMPORTANT]: VTOP ${command} data was successfully retrieved above. Use this data to answer the user's question about ${command}.`
          }
        }
      }

      if (toolContext) {
        enhanced[enhanced.length - 1] = {
          ...lastUserMessage,
          content: (lastUserMessage.content || '') + toolContext,
        }
      }
    }
  }

  return enhanced
}

type PreparedMessagesResult = {
  finalMessages: any[]
  modelName: string
  attachmentAware: boolean
}

export async function prepareFinalMessages(
  enhancedMessages: any[],
  combinedSystemPrompt: string,
  prefersWebSearch: boolean
): Promise<PreparedMessagesResult> {
  const attachmentAware = enhancedMessages.some(
    (m: any) =>
      Array.isArray(m.attachments) &&
      m.attachments.some(
        (a: any) => a?.contentType?.startsWith('application/pdf') || a?.contentType?.startsWith('image/')
      )
  )

  let modelName = 'gemini-flash-latest'
  const hasPdf =
    attachmentAware &&
    enhancedMessages.some((m: any) => m.attachments?.some((a: any) => a?.contentType === 'application/pdf'))
  if (hasPdf) modelName = 'gemini-flash-latest'

  const finalMessages: any[] = prefersWebSearch ? [] : [{ role: 'system', content: combinedSystemPrompt }]

  if (!attachmentAware) {
    for (const m of enhancedMessages) {
      if (!m?.content || typeof m.content !== 'string' || m.content.trim().length === 0) continue
      finalMessages.push({ role: m.role, content: m.content })
    }
  } else {
    for (const m of enhancedMessages) {
      if (!m.attachments || m.attachments.length === 0) {
        if (m.content && m.content.trim().length > 0) {
          finalMessages.push({ role: m.role, content: m.content })
        }
        continue
      }

      const parts: any[] = []
      if (m.content) parts.push({ type: 'input_text', text: m.content })

      for (const att of m.attachments) {
        if (!att?.contentType) continue
        if (att.contentType.startsWith('application/pdf') || att.contentType.startsWith('image/')) {
          try {
            const res = await fetch(att.url)
            if (!res.ok) throw new Error(`fetch ${res.status}`)
            const ab = await res.arrayBuffer()
            const sizeMB = ab.byteLength / (1024 * 1024)
            if (sizeMB > 25) {
              parts.push({
                type: 'input_text',
                text: `Attachment '${att.name || 'file'}' skipped: size ${sizeMB.toFixed(1)}MB exceeds 25MB limit.`,
              })
              continue
            }
            parts.push({
              type: 'file',
              data: Buffer.from(ab),
              mimeType: att.contentType,
              name:
                att.name ||
                (att.contentType.startsWith('image/') ? 'image' : 'document') + '-' + Date.now(),
            })
          } catch (e: any) {
            parts.push({
              type: 'input_text',
              text: `Failed to load attachment '${att.name || 'file'}': ${e.message}`,
            })
          }
        }
      }

      if (parts.length > 0) {
        finalMessages.push({ role: m.role, content: parts })
      }
    }
  }

  const filtered = finalMessages.filter(msg => {
    if (!msg) return false
    if (typeof msg.content === 'string') return msg.content.trim().length > 0
    if (Array.isArray(msg.content)) return msg.content.length > 0
    return Boolean(msg.content)
  })

  return { finalMessages: filtered, modelName, attachmentAware }
}

