import type { FilePart, ModelMessage, SystemModelMessage, TextPart } from 'ai'

import type { LegacyAttachment, LegacyMessage } from '@/lib/ai-message-conversion'
import { getModelConfig, type ModelConfig } from '@/lib/model-registry'
import type { Attachment } from '@/types/attachment'

import type { DirectToolCallResult } from './direct-tool-call'
import {
  getToolInputPayload,
  getToolOutputPayload,
  isRecord,
  readString,
  type UnknownRecord,
} from './tool-helpers'

/** The parts of a tool invocation/result this module reads. */
type ToolInvocationLike = {
  toolName?: string
  args?: unknown
  result?: unknown
}

const records = (value: unknown): UnknownRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const nonEmptyArray = (value: unknown): unknown[] | null =>
  Array.isArray(value) && value.length > 0 ? value : null

function extractPdfUrlsFromToolResult(toolCall: ToolInvocationLike): Attachment[] {
  const result = isRecord(toolCall.result) ? toolCall.result : null
  if (!result) return []

  const attachments: Attachment[] = []

  for (const paper of records(result.papers).slice(0, 5)) {
    const url = readString(paper, 'url')
    if (url && (url.endsWith('.pdf') || url.includes('.pdf'))) {
      attachments.push({
        url,
        name: readString(paper, 'title') || 'paper.pdf',
        contentType: 'application/pdf',
      })
    }
  }

  const resultUrl = readString(result, 'url')
  if (resultUrl && resultUrl.includes('.pdf')) {
    attachments.push({
      url: resultUrl,
      name: readString(result, 'filename') || readString(result, 'title') || 'syllabus.pdf',
      contentType: 'application/pdf',
    })
  }

  for (const match of records(result.matches).slice(0, 3)) {
    const url = readString(match, 'url')
    if (url && url.includes('.pdf')) {
      attachments.push({
        url,
        name: readString(match, 'filename') || readString(match, 'title') || 'syllabus.pdf',
        contentType: 'application/pdf',
      })
    }
  }

  return attachments
}

/** Short text form of a successful VTOP tool payload, or '' when there is nothing to say. */
function describeVTOPPayload(payload: UnknownRecord, command: string): string {
  const formatted = readString(payload, 'formatted_content')
  if (formatted) return formatted
  const summary = readString(payload, 'summary')
  if (summary) return summary

  const rawData = payload.data || payload.output
  if (!rawData) return ''
  if (typeof rawData === 'string') {
    return rawData.substring(0, 500) + (rawData.length > 500 ? '...' : '')
  }
  if (Array.isArray(rawData)) {
    return `Retrieved ${rawData.length} items for ${command}`
  }
  return `Retrieved ${command} data from VTOP`
}

function buildToolContextFromInvocation(toolCall: ToolInvocationLike): string {
  const result = isRecord(toolCall.result) ? toolCall.result : null
  if (!result) return ''

  if (toolCall.toolName === 'knowledgeBase' && result.success && result.chunks) {
    const knowledgeContext = records(result.chunks)
      .map(chunk => (typeof chunk.content === 'string' ? chunk.content : '').trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 6000)

    if (knowledgeContext) {
      return `\n\n[INTERNAL - KNOWLEDGE BASE]:\n${knowledgeContext}\n\nUse this to answer the user. Do not include this block in your response.`
    }
    return ''
  }

  if (toolCall.toolName === 'queryVTOP' && result.success) {
    const args = isRecord(toolCall.args) ? toolCall.args : null
    const command = readString(result, 'command') || readString(args, 'command') || 'data'
    const dataContext = describeVTOPPayload(result, command)

    return dataContext
      ? `\n\n[INTERNAL - VTOP ${command.toUpperCase()}]:\n${dataContext}\n\nUse this to answer the user. Do not include this block in your response.`
      : ''
  }

  const papers = nonEmptyArray(result.papers)
  if (papers) {
    return `\n\n[INTERNAL - PAPERS]: ${papers.length} past papers attached. Use their content to answer the user. Do not include this block in your response.`
  }

  const faculty = nonEmptyArray(result.faculty)
  if (faculty) {
    return `\n\n[INTERNAL - FACULTY]: Found ${faculty.length} faculty members. Do not include this block in your response.`
  }

  const companies = nonEmptyArray(result.companies)
  if (companies) {
    return `\n\n[INTERNAL - COMPANIES]: Found ${companies.length} companies. Do not include this block in your response.`
  }

  const data = isRecord(result.data) ? result.data : null
  if (data?.todayMenu) {
    return `\n\n[INTERNAL - MESS MENU]: Retrieved menu for ${String(data.messType)}. Do not include this block in your response.`
  }

  const issueUrl = readString(result, 'issueUrl')
  if (
    (toolCall.toolName === 'submitFeedback' || toolCall.toolName === 'contributeKnowledge') &&
    issueUrl
  ) {
    return `\n\n[INTERNAL - META]: Feedback logged at ${issueUrl}. Do not include this block in your response.`
  }

  return ''
}

function collectPdfAttachmentsFromMessages(messages: LegacyMessage[]): Attachment[] {
  const attachments: Attachment[] = []

  for (const message of messages) {
    if (message.role === 'assistant' && message.toolInvocations?.length) {
      for (const toolCall of message.toolInvocations) {
        attachments.push(...extractPdfUrlsFromToolResult(toolCall))
      }
    }
  }

  return attachments
}

