const nextConfig = {
  experimental: {
    turbo: {},
  },
  images: {
    domains: ['res.cloudinary.com'],
  },
  env: {
    DATABASE_URL: process.env.PAPERS_DATABASE_URL,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
}

module.exports = nextConfig
