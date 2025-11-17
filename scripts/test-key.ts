#!/usr/bin/env npx tsx
const path = require('path')
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') })

import { getRateLimitedAI } from '../lib/rate-limited-ai'
import rateLimitedAI from '../lib/rate-limited-ai'

type Provider = 'google' | 'groq' | 'cerebras'

function listEnvKeysForProvider(provider: Provider) {
  const keys: string[] = []
  if (provider === 'google') {
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY)
      keys.push(process.env.GOOGLE_GENERATIVE_AI_API_KEY)
    for (let i = 1; i <= 10; i++) {
      const k = process.env[`GOOGLE_GENERATIVE_AI_API_KEY_${i}`]
      if (k) keys.push(k)
    }
    if (process.env.GOOGLE_AI_API_KEYS) {
      keys.push(
        ...process.env.GOOGLE_AI_API_KEYS.split(',')
          .map(s => s.trim())
          .filter(Boolean)
      )
    }
  } else if (provider === 'groq') {
    if (process.env.GROQ_API_KEY) keys.push(process.env.GROQ_API_KEY)
    for (let i = 1; i <= 10; i++) {
      const k = process.env[`GROQ_API_KEY_${i}`]
      if (k) keys.push(k)
    }
    if (process.env.GROQ_API_KEYS) {
      keys.push(
        ...process.env.GROQ_API_KEYS.split(',')
          .map(s => s.trim())
          .filter(Boolean)
      )
    }
  } else if (provider === 'cerebras') {
    if (process.env.CEREBRAS_API_KEY) keys.push(process.env.CEREBRAS_API_KEY)
    for (let i = 1; i <= 10; i++) {
      const k = process.env[`CEREBRAS_API_KEY_${i}`]
      if (k) keys.push(k)
    }
    if (process.env.CEREBRAS_API_KEYS) {
      keys.push(
        ...process.env.CEREBRAS_API_KEYS.split(',')
          .map(s => s.trim())
          .filter(Boolean)
      )
    }
  }
  return keys
}

type TestResult = {
  provider: Provider
  foundKeys: number
  usageStats?: { ok: boolean; error?: string }
  generateText?: { ok: boolean; error?: string }
  retried?: { anyFailures: boolean; details?: string }
}

async function testProvider(provider: Provider): Promise<TestResult> {
  console.log('\n--------------------------------------------------')
  console.log(`Testing provider: ${provider}`)
  const envKeys = listEnvKeysForProvider(provider)
  const result: TestResult = { provider, foundKeys: envKeys.length }
  if (envKeys.length === 0) {
    console.log('  No keys found for this provider in the .env')
    return result
  }
  console.log(`  Found ${envKeys.length} key(s) from .env (not printing keys for security)`)

  try {
    const ai: any = await getRateLimitedAI(provider)
    if (!ai) {
      console.log('  Could not create provider instance (returned falsy).')
      return result
    }

    if (typeof ai.getUsageStats === 'function') {
      console.log('  Calling getUsageStats()...')
      try {
        const stats = await ai.getUsageStats()
        console.log('  ✅ getUsageStats succeeded. Sample output:')
        console.log(JSON.stringify(stats, null, 2).slice(0, 2000))
        result.usageStats = { ok: true }
      } catch (err: any) {
        const msg = (err && err.message) || String(err)
        console.log('  ❌ getUsageStats failed:')
        console.log('    ', msg)
        result.usageStats = { ok: false, error: msg }
      }
    }

    try {
      const api: any = (rateLimitedAI as any)[provider]
      if (!api || typeof api.generateText !== 'function') {
        console.log('  ⚠️ Provider API not exposed on rateLimitedAI object for this provider.')
      } else {
        console.log('  Preparing model function via rateLimitedAI.' + provider + '.model()')
        let modelFn: any = null
        try {
          modelFn = await api.model()
        } catch (mErr) {
          try {
            modelFn = await api.model()
          } catch (_) {
            modelFn = undefined
          }
        }

        console.log('  Calling generateText(...) as active test (short prompt)...')
        try {
          const opts: any = {
            model: modelFn,
            prompt: 'Say hello in one short sentence',
            maxTokens: 24,
          }
          const gResult = await api.generateText(opts)
          console.log('  ✅ generateText succeeded.')
          try {
            console.log('  Sample response:', JSON.stringify(gResult).slice(0, 1000))
          } catch (_) {}
          result.generateText = { ok: true }
        } catch (err: any) {
          const msg = (err && err.message) || String(err)
          console.log('  ❌ generateText failed:', msg)
          result.generateText = { ok: false, error: msg }
        }

        try {
          const postStats = await ai.getUsageStats()
          const failures: Array<{ key: string; failures: number }> = []
          for (const [k, v] of Object.entries(postStats)) {
            const f = (v as any).failures || 0
            if (f > 0) failures.push({ key: k, failures: f })
          }
          if (failures.length > 0) {
            result.retried = {
              anyFailures: true,
              details: failures.map(x => `${x.key}=${x.failures}`).join(','),
            }
            console.log(
              '  ⚠️ Detected API key failures recorded by ApiKeyManager:',
              result.retried.details
            )
          } else {
            result.retried = { anyFailures: false }
          }
        } catch (sErr: any) {
          const msg = (sErr && sErr.message) || String(sErr)
          result.retried = { anyFailures: false, details: `failed to read stats: ${msg}` }
        }
      }
    } catch (err: any) {
      const msg = (err && err.message) || String(err)
      console.log('  ❌ Error during active generateText test:', msg)
      result.generateText = { ok: false, error: msg }
    }
    return result
  } catch (err: any) {
    const msg = (err && err.message) || String(err)
    console.log('  ❌ Error creating/testing provider instance:')
    console.log('    ', msg)
    result.generateText = result.generateText || { ok: false, error: msg }
    result.usageStats = result.usageStats || { ok: false, error: msg }
    return result
  }
}

async function main() {
  const providers: Provider[] = ['google', 'groq', 'cerebras']
  const results: TestResult[] = []
  for (const p of providers) {
    const r = await testProvider(p)
    results.push(r)
  }

  console.log('\nAll providers tested.')

  console.log('\n================ Summary ================')
  for (const r of results) {
    if (!r) continue
    const parts: string[] = []
    parts.push(`${r.provider}: keys=${r.foundKeys}`)
    if (r.usageStats) parts.push(`usage=${r.usageStats.ok ? 'ok' : 'fail'}`)
    if (r.generateText) parts.push(`generateText=${r.generateText.ok ? 'ok' : 'fail'}`)
    if (r.generateText?.error) parts.push(`err=${r.generateText.error.split('\n')[0]}`)
    if (r.retried) parts.push(`retries=${r.retried.anyFailures ? 'yes' : 'no'}`)
    if (r.retried?.details) parts.push(`retryDetails=${r.retried.details}`)
    console.log(' - ' + parts.join(' | '))
  }
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
