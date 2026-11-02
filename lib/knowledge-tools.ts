import { embed, tool } from 'ai'
import * as z from 'zod'
import { openai } from './ai'
import { getContextForAIPrompt } from './data/context-integration'
import { ragEmbeddingModelId } from './rag-config'

let _ragPool: import('pg').Pool | null = null
export async function getRagPool() {
  if (_ragPool) return _ragPool
  const { Pool } = await import('pg')
  if (!process.env.DATABASE_URL2) {
    throw new Error('DATABASE_URL2 is not configured for RAG search')
  }
  _ragPool = new Pool({ connectionString: process.env.DATABASE_URL2, max: 20 })
  return _ragPool
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
  console.info('[knowledgeBase] incoming query:', query)
  console.debug('[knowledgeBase] max_chunks:', max_chunks)
  try {
    const { embedding: vector } = await embed({
      model: openai.embeddingModel(ragEmbeddingModelId),
      value: query,
    })

    const pool = await getRagPool()
    const client = await pool.connect()
    try {
      const { rows } = await client.query(
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
      console.debug(`[knowledgeBase] retrieved ${chunks.length} chunks`, {
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
    } finally {
      client.release()
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
