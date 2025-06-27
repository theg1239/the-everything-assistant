import type { NextConfig } from 'next'

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
})

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingExcludes: { '*': ['./ai-chatbot-main/**/*'] },
  // compiler: {
  //   removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  // },
}

export default withPWA(nextConfig)
