// Small helpers for narrowing untyped tool results (`unknown`) at render time.

export type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null
}

/** Returns the value when it is a string, otherwise `undefined`. */
export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** Returns the value when it is directly renderable text (string or number). */
export function readText(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

/** Returns the value when it is an array, otherwise an empty array. */
export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * Returns the items of an array as records. Non-object items become empty records so the
 * item count (and therefore what gets rendered) is preserved.
 */
export function readRecords(value: unknown): UnknownRecord[] {
  return readArray(value).map(item => asRecord(item) ?? {})
}

/** Extracts a human-readable message from a thrown value. */
export function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message || undefined
  return readString(asRecord(error)?.message) || undefined
}
