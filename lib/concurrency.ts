/**
 * `Promise.all(items.map(fn))` with at most `limit` calls in flight. Results keep the input
 * order. Like `Promise.all`, the first rejection rejects the whole call; after it no new items
 * are started (calls already in flight still run to completion). Use for loops over
 * independent I/O (DB rows, proxy calls) whose size isn't fixed, so a large or client-supplied
 * array can't exhaust the small serverless DB pool or fan out unbounded network calls.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const workerCount = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  // One iterator shared by all workers: each `next()` hands out a distinct item.
  const queue = items.entries()
  let failed = false

  const worker = async () => {
    for (const [index, item] of queue) {
      if (failed) return
      try {
        results[index] = await fn(item, index)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}
