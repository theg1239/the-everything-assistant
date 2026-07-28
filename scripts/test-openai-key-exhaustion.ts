#!/usr/bin/env npx tsx
const path = require('path')
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') })

import { getRateLimitedAI } from '../lib/rate-limited-ai'
import { ApiKeyManagerError } from '../lib/api-key-manager'
import { modelIds } from '../lib/model-registry'

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required to run this key-exhaustion test.')
    process.exit(1)
  }

  const ai: any = getRateLimitedAI('openai')
  console.log('[test] Starting OpenAI key-exhaustion test')
  console.log(`[test] OPENAI_API_KEY present: ${Boolean(process.env.OPENAI_API_KEY)}`)
  console.log(`[test] OpenAI model requested: ${modelIds.chat}`)
  const originalExecute = ai.apiKeyManager.executeWithRateLimit.bind(ai.apiKeyManager)

  console.log('[test] Patching ApiKeyManager.executeWithRateLimit to force exhaustion')
  ai.apiKeyManager.executeWithRateLimit = async () => {
    throw new ApiKeyManagerError('ALL_KEYS_EXHAUSTED', 'Forced exhaustion for dev fallback test')
  }

  try {
    console.log('[test] Calling generateText (should surface key exhaustion)...')
    await ai.generateText({
      model: { modelId: modelIds.chat },
      prompt: 'Reply with the single word "ok".',
      maxOutputTokens: 5,
    })
    throw new Error('Expected ALL_KEYS_EXHAUSTED but generation succeeded')
  } catch (error) {
    if (!(error instanceof ApiKeyManagerError) || error.code !== 'ALL_KEYS_EXHAUSTED') {
      throw error
    }
    console.log('[test] OpenAI key exhaustion surfaced correctly.')
  } finally {
    console.log('[test] Restoring ApiKeyManager.executeWithRateLimit')
    ai.apiKeyManager.executeWithRateLimit = originalExecute
  }
}

main().catch((err: any) => {
  console.error('Key-exhaustion test failed:', err?.message || err)
  process.exit(1)
})
