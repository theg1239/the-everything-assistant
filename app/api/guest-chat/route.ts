import { createUIMessageStreamResponse, generateId, stepCountIs, consumeStream } from 'ai'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import {
  createFallbackUIStream,
  ensureUiStreamHasContent,
  getErrorText,
  isFallbackErrorText,
} from '@/lib/ai-stream-fallback'
import { parseChatRequestPayload } from '@/app/api/chat/lib/request'
import { uiMessagesToLegacyMessages } from '@/lib/ai-message-conversion'
import { buildSystemPrompt } from '@/app/api/chat/lib/prompt'
import { getModelConfig } from '@/lib/model-registry'
import type { ModelProvider } from '@/lib/model-registry'
import { createVITTools } from '@/lib/tools'
import { saveTokenUsage } from '@/lib/db'
import { normalizeTokenUsage } from '@/lib/token-usage'

const GUEST_MESSAGE_LIMIT = 2

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
    const parseDirectModelId = (modelId: string) => {
      const [provider, ...rest] = modelId.split('/')
      return rest.length > 0
        ? { provider, modelId: rest.join('/') }
        : { provider: undefined, modelId }
    }
    const directModel =
      model.provider === 'direct' ? parseDirectModelId(model.modelId) : null
    const effectiveProvider = directModel?.provider ?? model.provider
    const providerClient = rateLimitedAI[model.provider as keyof typeof rateLimitedAI]

    if (!providerClient) {
      return new Response('Model provider unavailable', { status: 503 })
    }

    const allowProviderFallback = model.provider === 'google'
    const allowedProviders: ModelProvider[] = allowProviderFallback
      ? ['google', 'openai']
      : [model.provider]
    const preferredProviders: ModelProvider[] = allowProviderFallback
      ? ['google', 'openai']
      : [model.provider]

    const tools = createVITTools(guestUserId, { channel: 'guest', sessionUser: { isGuest: true } })
    ;['queryVTOP', 'saveMemory'].forEach(key => {
      if (key in tools) {
        // @ts-expect-error dynamic delete for safety
        delete tools[key]
      }
    })

    let savedFinalStepUsage = false

    let lastErrorText = ''

    const handleStreamError = async (error: any) => {
      const errorText = getErrorText(error)
      if (errorText) lastErrorText = errorText
      console.error('Guest chat streaming error:', error)
    }

    const providerOptions =
      effectiveProvider === 'google'
        ? {
            google: {
              maxRetries: 0,
              thinkingConfig: {
                thinkingBudget: 512,
                includeThoughts: false,
              },
            },
          }
        : undefined

    const baseStreamOptions = {
      messages: finalMessages,
      tools,
      maxRetries: 0,
      maxOutputTokens: 800,
      stopWhen: stepCountIs(5),
      onError: handleStreamError,
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

    const providerOverrides: Record<string, Partial<any>> = {
      google: { temperature: 0.4 },
      openai: {},
    }

    const streamOptions = {
      ...baseStreamOptions,
      model: { modelId: model.modelId },
      timeout: effectiveProvider === 'google' ? { chunkMs: 4000, totalMs: 12000 } : undefined,
      ...(providerOptions ? { providerOptions } : {}),
      providerOverrides,
    }

    let activeKeyIndex: number | null = null
    const handleKeySelected = (idx: number) => {
      activeKeyIndex = idx
    }

    const startStream = async () => {
      const streamResult = await providerClient.streamText(
        streamOptions,
        guestUserId,
        {
          allowedProviders,
          preferredProviders,
          onKeySelected: handleKeySelected,
        }
      )
      return streamResult.toUIMessageStream(uiStreamOptions)
    }

    const banActiveKey = async () => {
      if (activeKeyIndex === null) return
      const idx = activeKeyIndex
      activeKeyIndex = null
      try {
        await providerClient.banKeyByIndex(idx)
      } catch (error) {
        console.warn('[Guest chat] Failed to ban key after error', error)
      }
    }

    const fallbackFactory = async () => {
      await banActiveKey()
      const fallbackUiStream = await startStream()
      return ensureUiStreamHasContent(fallbackUiStream, async () => {
        const generated = await providerClient.generateText(
          {
            messages: finalMessages,
            tools,
            maxRetries: 0,
            maxOutputTokens: 800,
            model: { modelId: model.modelId },
            ...(providerOptions ? { providerOptions } : {}),
            providerOverrides,
          },
          guestUserId
        )
        return generated?.text ?? ''
      })
    }

    const primaryUIStream = await startStream()

    const stream = allowProviderFallback
      ? createFallbackUIStream(primaryUIStream, fallbackFactory, {
          getFallbackErrorText: () => lastErrorText,
          shouldFallback: isFallbackErrorText,
          onPrimaryErrorChunk: async (_chunk, errorText) => {
            if (errorText) lastErrorText = errorText
            await banActiveKey()
          },
          onPrimaryError: async (_error, errorText) => {
            if (errorText) lastErrorText = errorText
            await banActiveKey()
          },
        })
      : primaryUIStream

    return createUIMessageStreamResponse({
      headers: {
        'X-Guest-Mode': 'true',
        'X-Guest-Message-Limit': `${GUEST_MESSAGE_LIMIT}`,
        'X-Chat-Id': guestChatId,
      },
      stream,
      consumeSseStream: consumeStream,
    })
  } catch (error: any) {
    console.error('Guest chat error:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'unexpected error in guest chat' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
