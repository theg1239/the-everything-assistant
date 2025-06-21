import type { NextConfig } from 'next'
import withRspack from 'next-rspack';

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingExcludes: {
    '*': ['./ai-chatbot-main/**/*'],
  },
}

export default withRspack(nextConfig);