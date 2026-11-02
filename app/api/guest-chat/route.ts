import {
  createUIMessageStreamResponse,
  generateId,
  isStepCount,
  consumeStream,
  streamText,
  type ModelMessage,
  type SystemModelMessage,
  type ToolSet,
} from 'ai'
import { defaultProviderOptions, languageModel } from '@/lib/ai'
import { parseChatRequestPayload } from '@/app/api/chat/lib/request'
import { isRecord } from '@/app/api/chat/lib/tool-helpers'
import { uiMessagesToLegacyMessages } from '@/lib/ai-message-conversion'
import { buildSystemPrompt } from '@/app/api/chat/lib/prompt'
import { getModelConfig } from '@/lib/model-registry'
import { createVITTools } from '@/lib/tools'
import { saveTokenUsage } from '@/lib/db'
import { normalizeTokenUsage } from '@/lib/token-usage'
import { enforceUserRateLimit, UserRateLimitError } from '@/lib/user-rate-limiter'

const GUEST_MESSAGE_LIMIT = 2

/** Tools guests may not use. */
const GUEST_BLOCKED_TOOLS = new Set(['queryVTOP', 'saveMemory'])

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function POST(req: Request) {
  try {
    const rawPayload: unknown = await req.json().catch(() => null)
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
    const userMessageCount = legacyMessages.filter(m => {
      const metadata: unknown = m.metadata
      return m.role === 'user' && !(isRecord(metadata) && metadata.sharedHistory)
    }).length

    if (userMessageCount > GUEST_MESSAGE_LIMIT) {
      return jsonResponse(
        {
          error: 'GUEST_LIMIT',
          message: 'guest mode includes 2 free messages. sign in to keep chatting.',
        },
        403
      )
    }

    if (legacyMessages.length === 0) {
      return jsonResponse(
        {
          error: 'EMPTY',
          message: 'ask a question to start the guest chat.',
        },
        400
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

    const instructions: SystemModelMessage[] = [
      ...systemMessages,
      {
        role: 'system',
        content:
          'guest preview mode: keep answers concise, no personal data or memory, feedback/KB submissions allowed and attributed as guest.',
      },
    ]

    const messages: ModelMessage[] = []
    for (const m of legacyMessages) {
      const content = (m.content ?? '').trim()
      if (!content) continue
      // v7 rejects system messages inside `messages`; keep them as instructions.
      if (m.role === 'system') instructions.push({ role: 'system', content })
      else messages.push({ role: m.role, content })
    }

    const model = getModelConfig('chat')

    const tools: ToolSet = Object.fromEntries(
      Object.entries(
        createVITTools(guestUserId, { channel: 'guest', sessionUser: { isGuest: true } })
      ).filter(([name]) => !GUEST_BLOCKED_TOOLS.has(name))
    )

    let savedFinalStepUsage = false

    await enforceUserRateLimit(guestUserId)

    const result = streamText({
      model: languageModel('chat'),
      instructions,
      messages,
      tools,
      maxRetries: 0,
      maxOutputTokens: 800,
      stopWhen: isStepCount(5),
      providerOptions: {
        openai: { ...defaultProviderOptions.openai, store: false },
      },
      onError: ({ error }) => {
        console.error('Guest chat streaming error:', error)
      },
      onStepEnd: async ({ finishReason, usage, stepNumber }) => {
        try {
          const usageTotals = normalizeTokenUsage(usage)
          await saveTokenUsage({
            userId: guestUserId,
            chatId: guestChatId,
            model: model.modelId,
            stepIndex: stepNumber,
            inputTokens: usageTotals.inputTokens,
            outputTokens: usageTotals.outputTokens,
            totalTokens: usageTotals.totalTokens,
            meta: { finishReason, channel: 'guest' },
          })
          if (finishReason === 'stop') {
            savedFinalStepUsage = true
          }
        } catch (e) {
          console.warn('Failed to persist guest step usage:', e)
        }
      },
      onEnd: async ({ usage }) => {
        try {
          if (!savedFinalStepUsage) {
            const usageTotals = normalizeTokenUsage(usage)
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
    })

    const stream = result.toUIMessageStream({
      originalMessages: uiMessages,
      generateMessageId: generateId,
      onError: () => 'something went wrong',
    })

    return createUIMessageStreamResponse({
      headers: {
        'X-Guest-Mode': 'true',
        'X-Guest-Message-Limit': `${GUEST_MESSAGE_LIMIT}`,
        'X-Chat-Id': guestChatId,
      },
      stream,
      consumeSseStream: consumeStream,
    })
  } catch (error) {
    console.error('Guest chat error:', error)
    if (error instanceof UserRateLimitError) {
      return jsonResponse({ error: 'RATE_LIMIT_EXCEEDED', type: 'user_rate_limit' }, 429)
    }
    return jsonResponse(
      {
        error: (error instanceof Error && error.message) || 'unexpected error in guest chat',
      },
      500
    )
  }
}
