import { z } from 'zod'

const contributorSchema = z.object({
  name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
})

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
    user: contributorSchema.optional(),
  }),
  z.object({
    type: z.literal('contribution'),
    contribution: contributionSchema,
    title: z.string().optional(),
    body: z.string().optional(),
    user: contributorSchema.optional(),
  }),
])

export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>