export function enhanceMessagesWithToolContext(
  messages: LegacyMessage[],
  directToolCallResult?: DirectToolCallResult | null
): LegacyMessage[] {
  const pdfAttachments = collectPdfAttachmentsFromMessages(messages)

  const enhanced = messages.map((message, index): LegacyMessage => {
    if (message.role === 'user' && index === messages.length - 1) {
      if (pdfAttachments.length > 0) {
        const existingAttachments = message.attachments || []
        return { ...message, attachments: [...existingAttachments, ...pdfAttachments] }
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
    const lastIndex = enhanced.length - 1
    const lastUserMessage = enhanced[lastIndex]
    if (lastUserMessage && lastUserMessage.role === 'user') {
      let toolContext = ''
      if (directToolCallResult.toolName === 'queryVTOP') {
        const directResultPayload = getToolOutputPayload(directToolCallResult)
        if (directResultPayload?.success) {
          const command =
            readString(directResultPayload, 'command') ||
            readString(getToolInputPayload(directToolCallResult), 'command') ||
            'data'
          const dataContext = describeVTOPPayload(directResultPayload, command)

          if (dataContext) {
            toolContext = `\n\n[INTERNAL - VTOP ${command.toUpperCase()}]:\n${dataContext}\n\nUse this to answer the user. Do not include this block in your response.`
          }
        }
      }

      const directPdfAttachments = extractPdfUrlsFromToolResult(directToolCallResult)

      if (toolContext || directPdfAttachments.length > 0) {
        const existingAttachments = lastUserMessage.attachments || []
        enhanced[lastIndex] = {
          ...lastUserMessage,
          content: toolContext
            ? (lastUserMessage.content || '') + toolContext
            : lastUserMessage.content,
          attachments: [...existingAttachments, ...directPdfAttachments],
        }
      }
    }
  }

  return enhanced
}

type PreparedMessagesResult = {
  /** System prompt; pass as `instructions` (v7 rejects system messages in `messages`). */
  instructions: SystemModelMessage[]
  /** Conversation messages (user/assistant only). */
  messages: ModelMessage[]
  model: ModelConfig
  attachmentAware: boolean
}

export type PrepareMessagesOptions = {
  thinkHarder?: boolean
  isAdmin?: boolean
}

const isModelAttachment = (attachment: LegacyAttachment) =>
  Boolean(
    attachment.contentType?.startsWith('application/pdf') ||
    attachment.contentType?.startsWith('image/')
  )

/** A user/assistant message with the given content, or a system instruction. */
function toModelMessage(
  role: LegacyMessage['role'],
  content: string | Array<TextPart | FilePart>
): ModelMessage | SystemModelMessage {
  if (role === 'system') {
    const text =
      typeof content === 'string'
        ? content
        : content.map(part => (part.type === 'text' ? part.text : '')).join('\n')
    return { role: 'system', content: text }
  }
  if (role === 'assistant') return { role: 'assistant', content }
  return { role: 'user', content }
}

export async function prepareFinalMessages(
  enhancedMessages: LegacyMessage[],
  systemMessages: SystemModelMessage[],
  prefersWebSearch: boolean,
  includeSystemPrompt: boolean = true,
  options: PrepareMessagesOptions = {}
): Promise<PreparedMessagesResult> {
  const { thinkHarder = false, isAdmin = false } = options
  const attachmentAware = enhancedMessages.some(m => m.attachments?.some(isModelAttachment))

  let model = getModelConfig('chat')
  if (thinkHarder) {
    model = isAdmin ? getModelConfig('thinkHarderAdmin') : getModelConfig('thinkHarder')
  } else {
    const hasPdf =
      attachmentAware &&
      enhancedMessages.some(m => m.attachments?.some(a => a.contentType === 'application/pdf'))
    if (hasPdf) model = getModelConfig('chatAttachment')
  }

  const instructions: SystemModelMessage[] = []

  if (!prefersWebSearch && includeSystemPrompt) {
    instructions.push(...systemMessages)
  } else if (prefersWebSearch && includeSystemPrompt) {
    const [firstSystemMessage] = systemMessages
    if (firstSystemMessage) instructions.push(firstSystemMessage)
  }

  const converted: Array<ModelMessage | SystemModelMessage> = []

  for (const m of enhancedMessages) {
    const text = typeof m.content === 'string' ? m.content : ''

    if (!attachmentAware || !m.attachments || m.attachments.length === 0) {
      if (text.trim().length > 0) converted.push(toModelMessage(m.role, text))
      continue
    }

    const parts: Array<TextPart | FilePart> = []
    let hasBinary = false
    if (text) parts.push({ type: 'text', text })

    for (const att of m.attachments) {
      const contentType = att.contentType
      if (!contentType) continue
      if (contentType.startsWith('image/') || contentType.startsWith('application/pdf')) {
        // The SDK resolves URL strings itself (downloading only when the model needs bytes).
        parts.push({ type: 'file', data: att.url, mediaType: contentType })
        hasBinary = true
      }
    }

    if (hasBinary) {
      converted.push(toModelMessage(m.role, parts))
    } else if (text.trim().length > 0) {
      converted.push(toModelMessage(m.role, text))
    }
  }

  const messages: ModelMessage[] = []
  for (const message of converted) {
    // History can carry system messages; they go to `instructions` after ours.
    if (message.role === 'system') instructions.push(message)
    else messages.push(message)
  }

  return { instructions, messages, model, attachmentAware }
}
