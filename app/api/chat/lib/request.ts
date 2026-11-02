import * as z from 'zod'

import type { AppUIMessage } from '@/lib/ai-message-conversion'
import type { JsonValue } from '@/types/tools'
import { parseMCPConfigList, type MCPClientConfig } from '@/lib/mcp-config'

export type ToolCallPayload = {
  toolName: string
  args?: Record<string, JsonValue>
  toolCallId?: string
}

const trackSchema = z.object({ id: z.string(), title: z.string(), artist: z.string() })

const musicPlayerStateSchema = z.object({
  isPlaying: z.boolean(),
  currentTrack: trackSchema.nullable(),
  progress: z.string(),
  duration: z.string(),
  progressPercent: z.number(),
  trackPosition: z.string().nullable(),
  loopMode: z.enum(['none', 'all', 'current']),
  shuffle: z.boolean(),
  trackCount: z.number(),
  tracks: z.array(trackSchema),
})

export type MusicPlayerState = z.infer<typeof musicPlayerStateSchema>

export type ChatRequestPayload = {
  id?: string
  directToolCall?: ToolCallPayload
  preferredTool?: string
  messages?: AppUIMessage[]
  musicPlayerState?: MusicPlayerState
  mcpConfigs?: MCPClientConfig[]
  thinkHarder?: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }

  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue)
  }

  return false
}

/**
 * Structural check for a UI message: id, role and a parts array. `system` is
 * accepted structurally and stripped by `parseChatRequestPayload`. Part shapes
 * are deliberately not validated here (`safeValidateUIMessages` would reject
 * the legacy file-part shapes still present in stored chat history); every
 * consumer reads parts defensively.
 */
const isUIMessageLike = (value: unknown): value is AppUIMessage =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  (value.role === 'user' || value.role === 'assistant' || value.role === 'system') &&
  Array.isArray(value.parts) &&
  value.parts.every(isRecord)

const normalizeToolCall = (value: unknown): ToolCallPayload | undefined => {
  if (!isRecord(value) || typeof value.toolName !== 'string') {
    return undefined
  }

  const normalizedArgs: Record<string, JsonValue> | undefined = isRecord(value.args)
    ? Object.entries(value.args).reduce<Record<string, JsonValue>>((acc, [key, arg]) => {
        if (isJsonValue(arg)) {
          acc[key] = arg
        }
        return acc
      }, {})
    : undefined

  return {
    toolName: value.toolName,
    toolCallId: typeof value.toolCallId === 'string' ? value.toolCallId : undefined,
    args: normalizedArgs,
  }
}

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z
      .object({
        __schema_placeholder: z.boolean().optional(),
      })
      .catchall(jsonValueSchema),
  ])
)

export const structuredDataSchema: z.ZodType<Record<string, JsonValue>> = z
  .object({
    __schema_placeholder: jsonValueSchema.optional(),
  })
  .catchall(jsonValueSchema)

export const stripSchemaPlaceholders = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach(stripSchemaPlaceholders)
    return
  }

  if (isRecord(value)) {
    delete value.__schema_placeholder
    Object.values(value).forEach(stripSchemaPlaceholders)
  }
}

export const parseChatRequestPayload = (value: unknown): ChatRequestPayload | null => {
  if (!isRecord(value)) {
    return null
  }

  const payload: ChatRequestPayload = {}

  if (typeof value.id === 'string') {
    payload.id = value.id
  }

  if (typeof value.preferredTool === 'string') {
    payload.preferredTool = value.preferredTool
  }

  const directToolCall = normalizeToolCall(value.directToolCall)
  if (directToolCall) {
    payload.directToolCall = directToolCall
  }

  if (Array.isArray(value.messages)) {
    if (!value.messages.every(isUIMessageLike)) return null
    // The server builds every instruction itself. Client-supplied `system` messages
    // would otherwise be promoted to model instructions (prompt injection), so they
    // are dropped here rather than rejected: stored histories may still contain them.
    payload.messages = value.messages.filter(message => message.role !== 'system')
  }

  const musicPlayerState = musicPlayerStateSchema.safeParse(value.musicPlayerState)
  if (musicPlayerState.success) {
    payload.musicPlayerState = musicPlayerState.data
  }

  if (Array.isArray(value.mcpConfigs)) {
    payload.mcpConfigs = parseMCPConfigList(value.mcpConfigs)
  }

  if (typeof value.thinkHarder === 'boolean') {
    payload.thinkHarder = value.thinkHarder
  }

  return payload
}
