import type { LegacyMessage } from '@/lib/ai-message-conversion'
import { getModelConfig, type ModelConfig } from '@/lib/model-registry'
import type { Attachment } from '@/types/attachment'

import { getToolInputPayload, getToolOutputPayload } from './tool-helpers'

type DirectToolCallResult = any


function extractPdfUrlsFromToolResult(toolCall: any): Attachment[] {
  if (!toolCall?.result) return []

  const attachments: Attachment[] = []

  if (toolCall.result.papers?.length) {
    for (const paper of toolCall.result.papers.slice(0, 5)) {
      if (paper.url && (paper.url.endsWith('.pdf') || paper.url.includes('.pdf'))) {
        attachments.push({
          url: paper.url,
          name: paper.title || 'paper.pdf',
          contentType: 'application/pdf',
        })
      }
    }
  }

  if (toolCall.result.url && toolCall.result.url.includes('.pdf')) {
    attachments.push({
      url: toolCall.result.url,
      name: toolCall.result.filename || toolCall.result.title || 'syllabus.pdf',
      contentType: 'application/pdf',
    })
  }

  if (toolCall.result.matches?.length) {
    for (const match of toolCall.result.matches.slice(0, 3)) {
      if (match.url && match.url.includes('.pdf')) {
        attachments.push({
          url: match.url,
          name: match.filename || match.title || 'syllabus.pdf',
          contentType: 'application/pdf',
        })
      }
    }
  }

  return attachments
}

function buildToolContextFromInvocation(toolCall: any): string {
  if (!toolCall?.result) return ''

  if (toolCall.toolName === 'knowledgeBase' && toolCall.result.success && toolCall.result.chunks) {
    const knowledgeContext = toolCall.result.chunks
      .map((c: any) => (c.content || '').trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 6000)

    if (knowledgeContext) {
      return `\n\n[INTERNAL - KNOWLEDGE BASE]:\n${knowledgeContext}\n\nUse this to answer the user. Do not include this block in your response.`
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
      ? `\n\n[INTERNAL - VTOP ${command.toUpperCase()}]:\n${dataContext}\n\nUse this to answer the user. Do not include this block in your response.`
      : ''
  }

  if (toolCall.result.papers?.length) {
    const papers = toolCall.result.papers

    return `\n\n[INTERNAL - PAPERS]: ${papers.length} past papers attached. Use their content to answer the user. Do not include this block in your response.`
  }

  if (toolCall.result.faculty?.length) {
    return `\n\n[INTERNAL - FACULTY]: Found ${toolCall.result.faculty.length} faculty members. Do not include this block in your response.`
  }

  if (toolCall.result.companies?.length) {
    return `\n\n[INTERNAL - COMPANIES]: Found ${toolCall.result.companies.length} companies. Do not include this block in your response.`
  }

  if (toolCall.result.data?.todayMenu) {
    return `\n\n[INTERNAL - MESS MENU]: Retrieved menu for ${toolCall.result.data.messType}. Do not include this block in your response.`
  }

  if (
    (toolCall.toolName === 'submitFeedback' || toolCall.toolName === 'contributeKnowledge') &&
    toolCall.result?.issueUrl
  ) {
    return `\n\n[INTERNAL - META]: Feedback logged at ${toolCall.result.issueUrl}. Do not include this block in your response.`
  }

  return ''
}

function collectPdfAttachmentsFromMessages(messages: LegacyMessage[]): Attachment[] {
  const attachments: Attachment[] = []
  
  for (const message of messages) {
    if (message.role === 'assistant' && (message as any).toolInvocations?.length) {
      for (const toolCall of (message as any).toolInvocations) {
        attachments.push(...extractPdfUrlsFromToolResult(toolCall))
      }
    }
  }
  
  return attachments
}

export function enhanceMessagesWithToolContext(
  messages: LegacyMessage[],
  directToolCallResult?: DirectToolCallResult
): LegacyMessage[] {
  const pdfAttachments = collectPdfAttachmentsFromMessages(messages)
  
  const enhanced = messages.map((message: any, index: number) => {
    if (message.role === 'user' && index === messages.length - 1) {

      if (pdfAttachments.length > 0) {
        const existingAttachments = message.attachments || []
        const newAttachments = [...existingAttachments, ...pdfAttachments]
        return { ...message, attachments: newAttachments }
      }
      return message
    }

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
            toolContext = `\n\n[INTERNAL - VTOP ${command.toUpperCase()}]:\n${dataContext}\n\nUse this to answer the user. Do not include this block in your response.`
          }
        }
      }

      const directPdfAttachments = extractPdfUrlsFromToolResult(directToolCallResult)

      if (toolContext || directPdfAttachments.length > 0) {
        const existingAttachments = (lastUserMessage as any).attachments || []
        enhanced[enhanced.length - 1] = {
          ...lastUserMessage,
          content: toolContext ? (lastUserMessage.content || '') + toolContext : lastUserMessage.content,
          attachments: [...existingAttachments, ...directPdfAttachments],
        }
      }
    }
  }

  return enhanced
}

type PreparedMessagesResult = {
  finalMessages: any[]
  model: ModelConfig
  attachmentAware: boolean
}

export async function prepareFinalMessages(
  enhancedMessages: any[],
  systemMessages: { role: 'system'; content: string }[],
  prefersWebSearch: boolean,
  includeSystemPrompt: boolean = true
): Promise<PreparedMessagesResult> {
  const attachmentAware = enhancedMessages.some(
    (m: any) =>
      Array.isArray(m.attachments) &&
      m.attachments.some(
        (a: any) => a?.contentType?.startsWith('application/pdf') || a?.contentType?.startsWith('image/')
      )
  )

  let model = getModelConfig('chat')
  const hasPdf =
    attachmentAware &&
    enhancedMessages.some((m: any) => m.attachments?.some((a: any) => a?.contentType === 'application/pdf'))
  if (hasPdf) model = getModelConfig('chatAttachment')

  const finalMessages: any[] = []

  if (!prefersWebSearch && includeSystemPrompt) {
    finalMessages.push(...systemMessages)
  } else if (prefersWebSearch && includeSystemPrompt && systemMessages?.length) {
    finalMessages.push(systemMessages[0])
  }

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
      let hasBinary = false
      if (m.content) parts.push({ type: 'text', text: m.content })

      for (const att of m.attachments) {
        if (!att?.contentType) continue
        if (att.contentType.startsWith('image/')) {
          // For images, just pass the URL directly - AI SDK supports image URLs
          parts.push({
            type: 'image',
            image: att.url,
          })
          hasBinary = true
        } else if (att.contentType.startsWith('application/pdf')) {
          parts.push({
            type: 'file',
            data: att.url,
            mediaType: att.contentType,
          })
          hasBinary = true
        }
      }

      if (hasBinary) {
        finalMessages.push({ role: m.role, content: parts })
      } else if (m.content && m.content.trim().length > 0) {
        finalMessages.push({ role: m.role, content: m.content })
      }
    }
  }

  const filtered = finalMessages.filter(msg => {
    if (!msg) return false
    if (typeof msg.content === 'string') return msg.content.trim().length > 0
    if (Array.isArray(msg.content)) return msg.content.length > 0
    return Boolean(msg.content)
  })

  return { finalMessages: filtered, model, attachmentAware }
}
