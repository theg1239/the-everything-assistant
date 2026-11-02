import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import * as z from 'zod'
import { generateId, type ModelMessage, type SystemModelMessage, type UIMessage } from 'ai'
import type { Prisma } from '@/prisma/generated/client'
import { getModelConfig } from '@/lib/model-registry'
import { normalizeTokenUsage } from '@/lib/token-usage'
import { enforceUserRateLimit, UserRateLimitError } from '@/lib/user-rate-limiter'
import { providerRateLimitOf, retryAfterResetTime } from '@/lib/chat-errors'
import { isJsonObject } from '@/lib/json'
import { toToolSet } from '@/app/api/chat/lib/tool-helpers'
import { createBackgroundTasks } from '@/app/api/chat/lib/background'

type ConversationMessage = {
  role: string
  content: string
  id?: string
}

const historyMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
  timestamp: z.union([z.string(), z.number()]).optional(),
})

const botRequestSchema = z.object({
  source: z.enum(['whatsapp', 'discord']).optional(),
  message: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
        id: z.string().optional(),
      })
    )
    .optional(),
  userContext: z
    .object({
      username: z.string().optional(),
      userName: z.string().optional(),
      phoneNumber: z.string().optional(),
    })
    .optional(),
  userId: z.string().optional(),
  conversationHistory: z.array(historyMessageSchema).optional(),
})

/** The object form of a Prisma JSON column value (`{}` for anything else). */
const asJsonObject = (value: Prisma.JsonValue | undefined): Prisma.JsonObject =>
  isJsonObject(value) ? value : {}

function validateAPIKey(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.WHATSAPP_BOT_API_KEY

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.slice(7)
  return token === apiKey
}

function timingSafeEqual(a: string, b: string): boolean {
  try {
    return (
      Buffer.from(a).length === Buffer.from(b).length &&
      crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
    )
  } catch {
    return false
  }
}

function validateSignature(rawBody: string, request: NextRequest): boolean {
  const secret = process.env.WHATSAPP_BOT_SIGNING_SECRET || process.env.WA_SIGNING_SECRET
  if (!secret) return true // signature enforcement disabled

  const ts = request.headers.get('x-wa-timestamp')
  const sig = request.headers.get('x-wa-signature')
  const phone = request.headers.get('x-wa-phone')
  if (!ts || !sig || !phone) return false

  const now = Date.now()
  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > 5 * 60 * 1000) return false // 5 min window

  const expected = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')
  return timingSafeEqual(expected, sig)
}

async function getOrCreateBotUser(source: string, userId: string, userName?: string) {
  const emailPrefix = source === 'whatsapp' ? 'whatsapp' : 'discord'
  const email = `${emailPrefix}-${userId}@${source}-bot.local`

  let user =
    source === 'whatsapp'
      ? await prisma.user.findUnique({
          where: { email },
        })
      : null

  if (!user) {
    user = await prisma.user.findFirst({
      where: {
        preferences: {
          path: [source, source === 'whatsapp' ? 'phoneNumber' : 'userId'],
          equals: userId,
        },
      },
    })
  }

  if (!user) {
    const name =
      userName || `${source.charAt(0).toUpperCase() + source.slice(1)} User ${userId.slice(-4)}`

    const preferences: Prisma.InputJsonObject = {
      [source]: {
        ...(source === 'whatsapp' ? { phoneNumber: userId } : { userId }),
        joinedAt: new Date().toISOString(),
        [`is${source.charAt(0).toUpperCase() + source.slice(1)}User`]: true,
      },
    }

    user = await prisma.user.create({
      data: {
        email,
        name,
        preferences,
      },
    })

    console.log(`Created new ${source} user: ${name} (${userId})`)
  } else if (source === 'whatsapp') {
    const prefs = asJsonObject(user.preferences)
    const whatsappPrefs = asJsonObject(prefs.whatsapp)
    if (whatsappPrefs.phoneNumber !== userId) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          preferences: {
            ...prefs,
            whatsapp: {
              ...whatsappPrefs,
              phoneNumber: userId,
              isWhatsappUser: true,
            },
          },
        },
      })
    }
  }

  return user
}

