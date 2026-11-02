import { createHash, randomUUID } from 'crypto'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { encoding_for_model } from 'tiktoken'
import pg from 'pg'
import { getContextForAIPrompt } from '../lib/data/context-integration'
import { VIT_COMPREHENSIVE_KNOWLEDGE } from '../lib/knowledge-base'
import { ragEmbeddingDim, ragEmbeddingModelId } from '../lib/rag-config'
import { createOpenAI } from '@ai-sdk/openai'
import { embed } from 'ai'

import { ragSyncSkipReasons } from './rag-sync-policy'

async function assertCurrentHead(sha: string, branch: string) {
  const response = await fetch(
    `https://api.github.com/repos/theg1239/the-everything-assistant/commits/${encodeURIComponent(branch)}`,
    {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'vit-rag-build-sync' },
      signal: AbortSignal.timeout(10000),
    }
  )
  if (!response.ok) throw new Error(`Cannot verify production branch head (${response.status})`)
  const data = (await response.json()) as { sha?: string }
  if (data.sha !== sha) throw new Error('Refusing to sync an obsolete production build')
}

async function main() {
  const skipReasons = ragSyncSkipReasons(process.env)
  if (skipReasons.length) {
    console.log(`RAG sync skipped; identity checks not met: ${skipReasons.join(', ')}`)
    return
  }
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  const branch = process.env.VERCEL_GIT_COMMIT_REF!
  if (!sha || !process.env.DATABASE_URL2 || !process.env.OPENAI_API_KEY) {
    throw new Error('RAG sync requires the Vercel commit SHA, DATABASE_URL2 and OpenAI credentials')
  }
  await assertCurrentHead(sha, branch)
  const raw =
    getContextForAIPrompt({ includeAll: true, maxLength: 100000 }) +
    '\n\n' +
    VIT_COMPREHENSIVE_KNOWLEDGE
  const encoder = encoding_for_model('gpt-3.5-turbo')
  const splitter = new RecursiveCharacterTextSplitter({
    separators: ['\n## ', '\n# ', '\n\n', '\n', ' ', ''],
    chunkSize: 200,
    chunkOverlap: 40,
    lengthFunction: text => encoder.encode(text).length,
  })
  const documents = await splitter.createDocuments([raw])
  encoder.free()
  if (!documents.length) throw new Error('RAG corpus is empty')
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        raw,
        model: ragEmbeddingModelId,
        dimension: ragEmbeddingDim,
        chunkSize: 200,
        overlap: 40,
      })
    )
    .digest('hex')
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL2, max: 1 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtext('vit-rag-sync-v1')) AS locked"
    )
    if (!lock.rows[0].locked) throw new Error('Another RAG sync is running; retry the build')
    // Fail safely if the table or expected vector dimension is not already provisioned.
    const existing = await client.query(
      "SELECT count(*)::int AS count FROM vit_rag_chunks WHERE metadata->>'source' = 'vercel-rag-sync' AND metadata->>'corpusHash' = $1",
      [hash]
    )
    if (existing.rows[0].count === documents.length) {
      await client.query('COMMIT')
      console.log(`RAG corpus already current (${documents.length} chunks)`)
      return
    }
    const embeddingModel = createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).embedding(
      ragEmbeddingModelId
    )
    const rows: Array<{ text: string; vector: number[] }> = []
    for (const doc of documents) {
      const { embedding } = await embed({
        model: embeddingModel,
        value: doc.pageContent,
      })
      if (embedding.length !== ragEmbeddingDim || embedding.some(value => !Number.isFinite(value)))
        throw new Error('Unexpected embedding dimension or value')
      rows.push({ text: doc.pageContent.trim(), vector: embedding })
    }
    await assertCurrentHead(sha, branch)
    // Replace only repository-generated corpus rows. Preserve custom and PDF uploads.
    await client.query(
      "DELETE FROM vit_rag_chunks WHERE metadata->>'source' IN ('seed-rag-ts', 'vercel-rag-sync')"
    )
    for (const [idx, row] of rows.entries()) {
      const metadata = {
        source: 'vercel-rag-sync',
        corpusHash: hash,
        commit: sha,
        model: ragEmbeddingModelId,
        idx,
        length: row.text.length,
      }
      await client.query(
        'INSERT INTO vit_rag_chunks (id, chunk, metadata, embedding) VALUES ($1, $2, $3::jsonb, $4)',
        [randomUUID(), row.text, JSON.stringify(metadata), '[' + row.vector.join(',') + ']']
      )
    }
    await client.query('COMMIT')
    console.log(`RAG corpus synced atomically (${rows.length} chunks)`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error('RAG sync failed:', error instanceof Error ? error.message : 'unknown error')
  process.exitCode = 1
})
