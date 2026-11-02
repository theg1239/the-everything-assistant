/**
 * Narrowing helpers for tool-result payloads rendered by artifact components.
 * Tool outputs arrive as untyped JSON, so every field read goes through one of these.
 */

export type UnknownRecord = Record<string, unknown>

/** A value React renders as text. */
export type TextValue = string | number

export const isRecord = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export const isUnknownArray = (value: unknown): value is unknown[] => Array.isArray(value)

export const asRecord = (value: unknown): UnknownRecord => (isRecord(value) ? value : {})

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

export const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

export const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined

/** Strings and numbers pass through unchanged (so `0`/`''` keep their JSX semantics). */
export const asText = (value: unknown): TextValue | undefined =>
  typeof value === 'string' || typeof value === 'number' ? value : undefined

/** String form of a string/number value, `''` for anything else. */
export const textOf = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''

/** Mirrors `new Date(value)` for arbitrary input (non-date primitives/objects are stringified). */
export const toDate = (value: unknown): Date =>
  new Date(typeof value === 'number' || value instanceof Date ? value : String(value))
