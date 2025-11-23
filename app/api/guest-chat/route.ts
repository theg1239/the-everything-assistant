import { generateId } from 'ai'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { parseChatRequestPayload } from '@/app/api/chat/lib/request'
import { uiMessagesToLegacyMessages } from '@/lib/ai-message-conversion'
import { buildSystemPrompt } from '@/app/api/chat/lib/prompt'
import { getModelConfig } from '@/lib/model-registry'
import { createVITTools } from '@/lib/tools'

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
      role: 'system',
      content: 'guest preview mode: keep answers concise, no personal data or memory, feedback/KB submissions allowed and attributed as guest.',
    }

    const finalMessages = [
      ...systemMessages,
      guestContext,
      ...legacyMessages
        .filter(m => m.content && m.content.trim().length > 0)
        .map(m => ({ role: m.role, content: (m.content ?? '').trim() })),
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

    const streamResult = await providerClient.streamText(
      {
        model: await providerClient.model(model.modelId),
        messages: finalMessages,
        tools,
        maxTokens: 800,
        temperature: 0.4,
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
      onError: () => 'something went wrong while streaming your guest reply.',
    })
  } catch (error: any) {
    console.error('Guest chat error:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'unexpected error in guest chat' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
