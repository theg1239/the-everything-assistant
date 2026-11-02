import type { NextConfig } from 'next'

/**
 * Public images aren't content-hashed, so they get a week of fresh caching plus a
 * long stale-while-revalidate window instead of `immutable`. Mirrors public/_headers
 * (which Cloudflare's asset server applies; Vercel uses this).
 */
const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=604800, stale-while-revalidate=2592000'

const nextConfig: NextConfig = {
  turbopack: {},
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  reactCompiler: true,
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingExcludes: { '*': ['./ai-chatbot-main/**/*', './services/**/*'] },
  async headers() {
    return ['/onboarding-artwork/:path*', '/icons/:path*', '/assets/:path*', '/og-image.jpg'].map(
      source => ({
        source,
        headers: [{ key: 'Cache-Control', value: STATIC_ASSET_CACHE_CONTROL }],
      })
    )
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
