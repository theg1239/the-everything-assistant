import assert from 'node:assert/strict'
import test from 'node:test'
import { syncGeneratedCorpus } from '../scripts/rag-sync-transaction'

function fixture() {
  const calls: string[] = []
  const insertSizes: number[] = []
  let prepared = 0
  let heads = 0
  let failInsert: string | undefined
  let count = 0
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push(sql)
      if (sql.startsWith('INSERT')) insertSizes.push(values?.length || 0)
      if (sql.startsWith('SELECT count')) return { rows: [{ count }] }
      if (sql.startsWith('INSERT') && failInsert) {
        const code = failInsert
        failInsert = undefined
        throw Object.assign(new Error('database error'), { code })
      }
      return { rows: [] }
    },
  }
  const options = {
    client,
    hash: 'hash',
    count: 1,
    commit: 'sha',
    model: 'model',
    prepareRows: async () => {
      prepared++
      return [{ text: 'chunk', vector: [1, 2] }]
    },
    assertCurrentHead: async () => {
      heads++
    },
  }
  return {
    calls,
    insertSizes,
    options,
    setFailure: (code: string) => (failInsert = code),
    setCount: (value: number) => (count = value),
    prepared: () => prepared,
    heads: () => heads,
  }
}

test('unchanged corpus does not embed or write', async () => {
  const f = fixture()
  f.setCount(1)
  assert.equal(await syncGeneratedCorpus(f.options), 'current')
  assert.equal(f.prepared(), 0)
  assert.equal(f.calls.length, 1)
})

test('serialization conflict rolls back and retries without regenerating vectors', async () => {
  const f = fixture()
  f.setFailure('40001')
  assert.equal(await syncGeneratedCorpus(f.options), 'synced')
  assert.equal(f.prepared(), 1)
  assert.equal(f.heads(), 2)
  assert.equal(f.calls.filter(s => s === 'BEGIN ISOLATION LEVEL SERIALIZABLE').length, 2)
  assert.equal(f.calls.filter(s => s === 'ROLLBACK').length, 1)
  assert.equal(f.calls.filter(s => s === 'COMMIT').length, 1)
  assert.ok(f.calls.some(s => s.includes("IN ('seed-rag-ts', 'vercel-rag-sync')")))
})

test('other transaction failures roll back and propagate', async () => {
  const f = fixture()
  f.setFailure('23505')
  await assert.rejects(syncGeneratedCorpus(f.options), /database error/)
  assert.equal(f.calls.filter(s => s === 'ROLLBACK').length, 1)
  assert.equal(f.calls.filter(s => s === 'COMMIT').length, 0)
})

test('embedding failure cannot delete existing rows', async () => {
  const f = fixture()
  f.options.prepareRows = async () => {
    throw new Error('embedding failed')
  }
  await assert.rejects(syncGeneratedCorpus(f.options), /embedding failed/)
  assert.equal(
    f.calls.some(s => s.startsWith('DELETE')),
    false
  )
})

test('writes in bounded batches without losing chunks', async () => {
  const f = fixture()
  f.options.count = 26
  f.options.prepareRows = async () =>
    Array.from({ length: 26 }, (_, idx) => ({ text: `chunk ${idx}`, vector: [1, 2] }))
  assert.equal(await syncGeneratedCorpus(f.options), 'synced')
  assert.deepEqual(f.insertSizes, [100, 4])
})
