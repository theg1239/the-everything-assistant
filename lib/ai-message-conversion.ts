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
import { isRecord } from './json'

export interface LegacyToolInvocation {
  toolCallId: string
  toolName: string
  args?: Record<string, unknown>
  result?: unknown
  state?: 'partial-call' | 'call' | 'result' | 'error'
  error?: string
}

export interface LegacyAttachment {
  url: string
  name?: string | null
  contentType?: string
}

export interface LegacyMessageMetadata {
  [key: string]: unknown
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

const UI_TO_LEGACY_STATE: Partial<Record<string, LegacyToolInvocation['state']>> = {
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

const stringField = (record: Record<string, unknown> | undefined, key: string) => {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

const attachmentNameOf = (value: unknown): unknown =>
  isRecord(value) ? value.attachmentName : undefined

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
      // The tool name is only known at runtime, so TS can't match the `tool-${NAME}` part union.
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

/** Like `uiMessagesToLegacyMessages`, but unchanged UI messages map to the same legacy objects. */
export function cachedUiMessagesToLegacyMessages(messages: AppUIMessage[]): LegacyMessage[] {
  return messages.map(cachedUiMessageToLegacyMessage)
}

/**
 * Conversions keyed by UI message identity. `useChat` keeps the object identity of unchanged
 * messages (only the streaming message is replaced by a fresh snapshot each update), so repeated
 * conversions return the same legacy object and memoized consumers skip unchanged messages.
 * Callers must treat both the UI messages and the returned legacy messages as immutable.
 */
const legacyMessageCache = new WeakMap<AppUIMessage, LegacyMessage>()

/** Memoized `uiMessageToLegacyMessage`: the same UI message object yields the same legacy object. */
export function cachedUiMessageToLegacyMessage(message: AppUIMessage): LegacyMessage {
  const cached = legacyMessageCache.get(message)
  if (cached) return cached
  const legacy = uiMessageToLegacyMessage(message)
  legacyMessageCache.set(message, legacy)
  return legacy
}

export function uiMessageToLegacyMessage(message: AppUIMessage): LegacyMessage {
  const legacy: LegacyMessage = {
    id: message.id || generateId(),
    role: message.role,
    content: extractTextFromParts(message.parts),
    metadata: message.metadata,
    parts: message.parts,
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
            : UI_TO_LEGACY_STATE[part.state || 'output-available']
        toolInvocations.push({
          toolCallId: part.toolCallId || generateId(),
          toolName: getToolName(part),
          args: isRecord(part.input) ? part.input : undefined,
          result: part.output,
          state,
          error: part.errorText,
        })
      } else if (part.type === 'file') {
        // Older persisted parts nest the file under `file` and keep the name in other fields.
        const filePart: Record<string, unknown> = part
        const nested = isRecord(filePart.file) ? filePart.file : undefined
        const url = stringField(filePart, 'url') ?? stringField(nested, 'url')
        const mediaType = stringField(filePart, 'mediaType') ?? stringField(nested, 'mediaType')
        const filename =
          filePart.filename ??
          filePart.name ??
          attachmentNameOf(filePart.providerMetadata) ??
          attachmentNameOf(filePart.providerOptions) ??
          nested?.filename ??
          nested?.name ??
          attachmentNameOf(nested?.providerMetadata) ??
          attachmentNameOf(nested?.providerOptions)
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
    .flatMap(part => (part.type === 'text' ? [part.text] : []))
    .join('')
}
