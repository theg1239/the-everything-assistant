import assert from 'node:assert/strict'
import test from 'node:test'
import { ragSyncSkipReasons, shouldSyncRag } from '../scripts/rag-sync-policy'

const production = {
  VERCEL: '1',
  VERCEL_ENV: 'production',
  VERCEL_GIT_PROVIDER: 'github',
  VERCEL_GIT_REPO_OWNER: 'theg1239',
  VERCEL_GIT_REPO_SLUG: 'the-everything-assistant',
  VERCEL_GIT_COMMIT_REF: 'main',
  VERCEL_PROJECT_PRODUCTION_URL: 'www.everything-assistant.com',
}

test('only the intended Git production project can sync', () => {
  assert.equal(shouldSyncRag(production), true)
  assert.equal(shouldSyncRag({ ...production, VERCEL_GIT_COMMIT_REF: 'stable' }), true)
  assert.equal(shouldSyncRag({ ...production, VERCEL_GIT_COMMIT_REF: 'prod' }), true)
  assert.equal(shouldSyncRag({ ...production, VERCEL_GIT_COMMIT_REF: 'staging' }), true)
  assert.equal(
    shouldSyncRag({ ...production, VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'staging' }),
    false
  )
  assert.equal(
    shouldSyncRag({ ...production, VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'stable' }),
    false
  )
  assert.equal(
    shouldSyncRag({ ...production, VERCEL_PROJECT_PRODUCTION_URL: 'everything-assistant.com' }),
    true
  )
  for (const key of Object.keys(production)) {
    if (key !== 'VERCEL_GIT_COMMIT_REF') {
      assert.equal(shouldSyncRag({ ...production, [key]: 'other' }), false, key)
    }
    const missing = { ...production }
    delete missing[key as keyof typeof missing]
    assert.equal(shouldSyncRag(missing), false, key)
  }
  assert.equal(shouldSyncRag({ ...production, VERCEL_ENV: 'preview' }), false)
  assert.equal(shouldSyncRag({}), false)
})

test('skip diagnostics name failed checks without exposing values', () => {
  assert.deepEqual(
    ragSyncSkipReasons({ ...production, VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'staging' }),
    ['VERCEL_ENV']
  )
})
