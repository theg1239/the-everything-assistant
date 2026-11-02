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
import { checkBotId } from 'botid/server'
import { cookies } from 'next/headers'
import { defaultProviderOptions, languageModel } from '@/lib/ai'
import { parseChatRequestPayload } from '@/app/api/chat/lib/request'
import { toToolSet } from '@/app/api/chat/lib/tool-helpers'
import { uiMessagesToLegacyMessages } from '@/lib/ai-message-conversion'
import { buildSystemPrompt } from '@/app/api/chat/lib/prompt'
import { createBackgroundTasks } from '@/app/api/chat/lib/background'
import { getModelConfig } from '@/lib/model-registry'
import { createVITTools } from '@/lib/tools'
import { saveTokenUsage } from '@/lib/db'
import { normalizeTokenUsage } from '@/lib/token-usage'
import { enforceUserRateLimit, UserRateLimitError } from '@/lib/user-rate-limiter'
import { getRedis } from '@/lib/redis'
import {
  GUEST_MESSAGE_LIMIT,
  consumeGuestQuota,
  createGuestId,
  createMemoryGuestQuotaStore,
  createRedisGuestQuotaStore,
  detectHostingPlatform,
  getClientIp,
  loadGuestQuotaConfig,
  signGuestId,
  verifyGuestCookie,
  type GuestQuotaStore,
} from '@/lib/guest-quota'

/**
 * Tools guests may use: free, read-only lookups over static/public data. Everything
 * else is excluded: paid APIs (Parallel web search/extract, embeddings-backed
 * knowledgeBase, LLM-backed Reddit deep search and placement formatter), outbound
 * scraping (past papers), side effects (submitFeedback/contributeKnowledge open
 * GitHub issues, saveMemory) and personal data (queryVTOP).
 */
const GUEST_TOOLS: ReadonlySet<string> = new Set([
  'getMessMenu',
  'getCourseInfo',
  'resolveCourseCode',
  'getFacultyInfo',
  'getSyllabus',
  'getCampusInfo',
])

/** Only the most recent turns reach the model (bounds cost of long shared histories). */
const GUEST_MAX_HISTORY_MESSAGES = 12
const GUEST_MAX_MESSAGE_CHARS = 16_000

const GUEST_COOKIE = 'tea_guest'
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

const GENERIC_ERROR = 'something went wrong. please try again.'

const guestLimitResponse = () =>
  jsonResponse(
    {
      error: 'GUEST_LIMIT',
      message: 'guest mode includes 2 free messages. sign in to keep chatting.',
    },
    403
  )

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

let devQuotaStore: GuestQuotaStore | null = null

/** Redis in deployments; an in-memory store only in local development. */
function getGuestQuotaStore(): GuestQuotaStore | null {
  const redis = getRedis()
  if (redis) return createRedisGuestQuotaStore(redis)
  if (process.env.NODE_ENV === 'development') {
    devQuotaStore ??= createMemoryGuestQuotaStore()
    return devQuotaStore
  }
  return null
}

