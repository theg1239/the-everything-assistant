import { PrismaClient } from "@/prisma/generated/client"
import { PrismaPg } from '@prisma/adapter-pg'

declare global {
  // Reused across dev HMR reloads so we don't open a new pool per reload.
  var __prismaClient: PrismaClient | undefined
  var __prismaBeforeExitHookRegistered: boolean | undefined
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

export const prisma =
  globalThis.__prismaClient ??
  new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prismaClient = prisma
} 

if (!globalThis.__prismaBeforeExitHookRegistered) {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
  globalThis.__prismaBeforeExitHookRegistered = true
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error('Database connection failed:', error)
    return false
  }
}

export function withQueryTimer<T>(operation: string, queryFn: () => Promise<T>): Promise<T> {
  const start = Date.now()

  return queryFn().finally(() => {
    const duration = Date.now() - start
    if (duration > 1000) {
      console.warn(`Slow query detected: ${operation} took ${duration}ms`)
    }
  })
}
