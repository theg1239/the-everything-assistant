import type { NextConfig } from 'next'

// This app lives inside a pnpm monorepo but has its own npm lockfile; pin the
// project root so Turbopack/output tracing don't infer the monorepo root.
const projectRoot = __dirname

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  // Secrets are read from process.env at runtime by server code only; don't add
  // them to `env:` here, which inlines values into build output.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
}

export default nextConfig
