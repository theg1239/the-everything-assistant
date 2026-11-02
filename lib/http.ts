import type * as z from 'zod'
import { apiMessageSchema, type ApiMessage } from '@/types/api/common'

/**
 * Thrown by {@link readJson} when a response body doesn't match the expected schema.
 * The message is safe to show to users; the zod issues are kept on `cause`.
 */
export class UnexpectedResponseError extends Error {
  readonly url: string

  constructor(url: string, issues: z.ZodError) {
    super('Unexpected response from the server', { cause: issues })
    this.name = 'UnexpectedResponseError'
    this.url = url
  }
}

/**
 * Reads a JSON response body and validates it against `schema`.
 * Throws {@link UnexpectedResponseError} if the body doesn't match.
 */
export async function readJson<S extends z.ZodType>(
  response: Response,
  schema: S
): Promise<z.infer<S>> {
  const body: unknown = await response.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new UnexpectedResponseError(response.url, parsed.error)
  return parsed.data
}

/**
 * Reads an `{ error?, message? }` body (typically from a non-OK response). Never throws:
 * non-JSON or unexpected bodies yield `{}`, so callers fall back to their own message.
 */
export async function readApiMessage(response: Response): Promise<ApiMessage> {
  const body: unknown = await response.json().catch(() => null)
  return apiMessageSchema.parse(body)
}
