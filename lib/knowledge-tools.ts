import { tool } from 'ai'
import { z } from 'zod'
import { getContextForAIPrompt } from './data/context-integration'
import { rateLimitedAI } from './rate-limited-ai'
import { searchRedditWithContext } from './tools'

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

export function createKnowledgeTools() {
  const knowledgeBase = tool({
    description:
      'Retrieve the most relevant chunks from the VIT knowledge base. Use this when you need information about VIT policies, facilities, or general university information. After calling this tool, you MUST continue with a comprehensive response using the retrieved information - do not stop at the tool call.',
    parameters: z.object({
      query: z.string().describe('User query requiring university knowledge'),
      max_chunks: z
        .number()
        .int()
        .min(1)
        .max(8)
        .default(4)
        .describe('Maximum number of context chunks to return (1-8)')
        .optional(),
    }),
    execute: async ({ query, max_chunks = 4 }) => {
      console.info('[knowledgeBase] incoming query:', query)
      console.debug('[knowledgeBase] max_chunks:', max_chunks)
      try {
        const { embedding: vector } = await rateLimitedAI.google.embed({
          model: { modelId: 'gemini-embedding-001' },
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
          const chunks = rows.map(r => ({
            content: r.chunk as string,
            metadata: r.metadata,
            score: r.dist as number,
          }))
          console.debug(`[knowledgeBase] retrieved ${chunks.length} chunks`, {
            topScore: chunks[0]?.score,
          })

          return {
            success: true,
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
      } catch (err: any) {
        console.error('[knowledgeBaseTool] Fallback due to error:', err)
        const fallbackContext = getContextForAIPrompt({ includeAll: false, maxLength: 2000 })
        return {
          success: false,
          hidden: true,
          error: err?.message ?? 'RAG search failed',
          chunks: [fallbackContext],
        }
      }
    },
  })

  return { knowledgeBase }
}
