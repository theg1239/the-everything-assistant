import * as z from 'zod/v3';

export const vtopResultSchema = z.object({
  command: z.string().describe('vtop command executed'),
  title: z.string().describe('short title for the result'),
  summary: z.string().describe('concise summary of the data'),
  formatted_content: z
    .string()
    .describe('well-structured HTML for rich rendering, valid and sanitized'),
  structured_data: z
    .object({
      data: z.any().optional(),
    })
    .passthrough()
    .optional()
    .describe('structured JSON form of the result'),
  meta: z
    .object({
      fetchedAt: z.string().describe('iso date of when data was fetched'),
      notes: z.string().optional(),
    })
    .optional(),
})
