import type { UIMessageChunk } from 'ai'

export const getErrorText = (error: unknown): string => {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message
    if (typeof msg === 'string') return msg
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export const isFallbackErrorText = (errorText: string): boolean => {
  const msg = (errorText || '').toLowerCase()
  return (
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate-limit') ||
    msg.includes('too many requests') ||
    msg.includes('resource_exhausted') ||
    msg.includes('429') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('abort') ||
    msg.includes('all api keys failed') ||
    msg.includes('all_keys_rate_limited') ||
    msg.includes('all_keys_exhausted') ||
    msg.includes('no_valid_api_keys_available') ||
    msg.includes('maxretriesexceeded') ||
    msg.includes('max retries exceeded') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable') ||
    msg.includes('service unavailable') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('503') ||
    msg.includes('internal error') ||
    msg.includes('backend error') ||
    msg.includes('server error') ||
    msg.includes('model_overloaded')
  )
}

export const isContentChunk = (chunk: UIMessageChunk): boolean => {
  if (!chunk || typeof chunk !== 'object') return false
  if ('type' in chunk && typeof chunk.type === 'string' && chunk.type.startsWith('data-')) {
    return true
  }
  switch (chunk.type) {
    case 'text-delta':
    case 'reasoning-delta':
    case 'source-url':
    case 'source-document':
    case 'file':
    case 'tool-input-available':
    case 'tool-input-error':
    case 'tool-approval-request':
    case 'tool-output-available':
    case 'tool-output-error':
    case 'tool-output-denied':
    case 'tool-input-start':
    case 'tool-input-delta':
      return true
    default:
      return false
  }
}

const streamToAsyncIterable = async function* <T>(stream: ReadableStream<T>): AsyncIterable<T> {
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield value
    }
  } finally {
    reader.releaseLock()
  }
}

const chunkText = (text: string, chunkSize = 1000): string[] => {
  if (!text) return []
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize))
  }
  return chunks
}

const enqueueTextFallback = (
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  text: string,
  messageMetadata?: unknown
) => {
  const textId = Math.random().toString(36).slice(2)
  controller.enqueue({ type: 'start' })
  controller.enqueue({ type: 'start-step' })
  controller.enqueue({ type: 'text-start', id: textId })
  for (const chunk of chunkText(text)) {
    controller.enqueue({ type: 'text-delta', id: textId, delta: chunk })
  }
  controller.enqueue({ type: 'text-end', id: textId })
  controller.enqueue({ type: 'finish-step' })
  controller.enqueue(messageMetadata ? { type: 'finish', messageMetadata } : { type: 'finish' })
}

export const ensureUiStreamHasContent = (
  stream: ReadableStream<UIMessageChunk>,
  fallbackTextFactory: () => Promise<string>,
  getMessageMetadata?: () => unknown
): ReadableStream<UIMessageChunk> => {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      let hasContent = false
      let sawChunk = false
      let sawErrorChunk = false
      let errorChunk: UIMessageChunk | null = null
      const buffer: UIMessageChunk[] = []

      for await (const chunk of streamToAsyncIterable(stream)) {
        sawChunk = true
        if (chunk?.type === 'error' && !hasContent) {
          sawErrorChunk = true
          errorChunk = chunk
          break
        }

        if (!hasContent && isContentChunk(chunk)) {
          hasContent = true
          while (buffer.length > 0) {
            controller.enqueue(buffer.shift()!)
          }
        }

        if (!hasContent) {
          buffer.push(chunk)
          continue
        }

        controller.enqueue(chunk)
      }

      if (!hasContent) {
        let fallbackText = ''
        try {
          fallbackText = await fallbackTextFactory()
        } catch (error) {
          console.warn('[AI stream] fallback text generation failed', error)
        }

        if (fallbackText && fallbackText.trim().length > 0) {
          enqueueTextFallback(controller, fallbackText, getMessageMetadata?.())
        } else if (sawErrorChunk && errorChunk) {
          controller.enqueue(errorChunk)
        } else if (sawChunk) {
          while (buffer.length > 0) {
            controller.enqueue(buffer.shift()!)
          }
        } else {
          controller.enqueue({ type: 'error', errorText: 'something went wrong' })
        }
      }

      controller.close()
    },
  })
}

type FallbackStreamOptions = {
  getFallbackErrorText?: () => string | null
  shouldFallback?: (errorText: string) => boolean
  onPrimaryErrorChunk?: (chunk: UIMessageChunk, errorText: string) => void
  onPrimaryError?: (error: unknown, errorText: string) => void
}

export const createFallbackUIStream = (
  primaryStream: ReadableStream<UIMessageChunk>,
  fallbackFactory: () => Promise<ReadableStream<UIMessageChunk>>,
  options: FallbackStreamOptions = {}
): ReadableStream<UIMessageChunk> => {
  const shouldFallback = options.shouldFallback ?? isFallbackErrorText

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      let hasContent = false
      let fallbackTriggered = false
      let fallbackAttempted = false
      let receivedChunk = false
      let sawErrorChunk = false
      const buffer: UIMessageChunk[] = []

      const resolveFallbackErrorText = (chunk?: UIMessageChunk, error?: unknown): string => {
        const candidate = options.getFallbackErrorText?.()
        if (candidate) return candidate
        if (chunk?.type === 'error' && typeof chunk.errorText === 'string') {
          return chunk.errorText
        }
        if (error) return getErrorText(error)
        return ''
      }

      const flushBuffer = () => {
        while (buffer.length > 0) {
          controller.enqueue(buffer.shift()!)
        }
      }

      const attemptFallback = async () => {
        console.warn('[AI stream] Starting fallback stream')
        fallbackAttempted = true
        const fallbackStream = await fallbackFactory()
        for await (const chunk of streamToAsyncIterable(fallbackStream)) {
          controller.enqueue(chunk)
        }
      }

      try {
        for await (const chunk of streamToAsyncIterable(primaryStream)) {
          receivedChunk = true
          if (chunk?.type === 'error') {
            sawErrorChunk = true
            const errorText = resolveFallbackErrorText(chunk)
            options.onPrimaryErrorChunk?.(chunk, errorText)
          }
          if (
            chunk?.type === 'error' &&
            !hasContent &&
            shouldFallback(resolveFallbackErrorText(chunk))
          ) {
            fallbackTriggered = true
            try {
              await primaryStream.cancel()
            } catch {}
            break
          }

          if (!hasContent && isContentChunk(chunk)) {
            hasContent = true
            flushBuffer()
          }

          if (!hasContent && chunk?.type !== 'error') {
            buffer.push(chunk)
            continue
          }

          controller.enqueue(chunk)
        }

        if (fallbackTriggered) {
          await attemptFallback()
        } else if (!hasContent && !sawErrorChunk) {
          await attemptFallback()
        } else if (!hasContent) {
          flushBuffer()
        }
      } catch (error) {
        const errorText = resolveFallbackErrorText(undefined, error)
        options.onPrimaryError?.(error, errorText)
        if (!hasContent && shouldFallback(errorText) && !fallbackAttempted) {
          try {
            await attemptFallback()
          } catch (fallbackError) {
            controller.error(fallbackError)
            return
          }
        } else {
          controller.error(error)
          return
        }
      }

      controller.close()
    },
  })
}
