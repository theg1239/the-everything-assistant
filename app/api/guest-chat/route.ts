import { createUIMessageStreamResponse, generateId, stepCountIs, type UIMessageChunk } from 'ai'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { parseChatRequestPayload } from '@/app/api/chat/lib/request'
import { uiMessagesToLegacyMessages } from '@/lib/ai-message-conversion'
import { buildSystemPrompt } from '@/app/api/chat/lib/prompt'
import { getModelConfig } from '@/lib/model-registry'
import { createVITTools } from '@/lib/tools'
import { saveTokenUsage } from '@/lib/db'
import { normalizeTokenUsage } from '@/lib/token-usage'

const GUEST_MESSAGE_LIMIT = 2

const getErrorText = (error: unknown): string => {
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

const isFallbackErrorText = (errorText: string): boolean => {
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
    msg.includes('overloaded') ||
    msg.includes('unavailable') ||
    msg.includes('service unavailable') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('503') ||
    msg.includes('internal error') ||
    msg.includes('backend error') ||
    msg.includes('server error')
  )
}

const isContentChunk = (chunk: UIMessageChunk): boolean => {
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

const streamToAsyncIterable = async function* <T>(
  stream: ReadableStream<T>
): AsyncIterable<T> {
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
  text: string
) => {
  const textId = generateId()
  controller.enqueue({ type: 'start' })
  controller.enqueue({ type: 'start-step' })
  controller.enqueue({ type: 'text-start', id: textId })
  for (const chunk of chunkText(text)) {
    controller.enqueue({ type: 'text-delta', id: textId, delta: chunk })
  }
  controller.enqueue({ type: 'text-end', id: textId })
  controller.enqueue({ type: 'finish-step' })
  controller.enqueue({ type: 'finish' })
}

const ensureUiStreamHasContent = (
  stream: ReadableStream<UIMessageChunk>,
  fallbackTextFactory: () => Promise<string>
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
          console.warn('[Guest chat] fallback text generation failed', error)
        }

        if (fallbackText && fallbackText.trim().length > 0) {
          enqueueTextFallback(controller, fallbackText)
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

const createFallbackUIStream = (
  primaryStream: ReadableStream<UIMessageChunk>,
  fallbackFactory: () => Promise<ReadableStream<UIMessageChunk>>
): ReadableStream<UIMessageChunk> => {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      let hasContent = false
      let fallbackTriggered = false
      const buffer: UIMessageChunk[] = []

      const attemptFallback = async () => {
        console.warn('[Guest chat] Starting fallback stream')
        const fallbackStream = await fallbackFactory()
        for await (const chunk of streamToAsyncIterable(fallbackStream)) {
          controller.enqueue(chunk)
        }
      }

      try {
        for await (const chunk of streamToAsyncIterable(primaryStream)) {
          if (
            chunk?.type === 'error' &&
            !hasContent &&
            isFallbackErrorText(getErrorText(chunk.errorText))
          ) {
            fallbackTriggered = true
            break
          }

          if (!hasContent && isContentChunk(chunk)) {
            hasContent = true
            while (buffer.length > 0) {
              controller.enqueue(buffer.shift()!)
            }
          }

          if (!hasContent && chunk?.type !== 'error') {
            buffer.push(chunk)
            continue
          }

          controller.enqueue(chunk)
        }

        if (fallbackTriggered) {
          await attemptFallback()
        } else if (!hasContent) {
          while (buffer.length > 0) {
            controller.enqueue(buffer.shift()!)
          }
        }
      } catch (error) {
        if (!hasContent && isFallbackErrorText(getErrorText(error))) {
          await attemptFallback()
        } else {
          controller.error(error)
          return
        }
      }

      controller.close()
    },
  })
}

