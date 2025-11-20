import * as z from 'zod'

import type { AppUIMessage } from '@/lib/ai-message-conversion'
import type { JsonValue } from '@/types/tools'

export type ToolCallPayload = {
  toolName: string
  args?: Record<string, JsonValue>
  toolCallId?: string
}

export type ChatRequestPayload = {
  id?: string
  directToolCall?: ToolCallPayload
  preferredTool?: string
  messages?: AppUIMessage[]
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

  if (value && typeof value === 'object') {
    delete (value as Record<string, unknown>).__schema_placeholder
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

  const directToolCall = normalizeToolCall((value as { directToolCall?: unknown }).directToolCall)
  if (directToolCall) {
    payload.directToolCall = directToolCall
  }

  const rawMessages = (value as { messages?: unknown }).messages
  if (Array.isArray(rawMessages)) {
    payload.messages = rawMessages as AppUIMessage[]
  }

  return payload
}

