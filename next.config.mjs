/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
    experimental: {
    serverComponentsExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  },
}

export default nextConfig
