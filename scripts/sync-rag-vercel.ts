import { createHash } from 'crypto'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { encoding_for_model } from 'tiktoken'
import pg from 'pg'
import { getContextForAIPrompt } from '../lib/data/context-integration'
import { VIT_COMPREHENSIVE_KNOWLEDGE } from '../lib/knowledge-base'
import { ragEmbeddingDim, ragEmbeddingModelId } from '../lib/rag-config'
import { createOpenAI } from '@ai-sdk/openai'
import { embed } from 'ai'

import { ragSyncSkipReasons } from './rag-sync-policy'
import { syncGeneratedCorpus } from './rag-sync-transaction'

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
    const result = await syncGeneratedCorpus({
      client,
      hash,
      count: documents.length,
      commit: sha,
      model: ragEmbeddingModelId,
      assertCurrentHead: () => assertCurrentHead(sha, branch),
      prepareRows: async () => {
        const embeddingModel = createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).embedding(
          ragEmbeddingModelId
        )
        const rows: Array<{ text: string; vector: number[] }> = []
        for (const doc of documents) {
          const { embedding } = await embed({ model: embeddingModel, value: doc.pageContent })
          if (
            embedding.length !== ragEmbeddingDim ||
            embedding.some(value => !Number.isFinite(value))
          ) {
            throw new Error('Unexpected embedding dimension or value')
          }
          rows.push({ text: doc.pageContent.trim(), vector: embedding })
        }
        return rows
      },
    })
    console.log(
      result === 'current'
        ? `RAG corpus already current (${documents.length} chunks)`
        : `RAG corpus synced atomically (${documents.length} chunks)`
    )
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error('RAG sync failed:', error instanceof Error ? error.message : 'unknown error')
  process.exitCode = 1
})