export async function POST(request: NextRequest) {
  // Usage rows are written after the response (the SDK awaits onStepEnd in-stream).
  const background = createBackgroundTasks()
  try {
    const rawBody = await request.text()

    if (!validateAPIKey(request) || !validateSignature(rawBody, request)) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const parsed = ((): unknown => {
      try {
        return JSON.parse(rawBody || '{}')
      } catch {
        return null
      }
    })()

    const parsedBody = botRequestSchema.safeParse(parsed)
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400 })
    }
    const { messages, message, source, userContext, userId, conversationHistory } = parsedBody.data

    let processedMessages: ConversationMessage[] = []
    let userMessage: string = ''
    let requestSource = source || 'whatsapp'
    let userInfo: { userId?: string; userName?: string } = {}

    if (message && typeof message === 'string') {
      userMessage = message
      requestSource = source || 'discord'
      userInfo = { userId, userName: userContext?.username || userContext?.userName }

      if (conversationHistory && Array.isArray(conversationHistory)) {
        processedMessages = conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          id: `${requestSource}-history-${msg.timestamp}-${Math.random().toString(36).substr(2, 6)}`,
        }))
      }

      processedMessages.push({
        role: 'user',
        content: userMessage,
        id: `${requestSource}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      })
    } else if (messages && Array.isArray(messages) && messages.length > 0) {
      processedMessages = messages
      const lastMessage = messages[messages.length - 1]

      if (!lastMessage || lastMessage.role !== 'user') {
        return NextResponse.json({ error: 'Last message must be from user' }, { status: 400 })
      }

      userMessage = lastMessage.content
      requestSource = source || 'whatsapp'

      if (requestSource === 'whatsapp' && userContext?.phoneNumber) {
        userInfo = { userId: userContext.phoneNumber, userName: userContext.userName }
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid request format: message or messages array required' },
        { status: 400 }
      )
    }

    const missingPhone = requestSource === 'whatsapp' && !userContext?.phoneNumber
    if (!userInfo.userId || missingPhone) {
      return NextResponse.json({ error: 'userId/phoneNumber is required' }, { status: 400 })
    }

    const resolvedUserId = userInfo.userId

    // The lazily-imported modules don't depend on the user: load them during the user lookup.
    const modulesPromise = Promise.all([
      import('@/lib/ai'),
      import('@/lib/tools'),
      import('@/lib/mcp-tokens'),
      import('@/lib/prompts'),
      import('@/lib/memory/memory-service'),
      import('ai'),
      import('@/lib/db'),
    ])
    // Awaited below; this only avoids an unhandled rejection if the user lookup throws first.
    modulesPromise.catch(() => undefined)

    const user = await getOrCreateBotUser(requestSource, resolvedUserId, userInfo.userName)

    const isCommand =
      typeof userMessage === 'string' && userMessage.trim().length > 0
        ? /^[/.#!]/.test(userMessage.trim())
        : false

    const rateLimitKey =
      requestSource === 'whatsapp'
        ? isCommand && userInfo.userId
          ? `wa-bot:cmd:${userInfo.userId}`
          : undefined // normal messages shouldn't burn command rate limits
        : user.id

    // One Redis round trip, run alongside the memory / MCP-token reads below; it is awaited
    // (and rejects the request) before the model is called.
    const rateLimitCheck = enforceUserRateLimit(rateLimitKey)
    rateLimitCheck.catch(() => undefined)

    const [
      { defaultProviderOptions, languageModel },
      { createVITTools },
      { getUserMcpToken, refreshUserMcpToken, isExpired },
      { VIT_SYSTEM_PROMPT },
      { memoryService },
      { isStepCount, streamText },
      { saveTokenUsage },
    ] = await modulesPromise

    const rawMcpBase = process.env.VTOP_MCP_URL || process.env.VTOP_PROXY_URL
    const vtopMcpEndpoint = rawMcpBase
      ? `${rawMcpBase.replace(/\/$/, '').replace(/\/mcp$/, '')}/mcp`
      : undefined

    // Memory (settings + list, read together) and the MCP token are independent lookups.
    const loadMemoryContext = async (): Promise<string> => {
      const [isMemoryEnabled, memories] = await Promise.all([
        memoryService.isMemoryEnabled(user.id),
        memoryService.getMemoriesForPrompt(user.id, 50).catch((error: unknown) => {
          console.error(`Failed to load memories for ${requestSource} user:`, error)
          return []
        }),
      ])
      if (!isMemoryEnabled || memories.length === 0) return ''
      return `
<memories>
  <context>Saved information from previous ${requestSource} conversations:</context>
  <memory_list>
${memories
  .map(
    m =>
      `    <memory>
      <content>${m.content}</content>
      <last_updated>${new Date(m.updatedAt).toLocaleDateString()}</last_updated>
    </memory>`
  )
  .join('\n')}
  </memory_list>
</memories>`
    }
    const loadMcpToken = async () => {
      const token = await getUserMcpToken(user.id)
      // The bundle was just read: hand it over instead of having the refresh re-read it.
      return token && isExpired(token) ? refreshUserMcpToken(user.id, undefined, token) : token
    }
    const [memoryContext, mcpToken] = await Promise.all([
      loadMemoryContext(),
      loadMcpToken(),
      rateLimitCheck,
    ])

    const allowFallback = process.env.ALLOW_MCP_FALLBACK_TOKEN === 'true'
    const fallbackToken = allowFallback
      ? process.env.WHATSAPP_VTOP_MCP_ACCESS_TOKEN || process.env.VTOP_MCP_ACCESS_TOKEN
      : undefined

    const tools = toToolSet(
      createVITTools(user.id, {
        channel: requestSource,
        mcp:
          requestSource === 'whatsapp'
            ? {
                endpoint: vtopMcpEndpoint,
                accessToken: mcpToken?.accessToken || fallbackToken,
                clientName: 'whatsapp-bot-client',
              }
            : undefined,
      })
    )

    if (requestSource === 'whatsapp' && process.env.CHAT_DEBUG === 'true') {
      console.log('WA MCP debug', {
        userId: user.id,
        phone: userInfo.userId,
        endpoint: vtopMcpEndpoint,
        hasToken: Boolean(mcpToken?.accessToken),
        usedFallback: !mcpToken?.accessToken && Boolean(fallbackToken),
        expiresAt: mcpToken?.expiresAt,
      })
    }

    const contextPrompt =
      requestSource === 'whatsapp'
        ? `<whatsapp_context>
This conversation is happening via WhatsApp. The user is messaging through WhatsApp Web.
- Keep responses concise and mobile-friendly
- Use emojis appropriately for WhatsApp
- Break long responses into shorter messages
- Be conversational and helpful
- User: ${userInfo.userName || 'WhatsApp User'} (${userInfo.userId})
</whatsapp_context>`
        : `<discord_context>
This conversation is happening via Discord. The user is using slash commands.
- keep responses concise and lowercase (except proper nouns and course codes)
- no emojis
- be conversational and helpful
- user: ${userInfo.userName || 'Discord User'} (${userInfo.userId})
</discord_context>`

    const systemPrompt = `${VIT_SYSTEM_PROMPT}

${contextPrompt}

${memoryContext ? `\n\n<memory_context>\n  <instructions>Use the following information to provide more personalized and relevant responses.</instructions>\n  ${memoryContext}\n</memory_context>` : ''}

WHATSAPP RESPONSE REQUIREMENTS:
- When source is WhatsApp, respond in plain text only. Do NOT use markdown, bullets, or code fences. Keep replies short and mobile-friendly. Avoid links unless the user explicitly asks.
- When source is Discord, keep responses concise and helpful; minimal formatting is fine but avoid heavy markdown.

CRITICAL TOOL CONTINUATION RULES:
- YOU MUST NEVER STOP AFTER CALLING A TOOL
- Tool calls are ONLY information gathering steps, NOT final responses
- After ANY tool call, you MUST immediately continue with a natural response
- When you call a tool, that's step 1 - step 2 is ALWAYS providing your answer using that information
- The conversation flow is: [user question] → [tool call] → [YOUR RESPONSE USING TOOL RESULTS]`

    // v7 rejects system messages inside `messages`, so they go to `instructions`.
    const instructions: SystemModelMessage[] = [{ role: 'system', content: systemPrompt }]
    const messagesForAI: ModelMessage[] = []
    for (const m of processedMessages) {
      if (m.role === 'system') instructions.push({ role: 'system', content: m.content })
      else if (m.role === 'assistant') messagesForAI.push({ role: 'assistant', content: m.content })
      else messagesForAI.push({ role: 'user', content: m.content })
    }

    const botModel = getModelConfig('whatsappBot')


    const resultStream = streamText({
      model: languageModel('whatsappBot'),
      providerOptions: defaultProviderOptions,
      instructions,
      messages: messagesForAI,
      tools,
      maxOutputTokens: requestSource === 'whatsapp' ? 2048 : 4096,
      stopWhen: isStepCount(5),
      // The SDK awaits onStepEnd before continuing; write the usage row after the response.
      onStepEnd: ({ usage, stepNumber }) => {
        const usageTotals = normalizeTokenUsage(usage)
        background.track(
          `save ${requestSource} usage`,
          saveTokenUsage({
            userId: user.id,
            chatId: null, // No specific chat for bot users
            model: botModel.modelId,
            stepIndex: stepNumber,
            inputTokens: usageTotals.inputTokens,
            outputTokens: usageTotals.outputTokens,
            totalTokens: usageTotals.totalTokens,
            meta: { source: requestSource, userId: userInfo.userId },
          }).catch((e: unknown) => {
            console.warn(`Failed to persist ${requestSource} usage:`, e)
          })
        )
      },
    })

    const forceTextStream =
      request.headers.get('x-text-stream') === '1' ||
      request.nextUrl.searchParams.get('textStream') === '1'

    const wantUIStream =
      (!forceTextStream &&
        (request.headers.get('x-waba-ui-stream') === '1' ||
          request.nextUrl.searchParams.get('uiStream') === '1')) ||
      (!forceTextStream && requestSource) // default to UI stream for bot clients unless explicitly forced to text

    const uiMessagesForStream: UIMessage[] = processedMessages.map(msg => ({
      id: msg.id || generateId(),
      role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user',
      parts: [
        {
          type: 'text',
          text: msg.content ?? '',
        },
      ],
    }))

    if (wantUIStream) {
      return resultStream.toUIMessageStreamResponse({
        originalMessages: uiMessagesForStream,
        generateMessageId: generateId,
        headers: {
          'X-Source': requestSource,
          'X-User-Id': user.id,
          'X-Bot-User-Id': userInfo.userId ?? '',
        },
        onError: () => 'An error occurred while processing your request.',
      })
    }

    return resultStream.toTextStreamResponse({
      headers: {
        'X-Source': requestSource,
        'X-User-Id': user.id,
        'X-Bot-User-Id': userInfo.userId ?? '',
      },
    })
  } catch (error) {
    console.error('Bot API error:', error)

    if (error instanceof UserRateLimitError) {
      return NextResponse.json(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          type: 'user_rate_limit',
          ...(error.resetTime ? { resetTime: error.resetTime } : {}),
        },
        { status: 429 }
      )
    }

    const providerRateLimit = providerRateLimitOf(error)
    if (providerRateLimit) {
      const resetTime = retryAfterResetTime(providerRateLimit)
      return NextResponse.json(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'The model is currently overloaded. Please try again later.',
          type: 'model_rate_limit',
          ...(resetTime ? { resetTime } : {}),
        },
        { status: 429 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : ''

    return NextResponse.json(
      { error: errorMessage || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!validateAPIKey(request)) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    return NextResponse.json({
      status: 'ok',
      service: 'bot-api',
      supports: ['whatsapp', 'discord'],
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    })
  } catch (error) {
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}
