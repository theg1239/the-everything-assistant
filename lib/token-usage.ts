type UsageCandidate = Record<string, any> | null | undefined

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
    usage?.inputTokens,
    usage?.inputTokens,
    usage?.inputTokens?.total,
    usage?.prompt_tokens,
    usage?.input_tokens,
    usage?.input_tokens?.total,
    usage?.raw?.inputTokens,
    usage?.raw?.inputTokens,
    usage?.raw?.inputTokens?.total,
    usage?.raw?.prompt_tokens,
    usage?.raw?.input_tokens,
    usage?.raw?.input_tokens?.total
  )

  const completionTokens = firstNumber(
    usage?.outputTokens,
    usage?.outputTokens,
    usage?.outputTokens?.total,
    usage?.completion_tokens,
    usage?.output_tokens,
    usage?.output_tokens?.total,
    usage?.raw?.outputTokens,
    usage?.raw?.outputTokens,
    usage?.raw?.outputTokens?.total,
    usage?.raw?.completion_tokens,
    usage?.raw?.output_tokens,
    usage?.raw?.output_tokens?.total
  )

  let totalTokens = firstNumber(
    usage?.totalTokens,
    usage?.total_tokens,
    usage?.raw?.totalTokens,
    usage?.raw?.total_tokens
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
