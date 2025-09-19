import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  turbopack: {},
  eslint: { 
    ignoreDuringBuilds: false,
    dirs: ['app', 'components', 'lib', 'hooks', 'contexts', 'providers', 'types'] // Only lint specific directories
  },
  typescript: { ignoreBuildErrors: false },
  images: { unoptimized: true },
  serverExternalPackages: ['playwright-core', '@sparticuz/chromium'],
  outputFileTracingExcludes: { '*': ['./ai-chatbot-main/**/*', './services/**/*'] },
  // compiler: {
  //   removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  // },
}

export default nextConfig
