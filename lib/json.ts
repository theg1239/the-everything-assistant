import type { JsonValue } from '@/types/tools'

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
