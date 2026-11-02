import { randomUUID } from 'crypto'

export type RagRow = { text: string; vector: number[] }
type Client = {
  query: (sql: string, values?: any[]) => Promise<{ rows: any[] }>
}

type SyncOptions = {
  client: Client
  hash: string
  count: number
  commit: string
  model: string
  prepareRows: () => Promise<RagRow[]>
  assertCurrentHead: () => Promise<void>
}

const countSql =
  "SELECT count(*)::int AS count FROM vit_rag_chunks WHERE metadata->>'source' = 'vercel-rag-sync' AND metadata->>'corpusHash' = $1"

/** Prepare embeddings outside the write transaction; retry only definite serialization aborts. */
export async function syncGeneratedCorpus(options: SyncOptions): Promise<'current' | 'synced'> {
  const { client, hash, count, commit, model, prepareRows, assertCurrentHead } = options
  const existing = await client.query(countSql, [hash])
  if (Number(existing.rows[0].count) === count) return 'current'
  const rows = await prepareRows()
  if (rows.length !== count) throw new Error('Embedding count does not match corpus')

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
      const current = await client.query(countSql, [hash])
      if (Number(current.rows[0].count) === count) {
        await client.query('COMMIT')
        return 'current'
      }
      await assertCurrentHead()
      await client.query(
        "DELETE FROM vit_rag_chunks WHERE metadata->>'source' IN ('seed-rag-ts', 'vercel-rag-sync')"
      )
      // Keep each statement small to avoid parameter limits and long per-row round trips.
      const batchSize = 25
      for (let start = 0; start < rows.length; start += batchSize) {
        const batch = rows.slice(start, start + batchSize)
        const values: unknown[] = []
        const placeholders = batch.map((row, offset) => {
          const idx = start + offset
          const metadata = {
            source: 'vercel-rag-sync',
            corpusHash: hash,
            commit,
            model,
            idx,
            length: row.text.length,
          }
          values.push(
            randomUUID(),
            row.text,
            JSON.stringify(metadata),
            '[' + row.vector.join(',') + ']'
          )
          const base = offset * 4
          return `($${base + 1}, $${base + 2}, $${base + 3}::jsonb, $${base + 4})`
        })
        await client.query(
          `INSERT INTO vit_rag_chunks (id, chunk, metadata, embedding) VALUES ${placeholders.join(', ')}`,
          values
        )
      }
      await client.query('COMMIT')
      return 'synced'
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      if ((error as { code?: string }).code !== '40001' || attempt === 2) throw error
    }
  }
  throw new Error('RAG sync transaction failed')
}
