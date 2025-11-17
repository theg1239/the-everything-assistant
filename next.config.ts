import type { NextConfig } from 'next'
import { withWorkflow } from 'workflow/next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  turbopack: {},
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  reactCompiler: true,
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingExcludes: { '*': ['./ai-chatbot-main/**/*', './services/**/*'] },
}

export default withWorkflow(nextConfig)
