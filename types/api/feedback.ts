import * as z from 'zod'

const contributionSchema = z.object({
  title: z.string().optional(),
  body: z.string().min(1),
})

export const feedbackRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('feedback'),
    title: z.string().min(1),
    body: z.string().min(1),
    contribution: z.undefined().optional(),
  }),
  z.object({
    type: z.literal('contribution'),
    contribution: contributionSchema,
    title: z.string().optional(),
    body: z.string().optional(),
  }),
])

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>

/** `POST /api/feedback` (success body) */
export const feedbackResponseSchema = z.object({
  success: z.literal(true),
  issueUrl: z.string(),
})

/** `GET /api/knowledge`: rows of `vit_rag_chunks` (`id` is a uuid, `metadata` is jsonb). */
export const knowledgeChunksResponseSchema = z.array(
  z.object({
    id: z.string(),
    chunk: z.string(),
    metadata: z.unknown(),
  })
)

export type KnowledgeChunk = z.infer<typeof knowledgeChunksResponseSchema>[number]
