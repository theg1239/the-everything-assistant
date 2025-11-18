export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}
