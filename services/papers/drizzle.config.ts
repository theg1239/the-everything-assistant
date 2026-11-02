import { defineConfig } from 'drizzle-kit'

const databaseUrl = process.env.PAPERS_DATABASE_URL

if (!databaseUrl) {
  throw new Error('PAPERS_DATABASE_URL environment variable is required')
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
})
