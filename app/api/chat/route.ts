import {
  smoothStream,
  extractReasoningMiddleware,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  type UIMessageChunk,
} from 'ai'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { createVITTools } from '@/lib/tools'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getChat, createChat, saveMessage, updateChat } from '@/lib/db'
import { extractTitleFromContent } from '@/lib/utils'
import { sanitizeToolInvocations } from '@/lib/sanitize-tools'
import { normalizeTokenUsage } from '@/lib/token-usage'
import {
  uiMessagesToLegacyMessages,
  type AppUIMessage,
  type LegacyMessage,
} from '@/lib/ai-message-conversion'
import type { Attachment } from '@/types/attachment'
import { fetchMCPTools, closeMCPClients } from '@/lib/mcp-server'

import { createDirectToolCallStream } from './lib/messages'
import { parseChatRequestPayload } from './lib/request'
import { generateChatTitle } from './lib/chat-title'
import { parseVTOPData } from './lib/vtop-parser'
import {
  getToolInputPayload,
  getToolOutputPayload,
  inferLegacyToolState,
} from './lib/tool-helpers'
import { executeDirectToolCall } from './lib/direct-tool-call'
import { buildMemoryContext } from './lib/memory-context'
import { enhanceMessagesWithToolContext, prepareFinalMessages } from './lib/message-prep'
import { buildSystemPrompt } from './lib/prompt'

const getMessageText = (message: LegacyMessage | null | undefined): string =>
  message?.content ?? ''

const CLIENT_ERROR_MESSAGE = 'An error occurred.'

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

const truncateErrorText = (text: string, max = 500): string => {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
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
    msg.includes('abort') ||
    msg.includes('all api keys failed') ||
    msg.includes('all_keys_rate_limited') ||
    msg.includes('no_valid_api_keys_available') ||
    msg.includes('all_keys_exhausted') ||
    msg.includes('maxretriesexceeded') ||
    msg.includes('max retries exceeded')
  )
}

