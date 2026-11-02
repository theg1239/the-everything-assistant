import { createUIMessageStream, generateId } from 'ai'

import { sanitizeToolInvocations } from '@/lib/sanitize-tools'
import type { AppUIMessage } from '@/lib/ai-message-conversion'

import type { DirectToolCallResult } from './direct-tool-call'
import { getToolOutput } from './tool-helpers'

export function createDirectToolCallStream(
  uiMessages: AppUIMessage[],
  chat: { id: string; path: string },
  directToolCallResult: DirectToolCallResult,
  responseText: string,
  /** Id of the streamed assistant message; persist the message under the same id. */
  messageId: string = generateId()
) {
  const safeInvocations = sanitizeToolInvocations([
    {
      toolCallId: directToolCallResult.toolCallId,
      toolName: directToolCallResult.toolName,
      args: directToolCallResult.args,
      result: getToolOutput(directToolCallResult),
      state: directToolCallResult.state,
    },
  ])

  const stream = createUIMessageStream<AppUIMessage>({
    originalMessages: uiMessages,
    generateId,
    execute: ({ writer }) => {
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
