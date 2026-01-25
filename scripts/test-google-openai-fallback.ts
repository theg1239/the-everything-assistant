#!/usr/bin/env npx tsx
const path = require('path')
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') })

import { getRateLimitedAI } from '../lib/rate-limited-ai'
import { ApiKeyManagerError } from '../lib/api-key-manager'
import { modelIds } from '../lib/model-registry'

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required to run this fallback test.')
    process.exit(1)
  }

  const ai: any = getRateLimitedAI('google')
  console.log('[test] Starting Google->OpenAI fallback test')
  console.log(`[test] OPENAI_API_KEY present: ${Boolean(process.env.OPENAI_API_KEY)}`)
  console.log(`[test] Google model requested: ${modelIds.chat}`)
  console.log('[test] Expected OpenAI fallback model: gpt-4o-mini (from rate-limited-ai)')
  const originalExecute = ai.apiKeyManager.executeWithRateLimit.bind(ai.apiKeyManager)

  console.log('[test] Patching ApiKeyManager.executeWithRateLimit to force exhaustion')
  ai.apiKeyManager.executeWithRateLimit = async () => {
    throw new ApiKeyManagerError('ALL_KEYS_EXHAUSTED', 'Forced exhaustion for dev fallback test')
  }

  try {
    const startedAt = Date.now()
    console.log('[test] Calling generateText (should trigger OpenAI fallback)...')
    const result = await ai.generateText({
      model: { modelId: modelIds.chat },
      prompt: 'Reply with the single word "ok".',
      maxTokens: 5,
      temperature: 0,
    })
    const elapsedMs = Date.now() - startedAt
    console.log(`[test] generateText completed in ${elapsedMs}ms`)
    console.log('[test] Fallback test succeeded. Response:', (result as any)?.text ?? result)
  } finally {
    console.log('[test] Restoring ApiKeyManager.executeWithRateLimit')
    ai.apiKeyManager.executeWithRateLimit = originalExecute
  }
}

main().catch((err: any) => {
  console.error('Fallback test failed:', err?.message || err)
  process.exit(1)
})
