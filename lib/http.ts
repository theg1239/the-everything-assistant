import type * as z from 'zod'

/** Reads a JSON response body and validates it against `schema`. */
export async function readJson<S extends z.ZodType>(
  response: Response,
  schema: S
): Promise<z.infer<S>>
/**
 * @deprecated Unchecked: the body is trusted to be `T`. Pass a zod schema instead.
 */
export async function readJson<T>(response: Response): Promise<T>
export async function readJson(response: Response, schema?: z.ZodType): Promise<unknown> {
  const body: unknown = await response.json()
  return schema ? schema.parse(body) : body
}
