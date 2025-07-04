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
      'Retrieve the most relevant chunks from the VIT knowledge base and structured context. The result is injected into chat hidden from UI.',
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
          model: { modelId: 'text-embedding-004' },
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
          let answer = ''
          try {
            const context = chunks
              .map(c => c.content)
              .join('\n\n')
              .slice(0, 6000)
            
            const answerResp = await rateLimitedAI.google.generateText(
              {
                model: await rateLimitedAI.google.model(),
                prompt: `You are a friendly assistant for VIT Vellore students. Using ONLY the context below, write a clear answer that is easy to skim.\n\nFormatting rules:\n1. Break information into short paragraphs or bullet lists (markdown "- item" format).\n2. Bold important keywords or club names with **double asterisks**.\n3. If a table is genuinely the best way to show structured data, you MAY use a simple HTML table (<table>, <tr>, <td>). Otherwise, avoid HTML tags.\n4. Use all lowercase in your output other than proper nouns or course codes.\n5. If the context is insufficient, say you cannot answer the query due to lack of context also try suggesting that if they know this information, they can suggest to add it to the knowledge base via settings -> feedback, try to still help out the user based on what you know about VIT Vellore. \n\nCONTEXT:\n${context}\n\nQUESTION: ${query}\n\nAnswer:`,
                maxTokens: 1024,
                temperature: 0.3,
              },
              undefined
            )
            answer = answerResp.text.trim()
            console.info('[knowledgeBase] synthesized answer length:', answer.length)

            if (answer.trim() === 'I_DONT_KNOW' || answer.toLowerCase().includes('insufficient context')) {
              console.log('[knowledgeBase] Context insufficient, trying Reddit search...')
              const redditResults = await searchRedditWithContext(query)
              if (redditResults.success && redditResults.response) {
                answer = `Here's what I found from Reddit discussions:\n\n${redditResults.response}`
                if (redditResults.sources && redditResults.sources.length > 0) {
                  answer += '\n\nSources:\n' + redditResults.sources.map((s: any) => `- ${s.title}: ${s.url}`).join('\n')
                }
              } else {
                answer = "I couldn't find relevant information in either the knowledge base or Reddit discussions. Could you try rephrasing your question or providing more details?"
              }
            }
          } catch (genErr) {
            console.error('[knowledgeBaseTool] Failed to generate answer:', genErr)
          }
          return { success: true, hidden: true, chunks, answer }
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
