import { DbOptimizations, QueryCache } from './db-optimizations'
import { getChats, getUser, getChatsWithMessageCounts } from './db'
import { checkDatabaseConnection, withQueryTimer } from './prisma'

export class PerformanceTester {
  static async runPerformanceTests(userId: string): Promise<{
    connectionHealth: boolean
    testResults: Array<{
      operation: string
      duration: number
      recordCount: number
      status: 'success' | 'error'
    }>
  }> {
    const results: Array<{
      operation: string
      duration: number
      recordCount: number
      status: 'success' | 'error'
    }> = []

    const connectionHealth = await checkDatabaseConnection()

    if (!connectionHealth) {
      return {
        connectionHealth: false,
        testResults: [
          {
            operation: 'Database Connection',
            duration: 0,
            recordCount: 0,
            status: 'error',
          },
        ],
      }
    }

    try {
      const start = Date.now()
      const chats = await getChats(userId, 20)
      const duration = Date.now() - start

      results.push({
        operation: 'Get Chats (Basic)',
        duration,
        recordCount: chats.length,
        status: 'success',
      })
    } catch (error) {
      results.push({
        operation: 'Get Chats (Basic)',
        duration: 0,
        recordCount: 0,
        status: 'error',
      })
    }

    try {
      const start = Date.now()
      const chatsWithCounts = await getChatsWithMessageCounts(userId, 20)
      const duration = Date.now() - start

      results.push({
        operation: 'Get Chats (Optimized with Counts)',
        duration,
        recordCount: chatsWithCounts.length,
        status: 'success',
      })
    } catch (error) {
      results.push({
        operation: 'Get Chats (Optimized with Counts)',
        duration: 0,
        recordCount: 0,
        status: 'error',
      })
    }

    try {
      const start = Date.now()
      const { chats } = await DbOptimizations.getChatsPaginated(userId, undefined, 15)
      const duration = Date.now() - start

      results.push({
        operation: 'Cursor Pagination',
        duration,
        recordCount: chats.length,
        status: 'success',
      })
    } catch (error) {
      results.push({
        operation: 'Cursor Pagination',
        duration: 0,
        recordCount: 0,
        status: 'error',
      })
    }

    try {
      const start = Date.now()
      const summary = await DbOptimizations.getUserActivitySummary(userId, 7)
      const duration = Date.now() - start

      results.push({
        operation: 'User Activity Summary',
        duration,
        recordCount: summary.recentActivity.length,
        status: 'success',
      })
    } catch (error) {
      results.push({
        operation: 'User Activity Summary',
        duration: 0,
        recordCount: 0,
        status: 'error',
      })
    }

    try {
      const start = Date.now()
      const health = await DbOptimizations.healthCheck()
      const duration = Date.now() - start

      results.push({
        operation: 'Database Health Check',
        duration,
        recordCount: health.connectionCount || 0,
        status: health.isConnected ? 'success' : 'error',
      })
    } catch (error) {
      results.push({
        operation: 'Database Health Check',
        duration: 0,
        recordCount: 0,
        status: 'error',
      })
    }

    try {
      const cacheKey = `test-${userId}-${Date.now()}`
      const testData = { test: 'data', timestamp: Date.now() }

      const start = Date.now()

      QueryCache.set(cacheKey, testData, 1000)

      const cached = QueryCache.get(cacheKey)

      const duration = Date.now() - start

      results.push({
        operation: 'Cache Operations',
        duration,
        recordCount: cached ? 1 : 0,
        status: cached ? 'success' : 'error',
      })
    } catch (error) {
      results.push({
        operation: 'Cache Operations',
        duration: 0,
        recordCount: 0,
        status: 'error',
      })
    }

    return {
      connectionHealth,
      testResults: results,
    }
  }

  static async generatePerformanceReport(userId: string): Promise<string> {
    const { connectionHealth, testResults } = await this.runPerformanceTests(userId)

    let report = `# Database Performance Report\n\n`
    report += `**Generated:** ${new Date().toISOString()}\n`
    report += `**User ID:** ${userId}\n`
    report += `**Connection Health:** ${connectionHealth ? '✅ Healthy' : '❌ Failed'}\n\n`

    report += `## Test Results\n\n`
    report += `| Operation | Duration (ms) | Records | Status |\n`
    report += `|-----------|---------------|---------|--------|\n`

    for (const result of testResults) {
      const statusIcon = result.status === 'success' ? '✅' : '❌'
      report += `| ${result.operation} | ${result.duration} | ${result.recordCount} | ${statusIcon} |\n`
    }

    const avgDuration =
      testResults.filter(r => r.status === 'success').reduce((acc, r) => acc + r.duration, 0) /
      testResults.filter(r => r.status === 'success').length

    const successRate =
      (testResults.filter(r => r.status === 'success').length / testResults.length) * 100

    report += `\n## Summary\n\n`
    report += `- **Success Rate:** ${successRate.toFixed(1)}%\n`
    report += `- **Average Duration:** ${avgDuration.toFixed(1)}ms\n`
    report += `- **Total Tests:** ${testResults.length}\n`

    const slowQueries = testResults.filter(r => r.duration > 1000)
    if (slowQueries.length > 0) {
      report += `\n## ⚠️ Slow Queries (>1000ms)\n\n`
      for (const query of slowQueries) {
        report += `- **${query.operation}:** ${query.duration}ms\n`
      }
    }

    report += `\n## Recommendations\n\n`
    if (avgDuration < 100) {
      report += `🚀 **Excellent performance!** Average query time under 100ms.\n`
    } else if (avgDuration < 500) {
      report += `✅ **Good performance.** Consider monitoring for optimization opportunities.\n`
    } else {
      report += `⚠️ **Performance could be improved.** Consider reviewing slow queries and indexing strategy.\n`
    }

    return report
  }

  static async benchmarkSpecificOperation<T>(
    name: string,
    operation: () => Promise<T>,
    iterations: number = 10
  ): Promise<{
    name: string
    avgDuration: number
    minDuration: number
    maxDuration: number
    iterations: number
    successRate: number
  }> {
    const durations: number[] = []
    let successCount = 0

    for (let i = 0; i < iterations; i++) {
      try {
        const start = Date.now()
        await operation()
        const duration = Date.now() - start
        durations.push(duration)
        successCount++
      } catch (error) {
        console.error(`Benchmark iteration ${i + 1} failed:`, error)
      }
    }

    return {
      name,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length || 0,
      minDuration: Math.min(...durations) || 0,
      maxDuration: Math.max(...durations) || 0,
      iterations,
      successRate: (successCount / iterations) * 100,
    }
  }
}

export async function runQuickPerformanceCheck(userId: string): Promise<void> {
  console.log('🚀 Running database performance check...\n')

  const report = await PerformanceTester.generatePerformanceReport(userId)
  console.log(report)

  const chatLoadBenchmark = await PerformanceTester.benchmarkSpecificOperation(
    'Chat Loading',
    () => getChats(userId, 10),
    5
  )

  console.log('\n## Benchmark Results\n')
  console.log(`**${chatLoadBenchmark.name}:**`)
  console.log(`- Average: ${chatLoadBenchmark.avgDuration.toFixed(1)}ms`)
  console.log(`- Min: ${chatLoadBenchmark.minDuration}ms`)
  console.log(`- Max: ${chatLoadBenchmark.maxDuration}ms`)
  console.log(`- Success Rate: ${chatLoadBenchmark.successRate}%`)
}