export async function POST(req: Request) {
  try {
    const rawPayload = await req.json().catch(() => null)
    const payload = parseChatRequestPayload(rawPayload)

    if (!payload) {
      return new Response('Invalid request body', { status: 400 })
    }

    const guestChatId =
      typeof payload.id === 'string' && payload.id.trim().length > 0
        ? payload.id.trim()
        : generateId()

    const guestUserId = `guest:${guestChatId}`

    const uiMessages = payload.messages ?? []
    const legacyMessages = uiMessagesToLegacyMessages(uiMessages)
    const userMessageCount = legacyMessages.filter(
      m => m.role === 'user' && !(m.metadata as any)?.sharedHistory
    ).length

    if (userMessageCount > GUEST_MESSAGE_LIMIT) {
      return new Response(
        JSON.stringify({
          error: 'GUEST_LIMIT',
          message: 'guest mode includes 2 free messages. sign in to keep chatting.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (legacyMessages.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'EMPTY',
          message: 'ask a question to start the guest chat.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { systemMessages } = buildSystemPrompt({
      prefersWebSearch: false,
      effectivePreferredTool: undefined,
      memoryContext: '',
      isMemoryEnabled: false,
      sessionUser: { isGuest: true },
      channel: 'guest',
    })

    const guestContext = {
      role: 'system' as const,
      content: 'guest preview mode: keep answers concise, no personal data or memory, feedback/KB submissions allowed and attributed as guest.',
    }

    const finalMessages = [
      ...systemMessages,
      guestContext,
      ...legacyMessages
        .filter(m => m.content && m.content.trim().length > 0)
        .map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: (m.content ?? '').trim() })),
    ]

    const model = getModelConfig('chat')
    const providerClient = rateLimitedAI[model.provider as keyof typeof rateLimitedAI]

    if (!providerClient) {
      return new Response('Model provider unavailable', { status: 503 })
    }

    const hasOpenAIKeys = (() => {
      if (process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEYS) return true
      for (let i = 2; i <= 10; i++) {
        if (process.env[`OPENAI_API_KEY_${i}`]) return true
      }
      return false
    })()

    const canFallbackToOpenAI = model.provider === 'google' && hasOpenAIKeys

    const tools = createVITTools(guestUserId, { channel: 'guest', sessionUser: { isGuest: true } })
    ;['queryVTOP', 'saveMemory'].forEach(key => {
      if (key in tools) {
        // @ts-expect-error dynamic delete for safety
        delete tools[key]
      }
    })

    let savedFinalStepUsage = false

    const baseStreamOptions = {
      messages: finalMessages,
      tools,
      maxRetries: 0,
      maxOutputTokens: 800,
      temperature: 0.4,
      stopWhen: stepCountIs(5),
      onError: async (error: any) => {
        console.error('Guest chat streaming error:', error)
      },
      onStepFinish: async ({
        text,
        toolCalls,
        toolResults,
        finishReason,
        usage,
        stepIndex,
      }: any) => {
        try {
          if (usage && typeof usage === 'object') {
            const usageTotals = normalizeTokenUsage(usage)
            await saveTokenUsage({
              userId: guestUserId,
              chatId: guestChatId,
              model: model.modelId,
              stepIndex: typeof stepIndex === 'number' ? stepIndex : null,
              inputTokens: usageTotals.inputTokens,
              outputTokens: usageTotals.outputTokens,
              totalTokens: usageTotals.totalTokens,
              meta: { finishReason, channel: 'guest' },
            })
            if (finishReason === 'stop') {
              savedFinalStepUsage = true
            }
          }
        } catch (e) {
          console.warn('Failed to persist guest step usage:', e)
        }
      },
      onFinish: async (result: any) => {
        try {
          const finalUsage = (result as any)?.usage
          if (!savedFinalStepUsage && finalUsage && typeof finalUsage === 'object') {
            const usageTotals = normalizeTokenUsage(finalUsage)
            await saveTokenUsage({
              userId: guestUserId,
              chatId: guestChatId,
              model: model.modelId,
              stepIndex: null,
              inputTokens: usageTotals.inputTokens,
              outputTokens: usageTotals.outputTokens,
              totalTokens: usageTotals.totalTokens,
              meta: { type: 'final', channel: 'guest' },
            })
          }
        } catch (e) {
          console.warn('Failed to persist guest final usage:', e)
        }
      },
    }

    const uiStreamOptions = {
      originalMessages: uiMessages,
      generateMessageId: generateId,
      onError: () => 'something went wrong',
    }

    const primaryStreamOptions = {
      ...baseStreamOptions,
      model: await providerClient.model(model.modelId),
      timeout: model.provider === 'google' ? { chunkMs: 4000, totalMs: 12000 } : undefined,
      providerOptions:
        model.provider === 'google'
          ? {
              google: {
                maxRetries: 0,
                thinkingConfig: {
                  thinkingBudget: 512,
                  includeThoughts: false,
                },
              },
            }
          : undefined,
    }

    const openaiFallbackFactory = async () => {
      const fallbackModelId = process.env.OPENAI_FALLBACK_MODEL || 'gpt-5-mini'
      const fallbackProvider = rateLimitedAI.openai
      const fallbackModel = await fallbackProvider.model(fallbackModelId)
      const fallbackStreamOptions = {
        ...baseStreamOptions,
        model: fallbackModel,
        timeout: { chunkMs: 4000, totalMs: 12000 },
      }
      const fallbackResult = await fallbackProvider.streamText(
        fallbackStreamOptions,
        guestUserId
      )
      const fallbackUiStream = fallbackResult.toUIMessageStream(uiStreamOptions)
      return ensureUiStreamHasContent(fallbackUiStream, async () => {
        const generated = await fallbackProvider.generateText(
          fallbackStreamOptions,
          guestUserId
        )
        return generated?.text ?? ''
      })
    }

    let primaryUIStream: ReadableStream<UIMessageChunk>
    try {
      const streamResult = await providerClient.streamText(
        primaryStreamOptions,
        guestUserId
      )
      primaryUIStream = streamResult.toUIMessageStream(uiStreamOptions)
    } catch (error) {
      if (canFallbackToOpenAI && isFallbackErrorText(getErrorText(error))) {
        primaryUIStream = await openaiFallbackFactory()
      } else {
        throw error
      }
    }

    const stream = canFallbackToOpenAI
      ? createFallbackUIStream(primaryUIStream, openaiFallbackFactory)
      : primaryUIStream

    return createUIMessageStreamResponse({
      headers: {
        'X-Guest-Mode': 'true',
        'X-Guest-Message-Limit': `${GUEST_MESSAGE_LIMIT}`,
        'X-Chat-Id': guestChatId,
      },
      stream,
    })
  } catch (error: any) {
    console.error('Guest chat error:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'unexpected error in guest chat' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