export async function POST(req: Request) {
  // Usage rows are written after the response (the SDK awaits onStepEnd/onEnd in-stream).
  const background = createBackgroundTasks()
  try {
    // Reading the body is local work; start it so it overlaps the BotID verification.
    const bodyPromise: Promise<unknown> = req.json().catch(() => null)
    if (process.env.DISABLE_BOTID !== 'true' && process.env.NODE_ENV !== 'development') {
      const verification = await checkBotId()
      if (verification.isBot) {
        return jsonResponse({ error: 'Access denied' }, 403)
      }
    }

    const secret = process.env.NEXTAUTH_SECRET
    const quotaStore = getGuestQuotaStore()
    if (!secret || !quotaStore) {
      console.error('Guest chat disabled: NEXTAUTH_SECRET or Upstash Redis is not configured')
      return jsonResponse({ error: 'UNAVAILABLE', message: 'guest mode is unavailable.' }, 503)
    }

    const rawPayload = await bodyPromise
    // Client `system` messages are already stripped by the parser.
    const payload = parseChatRequestPayload(rawPayload)

    if (!payload) {
      return new Response('Invalid request body', { status: 400 })
    }

    const guestChatId =
      typeof payload.id === 'string' && payload.id.trim().length > 0
        ? payload.id.trim().slice(0, 128)
        : generateId()

    const uiMessages = payload.messages ?? []
    const legacyMessages = uiMessagesToLegacyMessages(uiMessages)

    const messages: ModelMessage[] = []
    for (const m of legacyMessages.slice(-GUEST_MAX_HISTORY_MESSAGES)) {
      const content = (m.content ?? '').trim().slice(0, GUEST_MAX_MESSAGE_CHARS)
      if (!content || m.role === 'system') continue
      messages.push({ role: m.role, content })
    }

    if (messages.length === 0) {
      return jsonResponse(
        {
          error: 'EMPTY',
          message: 'ask a question to start the guest chat.',
        },
        400
      )
    }

    // Guest identity: the signed cookie, or a fresh one. The quota is counted on the
    // server per request; client history (and its `sharedHistory` tags) is ignored.
    const cookieStore = await cookies()
    let guestId = await verifyGuestCookie(cookieStore.get(GUEST_COOKIE)?.value, secret)
    if (!guestId) {
      guestId = createGuestId()
      cookieStore.set(GUEST_COOKIE, await signGuestId(guestId, secret), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: GUEST_COOKIE_MAX_AGE,
      })
    }
    const guestUserId = `guest:${guestId}`

    // Quota and per-guest rate limit are independent Redis round trips: run them together.
    // The quota still decides first (a guest over quota gets the quota response even if the
    // rate limit also failed); the only extra effect is that a quota-rejected request also
    // spends a rate-limit token from that guest's own bucket, which the quota (2/day) already
    // keeps far below the per-minute limit. Both must pass before the model starts.
    const rateLimitCheck = enforceUserRateLimit(guestUserId)
    // Handled where it is awaited; this only prevents an unhandled-rejection report meanwhile.
    rateLimitCheck.catch(() => undefined)
    const quota = await consumeGuestQuota(
      quotaStore,
      { guestId, ip: getClientIp(req.headers, detectHostingPlatform()) },
      loadGuestQuotaConfig()
    )
    if (!quota.allowed) {
      return guestLimitResponse()
    }

    await rateLimitCheck

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
          'guest preview mode: keep answers concise, no personal data or memory. web search, feedback and knowledge-base submissions are not available to guests; suggest signing in for those.',
      },
    ]

    const model = getModelConfig('chat')

    const allTools = toToolSet(
      createVITTools(guestUserId, { channel: 'guest', sessionUser: { isGuest: true } })
    )
    const tools: ToolSet = Object.fromEntries(
      Object.entries(allTools).filter(([name]) => GUEST_TOOLS.has(name))
    )

    // Resolves true once the `stop` step's usage row is written; the final-usage
    // fallback only writes when that didn't happen (same rule as before).
    let finalStepUsageSaved: Promise<boolean> = Promise.resolve(false)

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
      onStepEnd: ({ finishReason, usage, stepNumber }) => {
        const usageTotals = normalizeTokenUsage(usage)
        const saved = saveTokenUsage({
          userId: guestUserId,
          chatId: guestChatId,
          model: model.modelId,
          stepIndex: stepNumber,
          inputTokens: usageTotals.inputTokens,
          outputTokens: usageTotals.outputTokens,
          totalTokens: usageTotals.totalTokens,
          meta: { finishReason, channel: 'guest' },
        }).then(
          () => true,
          (e: unknown) => {
            console.warn('Failed to persist guest step usage:', e)
            return false
          }
        )
        background.track('save guest step usage', saved)
        if (finishReason === 'stop') {
          finalStepUsageSaved = saved
        }
      },
      onEnd: ({ usage }) => {
        const usageTotals = normalizeTokenUsage(usage)
        background.track(
          'save guest final usage',
          finalStepUsageSaved.then(async savedStopStep => {
            if (savedStopStep) return
            try {
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
            } catch (e) {
              console.warn('Failed to persist guest final usage:', e)
            }
          })
        )
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
    return jsonResponse({ error: GENERIC_ERROR }, 500)
  }
}
