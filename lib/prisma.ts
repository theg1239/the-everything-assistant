import { PrismaClient } from "@/prisma/generated/client"
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = global as unknown as {
  prisma: PrismaClient
  prismaBeforeExitHookRegistered?: boolean
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
} 

if (!globalForPrisma.prismaBeforeExitHookRegistered) {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
  globalForPrisma.prismaBeforeExitHookRegistered = true
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
