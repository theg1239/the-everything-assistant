import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeTokenUsage } from '../lib/token-usage'

const zero = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

test('reads AI SDK flat usage', () => {
  assert.deepEqual(normalizeTokenUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }), {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  })
})

test('reads AI SDK nested `{ total }` usage and derives the total', () => {
  assert.deepEqual(
    normalizeTokenUsage({
      inputTokens: { total: 120, noCache: 20, cacheRead: 100 },
      outputTokens: { total: 30, text: 25, reasoning: 5 },
    }),
    { inputTokens: 120, outputTokens: 30, totalTokens: 150 }
  )
})

test('reads OpenAI chat-completions and responses shapes', () => {
  assert.deepEqual(
    normalizeTokenUsage({ prompt_tokens: 7, completion_tokens: 3, total_tokens: 11 }),
    { inputTokens: 7, outputTokens: 3, totalTokens: 11 }
  )
  assert.deepEqual(normalizeTokenUsage({ input_tokens: 4, output_tokens: 6 }), {
    inputTokens: 4,
    outputTokens: 6,
    totalTokens: 10,
  })
})

test('falls back to the raw provider usage', () => {
  assert.deepEqual(
    normalizeTokenUsage({ raw: { input_tokens: { total: 9 }, completion_tokens: 1 } }),
    { inputTokens: 9, outputTokens: 1, totalTokens: 10 }
  )
})

test('prefers top-level fields over raw ones', () => {
  assert.deepEqual(
    normalizeTokenUsage({
      inputTokens: 1,
      outputTokens: 2,
      raw: { input_tokens: 99, output_tokens: 98 },
    }),
    { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
  )
})

test('derives the total from one side when only one is known', () => {
  assert.deepEqual(normalizeTokenUsage({ inputTokens: 8 }), {
    inputTokens: 8,
    outputTokens: 0,
    totalTokens: 8,
  })
})

test('ignores non-numeric, NaN and infinite values', () => {
  assert.deepEqual(
    normalizeTokenUsage({ inputTokens: '10', outputTokens: Number.NaN, totalTokens: Infinity }),
    zero
  )
  assert.deepEqual(
    normalizeTokenUsage({ inputTokens: Number.NaN, prompt_tokens: 3, outputTokens: null }),
    { inputTokens: 3, outputTokens: 0, totalTokens: 3 }
  )
})

test('returns zeros for missing or junk usage', () => {
  for (const usage of [undefined, null, 0, 'usage', [], {}, { raw: null }]) {
    assert.deepEqual(normalizeTokenUsage(usage), zero, JSON.stringify(usage))
  }
})
