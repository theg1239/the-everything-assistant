import { after } from 'next/server'

export type BackgroundTasks = {
  /** Keeps `promise` alive past the response (Vercel / OpenNext `waitUntil`) and logs failures. */
  track: (label: string, promise: Promise<unknown>) => void
}

/**
 * Collects post-response work for one request. Must be created inside the route
 * handler (it registers a single `after()` callback, which needs the request scope);
 * work added later — e.g. from stream callbacks — is awaited by that same callback.
 * `after()` maps to `waitUntil` on Vercel and on Cloudflare via @opennextjs/cloudflare.
 */
export function createBackgroundTasks(): BackgroundTasks {
  const pending = new Set<Promise<void>>()

  try {
    after(async () => {
      // Tasks may enqueue further tasks; drain until nothing is left.
      while (pending.size > 0) {
        await Promise.allSettled([...pending])
      }
    })
  } catch {
    // Outside a request scope (scripts/tests): tasks still run, just without waitUntil.
  }

  return {
    track(label, promise) {
      const tracked: Promise<void> = promise
        .then(
          () => undefined,
          (error: unknown) => {
            console.error(`[chat] background task "${label}" failed:`, error)
          }
        )
        .finally(() => {
          pending.delete(tracked)
        })
      pending.add(tracked)
    },
  }
}
