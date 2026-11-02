import * as z from 'zod'

/**
 * Lenient reader for `{ error?, message? }` bodies (error responses and bare acknowledgements).
 * Never fails: wrong-typed fields and non-object bodies collapse to `undefined`.
 */
export const apiMessageSchema = z
  .object({
    error: z.string().optional().catch(undefined),
    message: z.string().optional().catch(undefined),
  })
  .catch({})

export type ApiMessage = z.infer<typeof apiMessageSchema>
