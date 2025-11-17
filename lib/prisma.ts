import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    errorFormat: 'pretty',
    transactionOptions: {
      maxWait: 5000,
      timeout: 10000,
      isolationLevel: 'ReadCommitted',
    },
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

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
