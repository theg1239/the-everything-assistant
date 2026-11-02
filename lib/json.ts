import type { JsonValue } from '@/types/tools'

export type JsonObject = { [key: string]: JsonValue }

/** Plain object (not null, not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Narrows a JSON union (`JsonValue`, Prisma `JsonValue`, ...) to its object member,
 * keeping the precise object type instead of widening to `Record<string, unknown>`.
 */
export function isJsonObject<T>(
  value: T
): value is Exclude<Extract<T, object>, readonly unknown[]> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map(item => toJsonValue(item))
      .filter((item): item is JsonValue => item !== undefined)
    return normalized
  }
  if (typeof value === 'object' && value) {
    const record: Record<string, JsonValue> = {}
    for (const [key, val] of Object.entries(value)) {
      const normalized = toJsonValue(val)
      if (normalized !== undefined) {
        record[key] = normalized
      }
    }
    return record
  }
  return undefined
}
