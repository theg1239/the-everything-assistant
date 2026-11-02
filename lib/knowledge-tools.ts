import { embed, tool } from 'ai'
import * as z from 'zod'
import { openai } from './ai'
import { getContextForAIPrompt } from './data/context-integration'
import { ragEmbeddingModelId } from './rag-config'
import { getRedis } from './redis'

let _ragPool: import('pg').Pool | null = null
/**
 * Shared pgvector pool (DATABASE_URL2). Kept small: every serverless instance gets its
 * own pool on top of Prisma's, a RAG lookup holds one connection for a single query,
 * and idle connections are released quickly so scaled-out instances don't exhaust
 * the database's connection limit.
 */
export async function getRagPool() {
  if (_ragPool) return _ragPool
  const { Pool } = await import('pg')
  if (!process.env.DATABASE_URL2) {
    throw new Error('DATABASE_URL2 is not configured for RAG search')
  }
  _ragPool = new Pool({
    connectionString: process.env.DATABASE_URL2,
    max: 3,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  })
  return _ragPool
}

/** Query embeddings are deterministic per (model, text): reuse them across requests. */
const EMBEDDING_CACHE_TTL_SECONDS = 24 * 60 * 60
const EMBEDDING_MEMORY_CACHE_MAX = 64
const embeddingMemoryCache = new Map<string, number[]>()
const embeddingSchema = z.array(z.number())

async function embeddingCacheKey(query: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${ragEmbeddingModelId}\n${query}`)
  )
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(
    ''
  )
  return `rag:query-embedding:v1:${hex}`
}

function rememberInMemory(key: string, embedding: number[]) {
  if (embeddingMemoryCache.size >= EMBEDDING_MEMORY_CACHE_MAX) {
    const oldest = embeddingMemoryCache.keys().next()
    if (!oldest.done) embeddingMemoryCache.delete(oldest.value)
  }
  embeddingMemoryCache.set(key, embedding)
}

/** Embedding for `query`: instance memory, then Redis, then the embeddings API. */
async function embedQuery(query: string): Promise<number[]> {
  const key = await embeddingCacheKey(query)
  const memo = embeddingMemoryCache.get(key)
  if (memo) return memo

  const redis = getRedis()
  if (redis) {
    try {
      const cached = embeddingSchema.safeParse(await redis.get(key))
      if (cached.success && cached.data.length > 0) {
        rememberInMemory(key, cached.data)
        return cached.data
      }
    } catch (error) {
      console.warn('[knowledgeBase] embedding cache read failed', error)
    }
  }

  const { embedding } = await embed({
    model: openai.embeddingModel(ragEmbeddingModelId),
    value: query,
  })
  rememberInMemory(key, embedding)
  if (redis) {
    redis
      .set(key, embedding, { ex: EMBEDDING_CACHE_TTL_SECONDS })
      .catch((error: unknown) =>
        console.warn('[knowledgeBase] embedding cache write failed', error)
      )
  }
  return embedding
}

const debugLog = (...args: unknown[]) => {
  if (process.env.CHAT_DEBUG === 'true') console.debug(...args)
}

const knowledgeBaseInputSchema = z.object({
  query: z.string().describe('User query requiring university knowledge'),
  max_chunks: z
    .number()
    .int()
    .min(1)
    .max(8)
    .default(4)
    .describe('Maximum number of context chunks to return (1-8)')
    .optional(),
})

type KnowledgeBaseInput = z.infer<typeof knowledgeBaseInputSchema>

const ragChunkRowSchema = z.object({
  chunk: z.string(),
  metadata: z.unknown(),
  dist: z.coerce.number(),
})

/** Embeds `query` and returns the nearest RAG chunks, or the static VIT context on failure. */
export async function searchKnowledgeBase({ query, max_chunks = 4 }: KnowledgeBaseInput) {
  debugLog('[knowledgeBase] incoming query:', query, { max_chunks })
  try {
    // Pool creation and the (possibly cached) embedding are independent.
    const [vector, pool] = await Promise.all([embedQuery(query), getRagPool()])

    const { rows } = await pool.query(
      `
      SELECT
        chunk,
        metadata,
        embedding <-> $1 AS dist
      FROM vit_rag_chunks
      ORDER BY dist
      LIMIT $2
      `,
      ['[' + vector.join(',') + ']', max_chunks]
    )
    const chunks = z
      .array(ragChunkRowSchema)
      .parse(rows)
      .map(r => ({
        content: r.chunk,
        metadata: r.metadata,
        score: r.dist,
      }))
    debugLog(`[knowledgeBase] retrieved ${chunks.length} chunks`, {
      topScore: chunks[0]?.score,
    })

    return {
      success: true as const,
      hidden: false,
      chunks: chunks.map(c => ({
        content: c.content,
        metadata: c.metadata,
        score: c.score,
      })),
      instruction: `You have successfully retrieved relevant information from the knowledge base. You must now provide a comprehensive answer to the user's question: "${query}". Use the information in the chunks above to formulate your response. Format your answer with proper markdown, bullet points, and use a conversational tone.`,
    }
  } catch (err) {
    console.error('[knowledgeBaseTool] Fallback due to error:', err)
    const fallbackContext = getContextForAIPrompt({ includeAll: false, maxLength: 2000 })
    return {
      success: false as const,
      hidden: true,
      error: err instanceof Error ? err.message : 'RAG search failed',
      chunks: [fallbackContext],
    }
  }
}

export function createKnowledgeTools() {
  const knowledgeBase = tool({
    description:
      'Retrieve the most relevant chunks from the VIT knowledge base. Use this when you need information about VIT policies, facilities, or general university information. After calling this tool, you MUST continue with a comprehensive response using the retrieved information - do not stop at the tool call.',
    inputSchema: knowledgeBaseInputSchema,
    execute: searchKnowledgeBase,
  })

  return { knowledgeBase }
}
