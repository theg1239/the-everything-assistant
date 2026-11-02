/**
 * Maps `items` through `fn` with at most `limit` calls in flight, resolving to the results in
 * input order. Like `Promise.all`, it rejects on the first rejection (calls already in flight
 * still run, but no new ones start); catch inside `fn` to tolerate individual failures.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  // One iterator shared by every worker, so each item is taken exactly once.
  const queue = items.entries()
  let failed = false

  const worker = async (): Promise<void> => {
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

  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}
