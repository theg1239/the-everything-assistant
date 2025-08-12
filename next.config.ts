import type { NextConfig } from 'next'
import { withBotId } from 'botid/next/config'

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NO_PWA === '1',
  runtimeCaching: [],
  buildExcludes: [/middleware-manifest\.json$/],
  sw: 'sw.js',
})

const nextConfig: NextConfig = {
  turbopack: {},
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingExcludes: { '*': ['./ai-chatbot-main/**/*'] },
  // compiler: {
  //   removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  // },
}

export default withBotId(withPWA(nextConfig))
