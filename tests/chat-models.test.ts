import assert from 'node:assert/strict'
import test from 'node:test'
import { modelRegistry } from '../lib/model-registry'

test('all configured chat and text workloads use the requested model without changing embeddings', () => {
  for (const [key, value] of Object.entries(modelRegistry)) {
    if (key === 'embedding' || key === 'knowledgeEmbedding') {
      assert.equal(value.modelId, 'text-embedding-3-large', key)
    } else {
      assert.equal(value.modelId, 'gpt-6.1-terra', key)
      assert.equal(value.provider, 'openai', key)
    }
  }
})
