import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { papers } from './schema'

const connectionString = process.env.PAPERS_DATABASE_URL!

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const sql = neon(connectionString)

export const db = drizzle({ client: sql, schema: { papers } })

export { papers } from './schema'
export type { Paper, NewPaper } from './schema'
