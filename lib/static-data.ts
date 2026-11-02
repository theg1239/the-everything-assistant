/**
 * Per-instance loaders for the static datasets shipped in `public/` (faculty, syllabi,
 * FFCS, placements). They are fetched from the deployment's own URL — which works on
 * Node, Vercel and Workers alike — parsed/validated once, and shared by every request
 * the instance serves. Failures are not cached: the next call retries.
 */

/** Absolute URL of a `public/` asset on this deployment (relative in the browser). */
export function publicAssetUrl(path: string): string {
  const base =
    typeof window === 'undefined' ? process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000' : ''
  return `${base}${path}`
}

/** Runs `load` once and shares its promise; a rejection clears the memo so it is retried. */
export function memoizeAsync<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null
  return () => {
    if (!pending) {
      const attempt = load()
      pending = attempt
      attempt.catch(() => {
        if (pending === attempt) pending = null
      })
    }
    return pending
  }
}

/** `memoizeAsync` per key (e.g. one FFCS dataset per school). */
export function memoizeAsyncByKey<K, T>(load: (key: K) => Promise<T>): (key: K) => Promise<T> {
  const memos = new Map<K, () => Promise<T>>()
  return key => {
    let memo = memos.get(key)
    if (!memo) {
      memo = memoizeAsync(() => load(key))
      memos.set(key, memo)
    }
    return memo()
  }
}
