/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
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

export default nextConfig
