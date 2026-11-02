import type { NextConfig } from 'next'

/**
 * Public images aren't content-hashed, so they get a week of fresh caching plus a
 * long stale-while-revalidate window instead of `immutable`. Mirrors public/_headers
 * (which Cloudflare's asset server applies; Vercel uses this).
 */
const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=604800, stale-while-revalidate=2592000'

const originOf = (value: string | undefined) => {
  try {
    return value ? new URL(value).origin : null
  } catch {
    return null
  }
}

/**
 * Report-only CSP: observes violations without enforcing, so it can be tightened
 * once scripts carry nonces. `'unsafe-inline'` for scripts is required today by
 * Next's inline bootstrap/RSC payload scripts, the JSON-LD blocks and the theme
 * script; moving to `'nonce-…' 'strict-dynamic'` needs a per-request nonce from
 * middleware (which also makes every page dynamic).
 */
const reportOnlyCsp = () => {
  const posthog = ['https://*.posthog.com', originOf(process.env.NEXT_PUBLIC_POSTHOG_HOST)]
  const list = (...sources: Array<string | null>) => sources.filter(Boolean).join(' ')
  return [
    "default-src 'self'",
    `script-src ${list("'self'", "'unsafe-inline'", 'https://www.youtube.com', 'https://s.ytimg.com', ...posthog)}`,
    "style-src 'self' 'unsafe-inline'",
    // Tool results and model-formatted HTML embed images from arbitrary https hosts.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${list("'self'", ...posthog)}`,
    "media-src 'self' blob: https:",
    // PDF previews come from arbitrary paper sources (Drive, Cloud Storage, R2, ...)
    // plus YouTube embeds, so frames stay https-wide for now.
    "frame-src 'self' https:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** Applied to every route (pages, API routes, metadata files). */
const SECURITY_HEADERS = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  },
  { key: 'Content-Security-Policy-Report-Only', value: reportOnlyCsp() },
]

const nextConfig: NextConfig = {
  turbopack: {},
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  reactCompiler: true,
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingExcludes: { '*': ['./ai-chatbot-main/**/*', './services/**/*'] },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      ...['/onboarding-artwork/:path*', '/icons/:path*', '/assets/:path*', '/og-image.jpg'].map(
        source => ({
          source,
          headers: [{ key: 'Cache-Control', value: STATIC_ASSET_CACHE_CONTROL }],
        })
      ),
    ]
  },
  async redirects() {
    // Old asset URLs: broadcast slides stored in the DB, social-card caches and
    // external links may still point at the pre-WebP/resized files.
    return [
      {
        source: '/onboarding-artwork/:name(artwork\\d*)\\.png',
        destination: '/onboarding-artwork/:name.webp',
        permanent: true,
      },
      { source: '/og-image.png', destination: '/og-image.jpg', permanent: true },
      { source: '/assets/tea-icon.png', destination: '/icons/icon-512.png', permanent: true },
    ]
  },
}

export default nextConfig
