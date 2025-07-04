/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: {
    },
  },
  images: {
    domains: ['res.cloudinary.com'],
  },
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  },
}

module.exports = nextConfig
