import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
  
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },

  errorFormat: 'pretty',

  transactionOptions: {
    maxWait: 5000,
    timeout: 10000,
    isolationLevel: 'ReadCommitted',
  },
})

prisma.$on('query', (e) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Query: ' + e.query)
    console.log('Duration: ' + e.duration + 'ms')
  }
})

prisma.$on('info', (e) => {
  console.log('Info:', e.message)
})

prisma.$on('warn', (e) => {
  console.warn('Warning:', e.message)
})

prisma.$on('error', (e) => {
  console.error('Database Error:', e.message)
})

// Global connection setup
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

export function withQueryTimer<T>(
  operation: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const start = Date.now()
  
  return queryFn().finally(() => {
    const duration = Date.now() - start
    if (duration > 1000) { // Log slow queries (>1s)
      console.warn(`Slow query detected: ${operation} took ${duration}ms`)
    }
  })
}
