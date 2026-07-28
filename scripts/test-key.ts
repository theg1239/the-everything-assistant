#!/usr/bin/env npx tsx
const path = require('path')
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') })

import { getRateLimitedAI } from '../lib/rate-limited-ai'

function listOpenAIKeys() {
  const keys = new Set<string>()
  if (process.env.OPENAI_API_KEY) keys.add(process.env.OPENAI_API_KEY)

  for (let i = 2; i <= 10; i++) {
    const key = process.env[`OPENAI_API_KEY_${i}`]
    if (key) keys.add(key)
  }

  for (const key of (process.env.OPENAI_API_KEYS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)) {
    keys.add(key)
  }

  return [...keys]
}

async function main() {
  const keys = listOpenAIKeys()
  console.log(`Found ${keys.length} OpenAI key(s) (values are not printed).`)

  if (keys.length === 0) {
    console.error('Set OPENAI_API_KEY or OPENAI_API_KEYS before running this test.')
    process.exit(1)
  }

  const client = getRateLimitedAI('openai')
  const result = await client.generateText({
    model: { modelId: 'gpt-5.6-luna' },
    prompt: 'Say hello in one short sentence.',
    maxOutputTokens: 24,
    providerOptions: {
      openai: {
        reasoningEffort: 'none',
      },
    },
  })

  console.log('OpenAI generation succeeded:', result.text)
  console.log('Usage stats:', JSON.stringify(await client.getUsageStats(), null, 2))
}

main().catch(error => {
  console.error('OpenAI provider test failed:', error)
  process.exit(1)
})
