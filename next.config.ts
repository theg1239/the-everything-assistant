import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {},
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingExcludes: { '*': ['./ai-chatbot-main/**/*', './services/**/*'] },
  // compiler: {
  //   removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  // },
}

export default nextConfig
