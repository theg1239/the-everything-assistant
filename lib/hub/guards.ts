/**
 * Narrowing helpers for hub snapshot payloads (`structured_data` is DB JSON or
 * scraped VTOP output, so every field is untrusted).
 */

import { isRecord } from '../json'

export type UnknownRecord = Record<string, unknown>

export { isRecord }

export function asRecord(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined
}

export function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

/** Mirrors an `a || b || c` chain: the first truthy value, if any. */
export function firstTruthy(...values: unknown[]): unknown {
  return values.find(Boolean)
}

/** Non-empty string, else `undefined`. */
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/** Display text: non-empty strings as-is, finite numbers stringified. */
export function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && !Number.isNaN(value) ? value : undefined
}

/** `raw.output`, else `raw.data`, when they are strings (VTOP CLI text payloads). */
export function getRawText(raw: unknown): string {
  if (!isRecord(raw)) return ''
  if (typeof raw.output === 'string') return raw.output
  if (typeof raw.data === 'string') return raw.data
  return ''
}
