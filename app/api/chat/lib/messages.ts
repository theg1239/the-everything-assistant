import { generateId } from 'ai'

import { sanitizeToolInvocations } from '@/lib/sanitize-tools'
import { createUIMessageStream } from 'ai'
import { getToolInputPayload, getToolOutputPayload } from './tool-helpers'
import type { AppUIMessage, LegacyMessage } from '@/lib/ai-message-conversion'
import type { JsonValue } from '@/types/tools'

type DirectToolCallResult = {
  toolCallId: string
  toolName: string
  args?: Record<string, JsonValue>
  result: any
  state: string
}

export function createDirectToolCallStream(
  uiMessages: AppUIMessage[],
  chat: { id: string; path: string },
  directToolCallResult: DirectToolCallResult,
  responseText: string
) {
  const safeInvocations = sanitizeToolInvocations([
    {
      toolCallId: directToolCallResult.toolCallId,
      toolName: directToolCallResult.toolName,
      args: directToolCallResult.args,
      result: getToolOutputPayload(directToolCallResult),
      state: directToolCallResult.state,
    },
  ])

  const stream = createUIMessageStream<AppUIMessage>({
    originalMessages: uiMessages,
    generateId,
    execute: ({ writer }) => {
      const messageId = generateId()
      const textPartId = generateId()

      writer.write({ type: 'start', messageId })
      writer.write({
        type: 'tool-input-available',
        toolCallId: directToolCallResult.toolCallId,
        toolName: directToolCallResult.toolName,
        input: directToolCallResult.args,
      })
      writer.write({
        type: 'tool-output-available',
        toolCallId: directToolCallResult.toolCallId,
        output: directToolCallResult.result,
      })
      writer.write({ type: 'text-start', id: textPartId })
      writer.write({ type: 'text-delta', id: textPartId, delta: responseText })
      writer.write({ type: 'text-end', id: textPartId })
      writer.write({
        type: 'finish',
        finishReason: 'stop',
        messageMetadata: {
          chatId: chat.id,
          chatPath: chat.path,
        },
      })
    },
  })

  return { stream, safeInvocations }
}

export function appendToolContextToMessages(
  enhancedMessages: LegacyMessage[],
  directToolCallResult: DirectToolCallResult | null
) {
  if (!directToolCallResult) return

  const lastUserMessage = enhancedMessages[enhancedMessages.length - 1]
  if (!lastUserMessage || lastUserMessage.role !== 'user') return

  if (directToolCallResult.toolName !== 'queryVTOP') return

  const directResultPayload = getToolOutputPayload(directToolCallResult)
  if (!directResultPayload?.success) return

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

  if (!dataContext) return

  enhancedMessages[enhancedMessages.length - 1] = {
    ...lastUserMessage,
    content:
      (lastUserMessage.content || '') +
      `\n\n[VTOP ${command.toUpperCase()} DATA CONTEXT]:\n${dataContext}\n\n[IMPORTANT]: VTOP ${command} data was successfully retrieved above. Use this data to answer the user's question about ${command}.`,
  }
}

