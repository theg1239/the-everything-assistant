import { generateId, stepCountIs } from 'ai'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { parseChatRequestPayload } from '@/app/api/chat/lib/request'
import { uiMessagesToLegacyMessages } from '@/lib/ai-message-conversion'
import { buildSystemPrompt } from '@/app/api/chat/lib/prompt'
import { getModelConfig } from '@/lib/model-registry'
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
    const providerClient = rateLimitedAI[model.provider as keyof typeof rateLimitedAI]

    if (!providerClient) {
      return new Response('Model provider unavailable', { status: 503 })
    }

    const tools = createVITTools(guestUserId, { channel: 'guest', sessionUser: { isGuest: true } })
    ;['queryVTOP', 'saveMemory'].forEach(key => {
      if (key in tools) {
        // @ts-expect-error dynamic delete for safety
        delete tools[key]
      }
    })

    let savedFinalStepUsage = false

    const streamResult = await providerClient.streamText(
      {
        model: await providerClient.model(model.modelId),
        messages: finalMessages,
        tools,
        maxRetries: 0,
        maxTokens: 800,
        temperature: 0.4,
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
                promptTokens: usageTotals.promptTokens,
                completionTokens: usageTotals.completionTokens,
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
                promptTokens: usageTotals.promptTokens,
                completionTokens: usageTotals.completionTokens,
                totalTokens: usageTotals.totalTokens,
                meta: { type: 'final', channel: 'guest' },
              })
            }
          } catch (e) {
            console.warn('Failed to persist guest final usage:', e)
          }
        },
      },
      guestUserId
    )

    return streamResult.toUIMessageStreamResponse({
      originalMessages: uiMessages,
      generateMessageId: generateId,
      headers: {
        'X-Guest-Mode': 'true',
        'X-Guest-Message-Limit': `${GUEST_MESSAGE_LIMIT}`,
        'X-Chat-Id': guestChatId,
      },
      onError: () => 'something went wrong',
    })
  } catch (error: any) {
    console.error('Guest chat error:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'unexpected error in guest chat' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
