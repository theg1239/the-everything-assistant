#!/usr/bin/env tsx

import { PerformanceTester, runQuickPerformanceCheck } from '../lib/performance-tester'
import {
  getUser,
  createUser,
  getChats,
  getChatsWithMessageCounts,
  createChatWithFirstMessage,
  saveMessage,
} from '../lib/db'
import { DbOptimizations } from '../lib/db-optimizations'
import { nanoid } from 'nanoid'

const TEST_CONFIG = {
  testUserId: process.env.TEST_USER_ID || 'test-user-performance',
  testUserEmail: 'performance-test@example.com',
  testUserName: 'Performance Test User',

  benchmarkIterations: 5,
  chatLimit: 20,

  createTestUser: true,

  seedTestData: true,
  numTestChats: 10,
}

async function setupTestUser(): Promise<string> {
  console.log('Setting up test user...')

  let user = await getUser(TEST_CONFIG.testUserEmail)

  if (!user && TEST_CONFIG.createTestUser) {
    console.log('Creating new test user...')
    user = await createUser(
      TEST_CONFIG.testUserEmail,
      TEST_CONFIG.testUserName,
      'https://via.placeholder.com/150'
    )
    console.log(`Created user: ${user.id}`)
  } else if (!user) {
    throw new Error('Test user not found and createTestUser is disabled')
  } else {
    console.log(`Found existing user: ${user.id}`)
  }

  return user.id
}

async function seedTestData(userId: string, numChats: number = 5): Promise<void> {
  console.log(`Seeding test data (${numChats} chats with messages)...`)

  const chatTopics = [
    'JavaScript Performance Optimization',
    'React Best Practices Discussion',
    'Database Design Patterns',
    'TypeScript Advanced Features',
    'Node.js API Development',
    'Frontend Architecture Planning',
    'Testing Strategies Review',
    'Code Review Feedback',
    'Project Planning Session',
    'Technical Documentation',
  ]

  const userMessages = [
    'Can you help me understand how to optimize this code?',
    'What are the best practices for handling async operations?',
    "I'm having trouble with the database queries, can you take a look?",
    'How should I structure this component for better reusability?',
    "What's the most efficient way to implement this feature?",
    'Can you review my implementation and suggest improvements?',
    'I need help debugging this performance issue',
    'What testing approach would you recommend for this?',
    'How can I make this code more maintainable?',
    'What are some common pitfalls I should avoid here?',
  ]

  const assistantResponses = [
    "I'd be happy to help you optimize that code! Let me analyze the performance bottlenecks and suggest some improvements. Here are the key areas I've identified...",
    'Great question! For async operations, I recommend following these patterns: 1) Use Promise.all() for concurrent operations, 2) Implement proper error handling with try-catch blocks...',
    "I can see the issue with your database queries. The main problem is the N+1 query pattern. Here's how we can optimize it using joins and proper indexing...",
    'For better component reusability, I suggest following these principles: 1) Single Responsibility, 2) Prop composition over inheritance, 3) Custom hooks for shared logic...',
    "The most efficient approach would be to implement this using a combination of memoization and lazy loading. Here's a step-by-step implementation...",
    "I've reviewed your implementation and found several areas for improvement. The code is solid overall, but here are my suggestions for enhancement...",
    "This performance issue appears to be related to memory leaks and inefficient re-renders. Let's trace through the execution and identify the bottlenecks...",
    "For testing this functionality, I'd recommend a layered approach: unit tests for individual functions, integration tests for workflows, and e2e tests for user journeys...",
    'To improve maintainability, consider these refactoring strategies: 1) Extract reusable utilities, 2) Implement clear interfaces, 3) Add comprehensive documentation...',
    'Here are the common pitfalls to watch out for: 1) Premature optimization, 2) Tight coupling between components, 3) Inconsistent error handling patterns...',
  ]

  for (let i = 0; i < numChats; i++) {
    try {
      const topic = chatTopics[i % chatTopics.length]
      const chatPath = `/chat/${nanoid()}`
      const userMessage = userMessages[i % userMessages.length]
      const { chat } = await createChatWithFirstMessage(userId, topic, chatPath, userMessage)

      const assistantResponse = assistantResponses[i % assistantResponses.length]
      await saveMessage(chat.id, 'assistant', assistantResponse)

      if (i % 3 === 0) {
        await saveMessage(
          chat.id,
          'user',
          "Thanks! That's very helpful. Can you elaborate on the first point?"
        )
        await saveMessage(
          chat.id,
          'assistant',
          'Absolutely! Let me dive deeper into that concept. The key thing to understand is...'
        )
      }

      if (i % 4 === 0) {
        await saveMessage(chat.id, 'user', "I implemented your suggestions. Here's what I found...")
        await saveMessage(
          chat.id,
          'assistant',
          "Excellent progress! I can see you've applied the concepts well. For the next step, consider..."
        )
        await saveMessage(
          chat.id,
          'user',
          'Perfect, that makes sense. One more question about edge cases...'
        )
        await saveMessage(
          chat.id,
          'assistant',
          "Great question about edge cases! Here's how to handle those scenarios robustly..."
        )
      }

      console.log(`Created chat: ${topic} (${chat.id})`)
    } catch (error) {
      console.error(`Failed to create test chat ${i + 1}:`, error)
    }
  }

  console.log(`Finished seeding ${numChats} test chats with realistic conversation data`)
}

