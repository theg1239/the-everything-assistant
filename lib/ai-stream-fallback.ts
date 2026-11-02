export const getErrorText = (error: unknown): string => {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = error.message
    if (typeof msg === 'string') return msg
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
