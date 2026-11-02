import { isRecord } from './json'

/** Token usage from any SDK/provider shape; only numeric fields are read. */
type UsageCandidate = unknown

/** Reads a nested property path from an untrusted value. */
const at = (value: unknown, ...path: string[]): unknown => {
  let current = value
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined
  return Number.isFinite(value) ? value : undefined
}

const firstNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    const num = toNumber(value)
    if (num !== undefined) return num
  }
  return undefined
}

export function normalizeTokenUsage(usage: UsageCandidate) {
  const promptTokens = firstNumber(
    at(usage, 'inputTokens'),
    at(usage, 'inputTokens', 'total'),
    at(usage, 'prompt_tokens'),
    at(usage, 'input_tokens'),
    at(usage, 'input_tokens', 'total'),
    at(usage, 'raw', 'inputTokens'),
    at(usage, 'raw', 'inputTokens', 'total'),
    at(usage, 'raw', 'prompt_tokens'),
    at(usage, 'raw', 'input_tokens'),
    at(usage, 'raw', 'input_tokens', 'total')
  )

  const completionTokens = firstNumber(
    at(usage, 'outputTokens'),
    at(usage, 'outputTokens', 'total'),
    at(usage, 'completion_tokens'),
    at(usage, 'output_tokens'),
    at(usage, 'output_tokens', 'total'),
    at(usage, 'raw', 'outputTokens'),
    at(usage, 'raw', 'outputTokens', 'total'),
    at(usage, 'raw', 'completion_tokens'),
    at(usage, 'raw', 'output_tokens'),
    at(usage, 'raw', 'output_tokens', 'total')
  )

  let totalTokens = firstNumber(
    at(usage, 'totalTokens'),
    at(usage, 'total_tokens'),
    at(usage, 'raw', 'totalTokens'),
    at(usage, 'raw', 'total_tokens')
  )

  if (totalTokens === undefined && (promptTokens !== undefined || completionTokens !== undefined)) {
    totalTokens = (promptTokens ?? 0) + (completionTokens ?? 0)
  }

  return {
    inputTokens: promptTokens ?? 0,
    outputTokens: completionTokens ?? 0,
    totalTokens: totalTokens ?? 0,
  };
}