async function runBasicPerformanceTest(userId: string): Promise<void> {
  console.log('\n Running Basic Performance Test...\n')

  try {
    await runQuickPerformanceCheck(userId)
  } catch (error) {
    console.error('Basic performance test failed:', error)
  }
}

async function runAdvancedPerformanceTest(userId: string): Promise<void> {
  console.log('\n Running Advanced Performance Tests...\n')

  try {
    const { connectionHealth, testResults } = await PerformanceTester.runPerformanceTests(userId)

    console.log(`**Connection Health:** ${connectionHealth ? 'Healthy' : 'Failed'}`)
    console.log('\n**Test Results:**')

    for (const result of testResults) {
      const statusIcon = result.status === 'success' ? '✅' : '❌'
      const perfIcon = result.duration < 100 ? '🚀' : result.duration < 500 ? '⚡' : '⚠️'
      console.log(
        `${statusIcon} ${perfIcon} ${result.operation}: ${result.duration}ms (${result.recordCount} records)`
      )
    }

    const successfulTests = testResults.filter(r => r.status === 'success')
    const avgDuration =
      successfulTests.reduce((acc, r) => acc + r.duration, 0) / successfulTests.length
    const successRate = (successfulTests.length / testResults.length) * 100

    console.log('\n**Summary:**')
    console.log(`- Success Rate: ${successRate.toFixed(1)}%`)
    console.log(`- Average Duration: ${avgDuration.toFixed(1)}ms`)
    console.log(`- Fast Queries (<100ms): ${testResults.filter(r => r.duration < 100).length}`)
    console.log(`- Slow Queries (>1000ms): ${testResults.filter(r => r.duration > 1000).length}`)
  } catch (error) {
    console.error('❌ Advanced performance test failed:', error)
  }
}

async function runBenchmarkTests(userId: string): Promise<void> {
  console.log('\n Running Benchmark Tests...\n')

  const benchmarks: Array<{ name: string; operation: () => Promise<any> }> = [
    {
      name: 'Chat Loading (Basic)',
      operation: () => getChats(userId, 10),
    },
    {
      name: 'Chat Loading (With Metadata)',
      operation: () => getChatsWithMessageCounts(userId, 10),
    },
    {
      name: 'Cursor Pagination',
      operation: async () => {
        const result = await DbOptimizations.getChatsPaginated(userId, undefined, 10)
        return result.chats
      },
    },
    {
      name: 'User Activity Summary',
      operation: () => DbOptimizations.getUserActivitySummary(userId, 7),
    },
    {
      name: 'Database Health Check',
      operation: () => DbOptimizations.healthCheck(),
    },
  ]

  for (const benchmark of benchmarks) {
    try {
      console.log(`Benchmarking: ${benchmark.name}...`)

      const result = await PerformanceTester.benchmarkSpecificOperation(
        benchmark.name,
        benchmark.operation,
        TEST_CONFIG.benchmarkIterations
      )

      const perfIcon = result.avgDuration < 100 ? '🚀' : result.avgDuration < 500 ? '⚡' : '⚠️'

      console.log(`${perfIcon} **${result.name}:**`)
      console.log(`   - Average: ${result.avgDuration.toFixed(1)}ms`)
      console.log(`   - Range: ${result.minDuration}ms - ${result.maxDuration}ms`)
      console.log(`   - Success Rate: ${result.successRate.toFixed(1)}%`)
      console.log(`   - Iterations: ${result.iterations}`)
      console.log('')
    } catch (error) {
      console.error(`❌ Benchmark failed for ${benchmark.name}:`, error)
    }
  }
}

