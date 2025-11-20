import posthog from 'posthog-js'

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

if (posthogKey) {
    posthog.init(posthogKey, {
        api_host: posthogHost,
        defaults: '2025-05-24',
    })
} else {
    if (process.env.NODE_ENV !== 'production') {
        console.warn('NEXT_PUBLIC_POSTHOG_KEY is not set; PostHog not initialized.')
    }
}
            