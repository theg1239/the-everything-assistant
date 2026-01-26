import {
  generateId,
  getToolName,
  isToolUIPart,
  type UIDataTypes,
  type UIMessage,
  type UITool,
  type UITools,
  type UIMessagePart,
} from 'ai'

export interface LegacyToolInvocation {
  toolCallId: string
  toolName: string
  args?: Record<string, any>
  result?: any
  state?: 'partial-call' | 'call' | 'result' | 'error'
  error?: string
}

export interface LegacyAttachment {
  url: string
  name?: string | null
  contentType?: string
}

export interface LegacyMessageMetadata {
  [key: string]: any
}

export interface LegacyMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  metadata?: LegacyMessageMetadata
  createdAt?: string | Date | null
  toolInvocations?: LegacyToolInvocation[]
  attachments?: LegacyAttachment[]
  error?: string
  parts?: UIMessagePart<UIDataTypes, AppUITools>[]
}

export type AppUITools = UITools | Record<string, UITool>
export type AppUIMessage = UIMessage<LegacyMessageMetadata, UIDataTypes, AppUITools>

const LEGACY_TO_UI_STATE: Record<string, AppToolState> = {
  'partial-call': 'input-streaming',
  call: 'input-available',
  result: 'output-available',
}

const UI_TO_LEGACY_STATE: Record<AppToolState, LegacyToolInvocation['state']> = {
  'input-streaming': 'partial-call',
  'input-available': 'call',
  'output-available': 'result',
  'output-error': 'error',
}

const DYNAMIC_TO_LEGACY_STATE: Record<string, LegacyToolInvocation['state']> = {
  'input-streaming': 'partial-call',
  'input-available': 'call',
  'approval-requested': 'call',
  'approval-responded': 'call',
  'output-available': 'result',
  'output-error': 'error',
  'output-denied': 'error',
}

type AppToolState = 'input-streaming' | 'input-available' | 'output-available' | 'output-error'

export function legacyMessagesToUiMessages(messages: LegacyMessage[]): AppUIMessage[] {
  return messages.map(legacyMessageToUiMessage)
}

export function legacyMessageToUiMessage(message: LegacyMessage): AppUIMessage {
  const parts: UIMessagePart<UIDataTypes, AppUITools>[] = []

  if (message.content && message.content.trim().length > 0) {
    parts.push({
      type: 'text',
      text: message.content,
    })
  }

  if (Array.isArray(message.toolInvocations)) {
    for (const toolInvocation of message.toolInvocations) {
      const toolCallId = toolInvocation.toolCallId || generateId()
      const state = LEGACY_TO_UI_STATE[toolInvocation.state || 'result'] || 'output-available'
      const partType = `tool-${toolInvocation.toolName}` as const
      parts.push({
        type: partType,
        toolCallId,
        toolName: toolInvocation.toolName,
        input: toolInvocation.args,
        output: toolInvocation.result,
        state,
        errorText: toolInvocation.error,
      } as UIMessagePart<UIDataTypes, AppUITools>)
    }
  }

  if (Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      const filename = attachment.name ?? undefined
      parts.push({
        type: 'file',
        url: attachment.url,
        mediaType: attachment.contentType || 'application/octet-stream',
        ...(filename ? { filename } : {}),
      })
    }
  }

  return {
    id: message.id || generateId(),
    role: message.role,
    metadata: message.metadata,
    parts,
  }
}

export function uiMessagesToLegacyMessages(messages: AppUIMessage[]): LegacyMessage[] {
  return messages.map(uiMessageToLegacyMessage)
}

export function uiMessageToLegacyMessage(message: AppUIMessage): LegacyMessage {
  const legacy: LegacyMessage = {
    id: message.id || generateId(),
    role: message.role,
    content: extractTextFromParts(message.parts),
    metadata: message.metadata,
    parts: message.parts as UIMessagePart<UIDataTypes, AppUITools>[],
  }

  const toolInvocations: LegacyToolInvocation[] = []
  const attachments: LegacyAttachment[] = []

  if (Array.isArray(message.parts)) {
    for (const part of message.parts) {
      if (isToolUIPart(part)) {
        const state =
          part.type === 'dynamic-tool'
            ? DYNAMIC_TO_LEGACY_STATE[part.state] ??
              (part.errorText
                ? 'error'
                : part.output !== undefined
                  ? 'result'
                  : part.input !== undefined
                    ? 'call'
                    : undefined)
            : UI_TO_LEGACY_STATE[(part.state as AppToolState) || 'output-available']
        toolInvocations.push({
          toolCallId: part.toolCallId || generateId(),
          toolName: getToolName(part) as string,
          args: part.input as Record<string, any>,
          result: part.output,
          state,
          error: part.errorText,
        })
      } else if (part.type === 'file') {
        const filePart = part as any
        const url =
          typeof filePart.url === 'string'
            ? filePart.url
            : typeof filePart.file?.url === 'string'
              ? filePart.file.url
              : undefined
        const mediaType =
          typeof filePart.mediaType === 'string'
            ? filePart.mediaType
            : typeof filePart.file?.mediaType === 'string'
              ? filePart.file.mediaType
              : undefined
        const filename =
          filePart.filename ??
          filePart.name ??
          filePart.providerMetadata?.attachmentName ??
          filePart.providerOptions?.attachmentName ??
          filePart.file?.filename ??
          filePart.file?.name ??
          filePart.file?.providerMetadata?.attachmentName ??
          filePart.file?.providerOptions?.attachmentName
        if (!url || !mediaType) continue
        attachments.push({
          url,
          contentType: mediaType,
          name: typeof filename === 'string' && filename.length > 0 ? filename : undefined,
        })
      }
    }
  }

  if (toolInvocations.length > 0) {
    legacy.toolInvocations = toolInvocations
  }

  if (attachments.length > 0) {
    legacy.attachments = attachments
  }

  return legacy
}

export function extractTextFromParts(
  parts: UIMessagePart<UIDataTypes, AppUITools>[] | undefined
): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .filter(part => part.type === 'text')
    .map(part => (part as { text: string }).text)
    .join('')
}
