import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: true
    // turbopackFileSystemCacheForBuild: true,
  },
  turbopack: {},
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  reactCompiler: true,
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingExcludes: { '*': ['./ai-chatbot-main/**/*', './services/**/*'] },
  // compiler: {
  //   removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  // },
}

export default nextConfig