const isRetrySkippableErrorText = (errorText: string): boolean => {
  const msg = (errorText || '').toLowerCase()
  return (
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate-limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('429') ||
    msg.includes('timeout') ||
    msg.includes('timed out')
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

const createFallbackUIStream = (
  primaryStream: ReadableStream<UIMessageChunk>,
  fallbackFactory: () => Promise<ReadableStream<UIMessageChunk>>,
  getFallbackErrorText?: () => string | null
): ReadableStream<UIMessageChunk> => {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      let hasContent = false
      let fallbackTriggered = false
      const buffer: UIMessageChunk[] = []

      const resolveFallbackErrorText = (
        chunk?: UIMessageChunk,
        error?: unknown
      ): string => {
        const candidate = getFallbackErrorText?.()
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
        console.warn('[Chat] Starting fallback stream')
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
            isFallbackErrorText(resolveFallbackErrorText(chunk))
          ) {
            fallbackTriggered = true
            console.warn('[Chat] Fallback triggered by error chunk before content', {
              errorText: truncateErrorText(resolveFallbackErrorText(chunk)),
            })
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
        } else if (!hasContent) {
          flushBuffer()
        }
      } catch (error) {
        if (!hasContent && isFallbackErrorText(resolveFallbackErrorText(undefined, error))) {
          console.warn('[Chat] Fallback triggered by stream error before content', {
            errorText: truncateErrorText(resolveFallbackErrorText(undefined, error)),
          })
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

function extractAttachmentsFromParts(
  parts: LegacyMessage['parts'] | AppUIMessage['parts']
): Attachment[] {
  if (!Array.isArray(parts)) return []
  return (parts as unknown[])
    .filter((part): part is Record<string, unknown> => typeof part === 'object' && part !== null)
    .filter(part => part.type === 'file')
    .map(part => {
      const filePart = part as unknown as {
        url?: string
        name?: string
        mediaType?: string
      }
      if (!filePart.url || !filePart.mediaType) return null
      return {
        url: filePart.url,
        name: filePart.name,
        contentType: filePart.mediaType,
      } as Attachment
    })
    .filter((att): att is Attachment => Boolean(att))
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }
    const rawPayload = await req.json().catch(() => null)
    const payload = parseChatRequestPayload(rawPayload)
    if (!payload) {
      return new Response('Invalid request body', { status: 400 })
    }
    const { id: requestedChatId, directToolCall, preferredTool, thinkHarder } = payload
    const uiMessages: AppUIMessage[] = payload.messages ?? []
    const messages = uiMessagesToLegacyMessages(uiMessages)
    const metadataPreferredTool =
      uiMessages.length > 0
        ? ((uiMessages[uiMessages.length - 1]?.metadata || {}) as Record<string, any>)
            ?.preferredTool
        : undefined
    const effectivePreferredTool = preferredTool || metadataPreferredTool

    const normalizedChatId =
      typeof requestedChatId === 'string' && requestedChatId.trim().length > 0
        ? requestedChatId
        : generateId()

    let chat = normalizedChatId ? await getChat(normalizedChatId, session.user.id) : null
    const isExistingChat = !!chat
    if (!chat) {
      const initialContent = getMessageText(messages[0])
      const tempTitle = extractTitleFromContent(initialContent || 'New Chat')
      const path = `/chat/${normalizedChatId}`
      chat = await createChat(session.user.id, tempTitle, path, normalizedChatId)

      const userMessage = initialContent
      if (userMessage.trim()) {
        try {
          const properTitle = await generateChatTitle(userMessage, session.user.id)
          if (properTitle !== tempTitle) {
            await updateChat(chat!.id, properTitle)
            chat.title = properTitle
            console.debug('Chat title updated successfully')
          }
        } catch (error) {
          console.error('Failed to update chat title:', error)
        }
      }
    }

    let directToolCallResult: any = null
    let directToolCallExecuted = false

    if (directToolCall) {
      const { result, executed } = await executeDirectToolCall({
        directToolCall,
        messages,
        userId: session.user.id,
      })
      directToolCallResult = result
      directToolCallExecuted = executed
    }

    if (!process.env.GROQ_API_KEY) {
      return new Response(
        JSON.stringify({
          error: 'API key not configured. Please add GROQ_API_KEY to your environment variables.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const userMessage = messages.length > 0 ? messages[messages.length - 1] : null
    if (userMessage?.role === 'user') {
      const persistedContent = getMessageText(userMessage)
      const persistedAttachments = extractAttachmentsFromParts(userMessage.parts)
      await saveMessage(
        chat.id,
        'user',
        persistedContent,
        undefined,
        userMessage.id,
        persistedAttachments.length ? persistedAttachments : undefined
      )
    }

    const { context: memoryContext, isEnabled: isMemoryEnabled } =
      await buildMemoryContext(session.user.id)

    const baseTools = createVITTools(session.user.id, {
      sessionUser: { name: session.user.name, email: session.user.email },
      musicPlayerState: payload.musicPlayerState,
    })
    const prefersWebSearch = effectivePreferredTool === 'web-search'
    let tools: Record<string, any> = baseTools

    let mcpClients: any[] = []
    if (payload.mcpConfigs && payload.mcpConfigs.length > 0) {
      try {
        const mcpResult = await fetchMCPTools(payload.mcpConfigs)
        if (Object.keys(mcpResult.tools).length > 0) {
          tools = { ...tools, ...mcpResult.tools }
          mcpClients = mcpResult.clients
          console.log(`[MCP] Loaded ${Object.keys(mcpResult.tools).length} tools from ${mcpClients.length} MCP servers`)
        }
        if (mcpResult.errors.length > 0) {
          console.warn('[MCP] Some MCP servers failed to connect:', mcpResult.errors.map(e => `${e.config.name}: ${e.error}`))
        }
      } catch (error) {
        console.error('[MCP] Failed to fetch MCP tools:', error)
        // Continue without MCP tools - don't fail the request
      }
    }

    if (prefersWebSearch) {
      try {
        const googleSearchTool = rateLimitedAI.google.tools.google_search()
        if (googleSearchTool) {
          tools = {
            ...tools,
            google_search: googleSearchTool,
          }
        }
      } catch (error) {
        console.error('Failed to initialize Google Search tool:', error)
        tools = { ...tools }
      }
    }

    const { systemMessages, prefersWebSearch: finalPrefersWebSearch } = buildSystemPrompt({
      prefersWebSearch,
      effectivePreferredTool,
      memoryContext,
      isMemoryEnabled,
      sessionUser: { name: session.user.name, email: session.user.email },
      channel: 'web',
    })

    const enhancedMessages = enhanceMessagesWithToolContext(messages, directToolCallResult)

    if (directToolCallResult && directToolCallExecuted) {
      const directResultPayload = getToolOutputPayload(directToolCallResult)
      if (directResultPayload?.formatted_content) {
        const responseText =
          directResultPayload.formatted_content ||
          directResultPayload.summary ||
          `Here's your ${directToolCallResult.args?.command || 'data'} from VTOP.`

        const responseId = directToolCallResult.toolCallId || `direct-${Date.now()}`
        const { stream, safeInvocations } = createDirectToolCallStream(
          uiMessages,
          chat,
          {
            ...directToolCallResult,
            result: directResultPayload,
          },
          responseText
        )

        try {
        await saveMessage(
            chat.id,
            'assistant',
            responseText,
            safeInvocations,
            responseId
          )
            console.debug('Direct tool call message saved with tool invocation')
        } catch (error) {
          console.error('Failed to save direct tool call message:', error)
        }

      return createUIMessageStreamResponse({
        headers: {
          'X-Chat-Id': chat.id,
          'X-Chat-Path': chat.path,
          'X-Chat-Title': chat.title,
        },
        stream,
      })
    }
    }

    // Determine if user is admin for thinkHarder model selection
    const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
    const isAdmin = Boolean(adminEmail && session.user.email === adminEmail)

    const { finalMessages, model, attachmentAware } = await prepareFinalMessages(
      enhancedMessages,
      systemMessages,
      finalPrefersWebSearch,
      !isExistingChat,
      { thinkHarder: thinkHarder ?? false, isAdmin }
    )
    const openaiPromptCacheKey = `pc:v1:${chat.id.slice(0, 40)}`

    const hasConversationContent = finalMessages.some(msg => msg.role !== 'system')

    if (!hasConversationContent) {
      const fallbackText = "i'm on standby — ask a question or run a tool so i know what to do."
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`0:"${fallbackText.replace(/"/g, '\\"')}"\n`))
          controller.enqueue(
            encoder.encode(
              'e:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0},"isContinued":false}\n'
            )
          )
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Chat-Id': chat.id,
          'X-Chat-Path': `/chat/${chat.id}`,
          'X-Chat-Title': chat.title,
        },
      })
    }

    let savedFinalStepUsage = false

    const reasoningMiddleware = extractReasoningMiddleware({
      tagName: 'reasoning',
    })

    const hasMultipleGoogleKeys = (() => {
      const keys = new Set<string>()
      if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        keys.add(process.env.GOOGLE_GENERATIVE_AI_API_KEY)
      }
      for (let i = 2; i <= 10; i++) {
        const key = process.env[`GOOGLE_GENERATIVE_AI_API_KEY_${i}`]
        if (key) keys.add(key)
      }
      if (process.env.GOOGLE_AI_API_KEYS) {
        for (const key of process.env.GOOGLE_AI_API_KEYS.split(',').map(k => k.trim())) {
          if (key) keys.add(key)
        }
      }
      return keys.size > 1
    })()

    const hasOpenAIKeys = (() => {
      if (process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEYS) return true
      for (let i = 2; i <= 10; i++) {
        if (process.env[`OPENAI_API_KEY_${i}`]) return true
      }
      return false
    })()

    const canFallbackToOpenAI = model.provider === 'google' && hasOpenAIKeys
    const allowGoogleRetry = process.env.GOOGLE_RETRY_ENABLED === 'true'
    const canRetryGoogleKey =
      model.provider === 'google' && hasMultipleGoogleKeys && allowGoogleRetry
    let googleRetryAttempted = false
    const fallbackState = {
      hasContent: false,
      lastErrorText: '',
    }

    const markStreamContent = () => {
      if (!fallbackState.hasContent) fallbackState.hasContent = true
    }

    const supportsOpenAIPromptCacheRetention = (modelId: string) =>
      modelId.startsWith('gpt-5.1')

    const isOpenAIReasoningModel = (modelId: string) =>
      !(
        modelId.startsWith('gpt-5.1') ||
        modelId.startsWith('gpt-5') ||
        modelId.startsWith('gpt-5-mini') ||
        modelId.startsWith('gpt-5-chat')
      )

    const buildOpenAIProviderOptions = (modelId: string) => ({
      openai: {
        parallelToolCalls: true,
        store: false,
        maxToolCalls: 4,
        reasoningSummary: 'detailed',
        promptCacheKey: openaiPromptCacheKey,
        ...(supportsOpenAIPromptCacheRetention(modelId)
          ? { promptCacheRetention: '24h' }
          : {}),
      },
    })

    const providerClient = rateLimitedAI[model.provider as keyof typeof rateLimitedAI]
    if (!providerClient) {
      throw new Error(`Unsupported model provider: ${model.provider}`)
    }

    const resolvedModel = await providerClient.model(model.modelId)

    const providerOptions =
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
        : model.provider === 'openai'
          ? buildOpenAIProviderOptions(model.modelId)
          : undefined

    const persistStreamError = async (error: any) => {
      console.error('Streaming error occurred:', error)

      if (mcpClients.length > 0) {
        await closeMCPClients(mcpClients)
        console.log(`[MCP] Closed ${mcpClients.length} MCP client(s) after error`)
      }

      if (process.env.STREAM_ERRORS_TO_CHAT === 'true') {
        try {
          await saveMessage(
            chat.id,
            'assistant',
            CLIENT_ERROR_MESSAGE,
            [],
            `error-${Date.now()}`
          )
          console.debug('Streaming error saved to database')
        } catch (saveError) {
          console.error('Failed to save streaming error:', saveError)
        }
      }
    }

    const handlePrimaryStreamError = async (error: any) => {
      const errorText = getErrorText(error)
      fallbackState.lastErrorText = errorText
      clearNoChunkLog()
      const shouldFallback =
        (canRetryGoogleKey || canFallbackToOpenAI) &&
        !fallbackState.hasContent &&
        isFallbackErrorText(errorText)
      console.warn('[Chat] Primary stream error', {
        hasContent: fallbackState.hasContent,
        canRetryGoogleKey,
        canFallbackToOpenAI,
        shouldFallback,
        errorText: truncateErrorText(errorText),
      })
      if (shouldFallback) {
        console.warn('[Chat] Primary stream error before content; attempting fallback chain')
        return
      }
      await persistStreamError(error)
    }

    const handleRetryStreamError = async (error: any) => {
      const errorText = getErrorText(error)
      fallbackState.lastErrorText = errorText
      clearNoChunkLog()
      const shouldFallback =
        canFallbackToOpenAI && !fallbackState.hasContent && isFallbackErrorText(errorText)
      console.warn('[Chat] Google retry stream error', {
        hasContent: fallbackState.hasContent,
        canFallbackToOpenAI,
        shouldFallback,
        errorText: truncateErrorText(errorText),
      })
      if (shouldFallback) {
        console.warn('[Chat] Google retry error before content; attempting OpenAI fallback')
        return
      }
      await persistStreamError(error)
    }

    const handleFallbackStreamError = async (error: any) => {
      const errorText = getErrorText(error)
      fallbackState.lastErrorText = errorText
      clearNoChunkLog()
      console.warn('[Chat] OpenAI fallback stream error', {
        errorText: truncateErrorText(errorText),
      })
      await persistStreamError(error)
    }

    let activeStreamProvider = model.provider
    let activeStreamModelId = model.modelId
    const streamStartMs = Date.now()
    let chunkCount = 0
    let firstChunkAt: number | null = null
    let noChunkTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleNoChunkLog = () => {
      if (noChunkTimer) return
      noChunkTimer = setTimeout(() => {
        if (chunkCount === 0) {
          console.warn('[Chat] No chunks received after 15s', {
            provider: activeStreamProvider,
            modelId: activeStreamModelId,
            elapsedMs: Date.now() - streamStartMs,
          })
        }
      }, 15000)
    }

    const clearNoChunkLog = () => {
      if (noChunkTimer) {
        clearTimeout(noChunkTimer)
        noChunkTimer = null
      }
    }

    const handleStreamChunk = ({ chunk }: { chunk: { type?: string } }) => {
      chunkCount += 1
      if (firstChunkAt === null) {
        firstChunkAt = Date.now()
        clearNoChunkLog()
        console.warn('[Chat] First chunk received', {
          provider: activeStreamProvider,
          modelId: activeStreamModelId,
          chunkType: chunk?.type,
          elapsedMs: firstChunkAt - streamStartMs,
        })
      }
      if (chunk?.type === 'text-delta' || chunk?.type === 'reasoning-delta' || chunk?.type === 'source') {
        markStreamContent()
      }
    }

    const handleStepFinish = async ({
      text,
      toolCalls,
      toolResults,
      finishReason,
      usage,
      stepIndex,
      reasoning,
    }: any) => {
      try {
        if (usage && typeof usage === 'object') {
          const usageTotals = normalizeTokenUsage(usage)
          const { saveTokenUsage } = await import('@/lib/db')
          await saveTokenUsage({
            userId: session.user.id,
            chatId: chat.id,
            model: model.modelId,
            stepIndex: typeof stepIndex === 'number' ? stepIndex : null,
            promptTokens: usageTotals.promptTokens,
            completionTokens: usageTotals.completionTokens,
            totalTokens: usageTotals.totalTokens,
            meta: { finishReason },
          })
          if (finishReason === 'stop') {
            savedFinalStepUsage = true
          }
        }
      } catch (e) {
        console.warn('Failed to persist step usage:', e)
      }

      const knowledgeBaseCalls =
        toolCalls?.filter((tc: any) => tc.toolName === 'knowledgeBase') || []
    }

    const handleFinish = async (result: any, { reasoning }: any = {}) => {
      clearNoChunkLog()
      const allToolResults: any[] = []

      const finalToolResults = (result as any).toolResults ?? result.toolCalls ?? []
      allToolResults.push(...finalToolResults)

      if ((result as any).steps) {
        for (const step of (result as any).steps) {
          const stepToolResults = step.toolResults ?? step.toolCalls ?? []
          allToolResults.push(...stepToolResults)
        }
      }

      const uniqueToolResults = allToolResults.filter(
        (result, index, array) =>
          index === array.findIndex(r => r.toolCallId === result.toolCallId)
      )

      if (directToolCallResult) {
        const existingIndex = uniqueToolResults.findIndex(
          r => r.toolCallId === directToolCallResult.toolCallId
        )
        if (existingIndex === -1) {
          uniqueToolResults.push(directToolCallResult)
        } else {
          uniqueToolResults[existingIndex] = directToolCallResult
        }
      }

      for (const tr of uniqueToolResults) {
        const toolOutput = getToolOutputPayload(tr)
        if (
          tr.toolName === 'queryVTOP' &&
          toolOutput?.success &&
          toolOutput.data &&
          !toolOutput.parsedData
        ) {
          try {
            const userContext =
              messages && messages.length > 0
                ? messages
                    .filter((m: any) => m.role === 'user')
                    .slice(-3)
                    .map((m: any) => m.content)
                    .join(' | ')
                : ''
            const parsed = await parseVTOPData(
              toolOutput,
              getToolInputPayload(tr)?.command || 'data',
              userContext,
              session.user.id
            )
            Object.assign(toolOutput, {
              parsedData: parsed,
              formatted_content: (parsed as any).formatted_content,
              structured_data: (parsed as any).structured_data,
              summary: (parsed as any).summary,
            })
          } catch (e) {
            console.error('Failed to parse VTOP data in final result:', e)
          }
        }
      }

      const allInvocations = uniqueToolResults.map((tr: any) => {
        const toolOutput = getToolOutputPayload(tr)
        const toolArgs = getToolInputPayload(tr) || {}
        return {
          toolCallId: tr.toolCallId || `${tr.toolName}-${Date.now()}`,
          toolName: tr.toolName,
          args: toolArgs,
          result: toolOutput || null,
          state: inferLegacyToolState(tr, toolOutput),
        }
      })

      const safeInvocations = sanitizeToolInvocations(allInvocations)

      try {
        await saveMessage(
          chat.id,
          'assistant',
          result.text,
          safeInvocations,
          result.response.id
        )
        console.debug('Final message saved with tool invocations')
      } catch (error) {
        console.error('Failed to save final message:', error)
        try {
          await saveMessage(chat.id, 'assistant', result.text, [], result.response.id)
          console.debug('Final message saved without tool invocations (fallback)')
        } catch (fallbackError) {
          console.error(
            'Failed to save final message even without tool invocations:',
            fallbackError
          )
        }
      }

      try {
        const finalUsage = (result as any)?.usage
        if (!savedFinalStepUsage && finalUsage && typeof finalUsage === 'object') {
          const usageTotals = normalizeTokenUsage(finalUsage)
          const { saveTokenUsage } = await import('@/lib/db')
          await saveTokenUsage({
            userId: session.user.id,
            chatId: chat.id,
            model: model.modelId,
            stepIndex: null,
            promptTokens: usageTotals.promptTokens,
            completionTokens: usageTotals.completionTokens,
            totalTokens: usageTotals.totalTokens,
            meta: { type: 'final' },
          })
        }
      } catch (e) {
        console.warn('Failed to persist final usage:', e)
      }

      if (mcpClients.length > 0) {
        await closeMCPClients(mcpClients)
        console.log(`[MCP] Closed ${mcpClients.length} MCP client(s)`)
      }
    }

    const shouldIncludeTemperature = (provider: string, modelId: string) =>
      !(provider === 'openai' && isOpenAIReasoningModel(modelId))

    const baseStreamOptions = {
      messages: finalMessages,
      tools,
      maxRetries: 0,
      maxTokens: 40000,
      experimental_transform: smoothStream({ chunking: 'word' }),
      stopWhen: stepCountIs(10),
      onChunk: handleStreamChunk,
      onStepFinish: handleStepFinish,
      onFinish: handleFinish,
    }

    const baseStreamOptionsFor = (provider: string, modelId: string) => ({
      ...baseStreamOptions,
      ...(shouldIncludeTemperature(provider, modelId) ? { temperature: 0.3 } : {}),
    })

    const googleStreamTimeout = { chunkMs: 4000, totalMs: 12000 }

    const primaryStreamOptions = {
      ...baseStreamOptionsFor(model.provider, model.modelId),
      model: resolvedModel,
      ...(providerOptions ? { providerOptions } : {}),
      ...(model.provider === 'google' ? { timeout: googleStreamTimeout } : {}),
      middleware: model.provider === 'openai' ? [] : [reasoningMiddleware],
      onError: handlePrimaryStreamError,
    }

    let primaryKeyIndex: number | null = null
    activeStreamProvider = model.provider
    activeStreamModelId = model.modelId
    console.warn('[Chat] Starting primary stream', {
      provider: model.provider,
      modelId: model.modelId,
    })
    scheduleNoChunkLog()
    const resultStream = await providerClient.streamText(
      primaryStreamOptions,
      session.user.id,
      model.provider === 'google'
        ? {
            onKeySelected: idx => {
              primaryKeyIndex = idx
            },
          }
        : undefined
    )

    const uiStreamOnError = (error: unknown) => {
      const errorText = getErrorText(error)
      if (errorText) fallbackState.lastErrorText = errorText
      return CLIENT_ERROR_MESSAGE
    }

    const uiStreamOptions = {
      originalMessages: uiMessages,
      generateMessageId: generateId,
      messageMetadata: ({ part }: { part: { type: string } }) => {
        if (part.type === 'finish') {
          return {
            chatId: chat.id,
            chatPath: `/chat/${chat.id}`,
            chatTitle: chat.title,
          }
        }
      },
      onError: uiStreamOnError,
    }

    const primaryUIStream = resultStream.toUIMessageStream(uiStreamOptions)

    const openaiFallbackFactory = async () => {
      const fallbackModelId = process.env.OPENAI_FALLBACK_MODEL || 'gpt-5-mini'
      activeStreamProvider = 'openai'
      activeStreamModelId = fallbackModelId
      console.warn(`[Chat] Falling back to OpenAI model ${fallbackModelId}`)
      const fallbackProvider = rateLimitedAI.openai
      const fallbackModel = await fallbackProvider.model(fallbackModelId)
      const fallbackStreamOptions = {
        ...baseStreamOptionsFor('openai', fallbackModelId),
        model: fallbackModel,
        providerOptions: buildOpenAIProviderOptions(fallbackModelId),
        timeout: { chunkMs: 4000, totalMs: 12000 },
        middleware: [],
        onError: handleFallbackStreamError,
      }
      const fallbackResult = await fallbackProvider.streamText(
        fallbackStreamOptions,
        session.user.id
      )
      return fallbackResult.toUIMessageStream(uiStreamOptions)
    }

    const fallbackFactory = async () => {
      const skipGoogleRetry = isRetrySkippableErrorText(fallbackState.lastErrorText)
      if (!googleRetryAttempted && canRetryGoogleKey) {
        googleRetryAttempted = true
        if (skipGoogleRetry) {
          console.warn('[Chat] Skipping Google retry due to error type', {
            errorText: truncateErrorText(fallbackState.lastErrorText),
          })
        } else {
          activeStreamProvider = 'google'
          activeStreamModelId = model.modelId
          console.warn('[Chat] Retrying with alternate Google key', {
            primaryKeyIndex,
            excludeIndices:
              typeof primaryKeyIndex === 'number' ? [primaryKeyIndex] : undefined,
          })
          const retryStreamOptions = {
            ...baseStreamOptionsFor('google', model.modelId),
            model: resolvedModel,
            ...(providerOptions ? { providerOptions } : {}),
            timeout: googleStreamTimeout,
            middleware: [reasoningMiddleware],
            onError: handleRetryStreamError,
          }
          const retryResult = await rateLimitedAI.google.streamText(
            retryStreamOptions,
            session.user.id,
            {
              excludeIndices:
                typeof primaryKeyIndex === 'number' ? [primaryKeyIndex] : undefined,
            }
          )
          const retryUIStream = retryResult.toUIMessageStream(uiStreamOptions)
          if (canFallbackToOpenAI) {
            return createFallbackUIStream(
              retryUIStream,
              openaiFallbackFactory,
              () => fallbackState.lastErrorText
            )
          }
          return retryUIStream
        }
      }

      if (!canFallbackToOpenAI) {
        const fallbackError = new Error(
          fallbackState.lastErrorText ||
            'OpenAI fallback unavailable: missing OpenAI API keys.'
        )
        await persistStreamError(fallbackError)
        const errorText = uiStreamOnError(fallbackError)
        return new ReadableStream<UIMessageChunk>({
          start(controller) {
            console.warn('[Chat] OpenAI fallback unavailable', {
              errorText: truncateErrorText(errorText),
            })
            controller.enqueue({ type: 'error', errorText })
            controller.close()
          },
        })
      }
      return openaiFallbackFactory()
    }

    const stream =
      canRetryGoogleKey || canFallbackToOpenAI
        ? createFallbackUIStream(primaryUIStream, fallbackFactory, () => fallbackState.lastErrorText)
        : primaryUIStream

    return createUIMessageStreamResponse({
      headers: {
        'X-Chat-Id': chat.id,
        'X-Chat-Path': `/chat/${chat.id}`,
        'X-Chat-Title': chat.title,
      },
      stream,
    })
  } catch (error: any) {
    console.error('Chat API error:', error)

    if (error.message?.includes('User rate limit exceeded')) {
      return new Response(
        JSON.stringify({
          error: 'RATE_LIMIT_EXCEEDED',
          message: CLIENT_ERROR_MESSAGE,
          type: 'user_rate_limit',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (error.message?.toLowerCase().includes('rate limit')) {
      return new Response(
        JSON.stringify({
          error: 'RATE_LIMIT_EXCEEDED',
          message: CLIENT_ERROR_MESSAGE,
          type: 'model_rate_limit',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: CLIENT_ERROR_MESSAGE }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
