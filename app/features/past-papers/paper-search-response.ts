/**
 * Client-side readers for `/api/public/papers/search` responses. Plain
 * narrowing (no zod) keeps the client bundles small.
 */

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface PaperSearchSummary {
  success: boolean
  totalFound?: number
  /** Each paper as an untyped record; pick the fields you need with `pickPaperFields`. */
  papers?: JsonRecord[]
}

export function readPaperSearchResponse(value: unknown): PaperSearchSummary {
  if (!isRecord(value)) return { success: false }
  const { success, totalFound, papers } = value
  return {
    success: success === true,
    totalFound: typeof totalFound === 'number' ? totalFound : undefined,
    papers: Array.isArray(papers) ? papers.filter(isRecord) : undefined,
  }
}

/** Copies the listed fields that hold strings (numbers are stringified, e.g. `year: 2023`). */
export function pickPaperFields<K extends string>(
  paper: JsonRecord,
  keys: readonly K[]
): Partial<Record<K, string>> {
  const picked: Partial<Record<K, string>> = {}
  for (const key of keys) {
    const value = paper[key]
    if (typeof value === 'string') picked[key] = value
    else if (typeof value === 'number') picked[key] = String(value)
  }
  return picked
}