async function runStressTest(userId: string): Promise<void> {
  console.log('\n Running Stress Test...\n')
  try {
    const concurrentOperations = 10
    const operations = Array(concurrentOperations)
      .fill(null)
      .map((_, i) => ({
        name: `Concurrent Chat Load ${i + 1}`,
        operation: () => getChats(userId, 5),
      }))

    console.log(`Running ${concurrentOperations} concurrent operations...`)

    const startTime = Date.now()
    const promises = operations.map(op =>
      PerformanceTester.benchmarkSpecificOperation(op.name, op.operation, 1)
    )

    const results = await Promise.all(promises)
    const totalTime = Date.now() - startTime

    const avgDuration = results.reduce((acc, r) => acc + r.avgDuration, 0) / results.length
    const successfulOps = results.filter(r => r.successRate === 100).length

    console.log(`✅ Stress test completed in ${totalTime}ms`)
    console.log(`   - Concurrent Operations: ${concurrentOperations}`)
    console.log(`   - Successful Operations: ${successfulOps}/${concurrentOperations}`)
    console.log(`   - Average Operation Time: ${avgDuration.toFixed(1)}ms`)
    console.log(`   - Success Rate: ${((successfulOps / concurrentOperations) * 100).toFixed(1)}%`)

    if (avgDuration < 200) {
      console.log('Excellent concurrent performance!')
    } else if (avgDuration < 500) {
      console.log('Good concurrent performance')
    } else {
      console.log('Concurrent performance could be improved')
    }
  } catch (error) {
    console.error('Stress test failed:', error)
  }
}

async function generateFullReport(userId: string): Promise<void> {
  console.log('\n Generating Full Performance Report...\n')

  try {
    const report = await PerformanceTester.generatePerformanceReport(userId)

    const fs = await import('fs/promises')
    const path = await import('path')

    const reportPath = path.join(process.cwd(), 'performance-report.md')
    await fs.writeFile(reportPath, report, 'utf-8')

    console.log(report)
    console.log(`\n Full report saved to: ${reportPath}`)
  } catch (error) {
    console.error('Failed to generate report:', error)
  }
}

async function main(): Promise<void> {
  console.log('Database Performance Testing Suite')
  console.log('=====================================\n')

  try {
    const userId = await setupTestUser()

    if (TEST_CONFIG.seedTestData) {
      await seedTestData(userId, TEST_CONFIG.numTestChats)
      console.log('')
    }

    const args = process.argv.slice(2)
    const testType = args[0] || 'all'
    switch (testType) {
      case 'seed':
        console.log('Test data seeded successfully!')
        return

      case 'basic':
        await runBasicPerformanceTest(userId)
        break

      case 'advanced':
        await runAdvancedPerformanceTest(userId)
        break

      case 'benchmark':
        await runBenchmarkTests(userId)
        break

      case 'stress':
        await runStressTest(userId)
        break

      case 'report':
        await generateFullReport(userId)
        break

      case 'all':
      default:
        await runBasicPerformanceTest(userId)
        await runAdvancedPerformanceTest(userId)
        await runBenchmarkTests(userId)
        await runStressTest(userId)
        await generateFullReport(userId)
        break
    }

    console.log('\n Performance testing completed!')
  } catch (error) {
    console.error('\n Performance testing failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export { main as runPerformanceTests }
