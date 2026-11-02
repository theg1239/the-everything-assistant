const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

/**
 * PostHog is loaded off the critical path: the SDK chunk is fetched and
 * initialised once the browser is idle after hydration, instead of being
 * bundled into (and executed before) the app's first render. The initial
 * pageview is still captured at init time, and SPA navigations afterwards via
 * the `defaults` history-change tracking.
 */
function initPostHog(key: string) {
  void import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: posthogHost,
        defaults: '2025-05-24',
      })
    })
    .catch((error: unknown) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('PostHog failed to load', error)
      }
    })
}

if (posthogKey) {
  const start = () => initPostHog(posthogKey)
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 4000 })
  } else {
    window.setTimeout(start, 1500)
  }
} else if (process.env.NODE_ENV !== 'production') {
  console.warn('NEXT_PUBLIC_POSTHOG_KEY is not set; PostHog not initialized.')
}
