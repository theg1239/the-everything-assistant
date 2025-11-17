import type { NextConfig } from 'next'
import { withWorkflow } from 'workflow/next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  turbopack: {},
  env: {
    // Heavy headless-browser scrapers dramatically increase bundle size and are not
    // suitable for Cloudflare Workers. Disable them by default and opt-in when
    // deploying to a Node environment that can run Puppeteer/Chromium.
    ENABLE_PAPER_SCRAPING: process.env.ENABLE_PAPER_SCRAPING ?? 'false',
  },
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  reactCompiler: true,
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingExcludes: { '*': ['./ai-chatbot-main/**/*', './services/**/*'] },
}

export default withWorkflow(nextConfig)
