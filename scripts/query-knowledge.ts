#!/usr/bin/env ts-node
/**
 * scripts/query-knowledge.ts
 *
 * Simple CLI utility to interactively query the RAG knowledge base.
 * It leverages the `knowledgeBase` tool returned by `createKnowledgeTools()`
 * and prints the retrieved chunks to the console so that you can inspect
 * whether seeding & similarity search are working as expected.
 *
 * Usage:
 *   npx tsx scripts/query-knowledge.ts "When does Riviera happen?"
 *   # or run without arguments to enter an interactive REPL
 */

import 'dotenv/config'
import readline from 'readline'
import { createKnowledgeTools } from '../lib/knowledge-tools'

async function runQuery(query: string, maxChunks = 4) {
  const { knowledgeBase } = createKnowledgeTools()
  const result = (await (knowledgeBase as any).execute(
    { query, max_chunks: maxChunks },
    undefined
  )) as any

  if (!result.success) {
    console.error('Query failed:', result.error)
    console.log('Fallback chunks:\n', result.chunks?.join('\n'))
    return
  }

  console.log(`\nTop ${result.chunks.length} relevant chunk(s):`)
  for (const [i, c] of result.chunks.entries()) {
    console.log(`\n[${i + 1}] (score=${c.score.toFixed(4)})`)
    console.log(c.content)
  }
  console.log('')
}

async function main() {
  const arg = process.argv.slice(2).join(' ').trim()

  if (arg) {
    await runQuery(arg)
    process.exit(0)
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q: string) => new Promise<string>(res => rl.question(q, res))

  console.log('VIT Knowledge Base CLI - type "exit" to quit')
  while (true) {
    const q = (await ask('\nAsk VIT> ')).trim()
    if (!q || q.toLowerCase() === 'exit' || q.toLowerCase() === 'quit') break
    try {
      await runQuery(q)
    } catch (err) {
      console.error('Error:', err)
    }
  }
  rl.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
