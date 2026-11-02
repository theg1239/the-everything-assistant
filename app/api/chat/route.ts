import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  isStepCount,
  consumeStream,
  streamText,
  type InferUIMessageChunk,
  type ModelMessage,
  type StepResult,
  type StreamTextEndEvent,
  type ToolSet,
  type TypedToolResult,
} from 'ai'
import type { OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai'
import { defaultProviderOptions, openai } from '@/lib/ai'
import { getErrorText } from '@/lib/ai-stream-fallback'
import { createVITTools } from '@/lib/tools'
import { auth } from '@/lib/auth'
import {
  getChat,
  createChat,
  saveMessage,
  saveTokenUsage,
  updateChat,
  updateMessageToolInvocations,
} from '@/lib/db'
import { extractTitleFromContent } from '@/lib/utils'
import { sanitizeToolInvocations } from '@/lib/sanitize-tools'
import { normalizeTokenUsage } from '@/lib/token-usage'
import { enforceUserRateLimit, UserRateLimitError } from '@/lib/user-rate-limiter'
import {
  uiMessagesToLegacyMessages,
  type AppUIMessage,
  type LegacyMessage,
} from '@/lib/ai-message-conversion'
import type { Attachment } from '@/types/attachment'
import { fetchMCPTools, closeMCPClients } from '@/lib/mcp-server'
import type { MCPClientConfig } from '@/lib/mcp-config'
import {
  invalidateChatgptStatus,
  isChatgptConnectedCached,
  isCodexConfigured,
  runChatgptManagedTurn,
  type CodexToolEvent,
  type RunChatgptTurnResult,
} from '@/lib/codex/app-server'

import { createDirectToolCallStream } from './lib/messages'
import { parseChatRequestPayload } from './lib/request'
import { generateChatTitle } from './lib/chat-title'
import { getGroupConfig, preferredToolToGroupId } from '@/lib/search/group-config'
import { loadConfiguredTools } from '@/lib/search/tool-loader'
import { parseVTOPData } from './lib/vtop-parser'
import {
  getToolInputPayload,
  getToolOutput,
  getToolOutputPayload,
  inferLegacyToolState,
  isRecord,
  readString,
  toToolSet,
} from './lib/tool-helpers'
import {
  executeDirectToolCall,
  recentUserContext,
  type DirectToolCallResult,
} from './lib/direct-tool-call'
import { buildMemoryContext } from './lib/memory-context'
import { enhanceMessagesWithToolContext, prepareFinalMessages } from './lib/message-prep'
import { buildSystemPrompt } from './lib/prompt'
import { createBackgroundTasks, type BackgroundTasks } from './lib/background'

const getMessageText = (message: LegacyMessage | null | undefined): string => message?.content ?? ''

const CLIENT_ERROR_MESSAGE = 'An error occurred.'

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const buildCodexPromptFromMessages = (messages: ModelMessage[]): string => {
  const conversation = messages
    .filter(message => message.role !== 'system')
    .map(message => ({ role: message.role, content: message.content }))
  const serialized = JSON.stringify(conversation)

  return [
    'Use the conversation payload below as the canonical chat history.',
    'Answer as the assistant to the latest user message.',
    serialized,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Reads `record.providerMetadata.attachmentName` / `record.providerOptions.attachmentName`. */
const readAttachmentName = (record: Record<string, unknown>, key: string) => {
  const container = record[key]
  return isRecord(container) ? readString(container, 'attachmentName') : undefined
}

function extractAttachmentsFromParts(parts: LegacyMessage['parts']): Attachment[] {
  if (!Array.isArray(parts)) return []
  return parts.flatMap((part): Attachment[] => {
    // Stored file parts may use legacy shapes (`name`, nested `file`, attachmentName metadata).
    const filePart: unknown = part
    if (!isRecord(filePart) || filePart.type !== 'file') return []
    const nested = isRecord(filePart.file) ? filePart.file : undefined

    const url = readString(filePart, 'url') ?? readString(nested, 'url')
    const mediaType = readString(filePart, 'mediaType') ?? readString(nested, 'mediaType')
    if (!url || !mediaType) return []

    const name =
      readString(filePart, 'filename') ||
      readAttachmentName(filePart, 'providerMetadata') ||
      readAttachmentName(filePart, 'providerOptions') ||
      readString(filePart, 'name') ||
      readString(nested, 'filename') ||
      (nested && readAttachmentName(nested, 'providerMetadata')) ||
      (nested && readAttachmentName(nested, 'providerOptions')) ||
      readString(nested, 'name') ||
      undefined

    return [{ url, name, contentType: mediaType }]
  })
}

type CodexToolInvocation = {
  toolCallId: string
  toolName: string
  args?: Record<string, unknown>
  result?: unknown
  state: 'call' | 'result' | 'error'
  error?: string
}

/** A tool result from the model run, or the request's direct tool call. */
type FinishedToolResult = TypedToolResult<ToolSet> | DirectToolCallResult

type AppUIMessageChunk = InferUIMessageChunk<AppUIMessage>

/** Verbose per-request logging (tool groups, MCP lifecycle, save confirmations). */
const chatDebug = () => process.env.CHAT_DEBUG === 'true'

type LoadedMCPTools = Awaited<ReturnType<typeof fetchMCPTools>>

const NO_MCP_TOOLS: LoadedMCPTools = { tools: {}, clients: [], errors: [] }

/** Connects the request's MCP servers; never throws (a failure means "no MCP tools"). */
async function loadMCPTools(configs: MCPClientConfig[] | undefined): Promise<LoadedMCPTools> {
  if (!configs || configs.length === 0) return NO_MCP_TOOLS
  try {
    const result = await fetchMCPTools(configs)
    if (chatDebug() && Object.keys(result.tools).length > 0) {
      console.log(
        `[MCP] Loaded ${Object.keys(result.tools).length} tools from ${result.clients.length} MCP servers`
      )
    }
    if (result.errors.length > 0) {
      console.warn(
        '[MCP] Some MCP servers failed to connect:',
        result.errors.map(e => `${e.config.name}: ${e.error}`)
      )
    }
    return result
  } catch (error) {
    console.error('[MCP] Failed to fetch MCP tools:', error)
    // Continue without MCP tools - don't fail the request
    return NO_MCP_TOOLS
  }
}

/** Closes MCP clients after the response instead of holding the stream open for it. */
function closeMCPClientsLater(background: BackgroundTasks, clients: LoadedMCPTools['clients']) {
  if (clients.length === 0) return
  background.track(
    'close MCP clients',
    closeMCPClients(clients).then(() => {
      if (chatDebug()) console.log(`[MCP] Closed ${clients.length} MCP client(s)`)
    })
  )
}

/**
 * Holds the UI stream's `finish` chunk until the generated title is known and puts it in
 * the finish metadata (as before, when the title was awaited before streaming). Text
 * deltas are never delayed; only the end marker waits, and only if the title (5 s cap)
 * is slower than the whole answer.
 */
function withFinalTitle(
  stream: ReadableStream<AppUIMessageChunk>,
  titleReady: Promise<string>
): ReadableStream<AppUIMessageChunk> {
  return stream.pipeThrough(
    new TransformStream<AppUIMessageChunk, AppUIMessageChunk>({
      async transform(chunk, controller) {
        if (chunk.type !== 'finish') {
          controller.enqueue(chunk)
          return
        }
        const chatTitle = await titleReady
        controller.enqueue({
          ...chunk,
          messageMetadata: { ...chunk.messageMetadata, chatTitle },
        })
      },
    })
  )
}

export async function POST(req: Request) {
  // Registered first: `after()` (used for post-response work) needs the request scope.
  const background = createBackgroundTasks()
  try {
    const bodyPromise: Promise<unknown> = req.json().catch(() => null)
    const session = await auth()
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }
    const userId = session.user.id
    const rawPayload = await bodyPromise
    const payload = parseChatRequestPayload(rawPayload)
    if (!payload) {
      return new Response('Invalid request body', { status: 400 })
    }
    const { id: requestedChatId, directToolCall, preferredTool, thinkHarder } = payload
    const uiMessages: AppUIMessage[] = payload.messages ?? []
    const messages = uiMessagesToLegacyMessages(uiMessages)
    const lastMetadata: unknown = uiMessages.at(-1)?.metadata
    const metadataPreferredTool =
      isRecord(lastMetadata) && typeof lastMetadata.preferredTool === 'string'
        ? lastMetadata.preferredTool
        : undefined
    const effectivePreferredTool = preferredTool || metadataPreferredTool

    const normalizedChatId =
      typeof requestedChatId === 'string' && requestedChatId.trim().length > 0
        ? requestedChatId
        : generateId()

    const initialContent = getMessageText(messages[0])
    const tempTitle = extractTitleFromContent(initialContent || 'New Chat')

    // Existing chat, or a new one created with the temporary title. For new chats the
    // LLM title starts right away (in parallel with everything below) and is saved
    // off the critical path; the stream's finish metadata still carries it.
    const chatSetupPromise = (async () => {
      const existing = await getChat(normalizedChatId, userId)
      if (existing) return { chat: existing, generatedTitle: null }
      const generatedTitle = initialContent.trim()
        ? generateChatTitle(initialContent, userId)
        : null
      const created = await createChat(
        userId,
        tempTitle,
        `/chat/${normalizedChatId}`,
        normalizedChatId
      )
      return { chat: created, generatedTitle }
    })()

    // The user message is persisted concurrently with model start-up; the assistant
    // message save awaits it, so DB order (created_at) stays user -> assistant.
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
    const userMessageSaved: Promise<boolean> =
      lastMessage?.role === 'user'
        ? chatSetupPromise
            .then(({ chat }) => {
              const persistedAttachments = extractAttachmentsFromParts(lastMessage.parts)
              return saveMessage(
                chat.id,
                'user',
                getMessageText(lastMessage),
                undefined,
                lastMessage.id,
                persistedAttachments.length ? persistedAttachments : undefined
              )
            })
            .then(
              () => true,
              (error: unknown) => {
                console.error('Failed to save user message:', error)
                return false
              }
            )
        : Promise.resolve(true)
    background.track('save user message', userMessageSaved)

    // Only the model path is user-rate-limited. When neither a direct tool call nor
    // Codex can take over this request, run the (single round-trip) check concurrently.
    const codexConfigured = isCodexConfigured()
    const earlyRateLimit = !directToolCall && !codexConfigured ? enforceUserRateLimit(userId) : null
    // Handled where it is awaited; this only prevents an unhandled-rejection report meanwhile.
    earlyRateLimit?.catch(() => undefined)

    const mcpPromise = loadMCPTools(payload.mcpConfigs)

    let parallelReads: [
      Awaited<typeof chatSetupPromise>,
      boolean,
      Awaited<ReturnType<typeof buildMemoryContext>>,
      Awaited<ReturnType<typeof executeDirectToolCall>> | null,
      LoadedMCPTools,
    ]
    try {
      parallelReads = await Promise.all([
        chatSetupPromise,
        codexConfigured ? isChatgptConnectedCached(userId) : Promise.resolve(false),
        buildMemoryContext(userId),
        directToolCall
          ? executeDirectToolCall({ directToolCall, messages, userId })
          : Promise.resolve(null),
        mcpPromise,
      ])
    } catch (error) {
      background.track(
        'close MCP clients',
        mcpPromise.then(({ clients }) => closeMCPClients(clients))
      )
      throw error
    }
    const [
      { chat, generatedTitle },
      useCodexManagedUsage,
      { context: memoryContext, isEnabled: isMemoryEnabled },
      directToolCallOutcome,
      mcpResult,
    ] = parallelReads
    const mcpClients = mcpResult.clients

    const titleReady: Promise<string> | null = generatedTitle
      ? generatedTitle.then(async properTitle => {
          if (properTitle === chat.title) return chat.title
          try {
            await updateChat(chat.id, properTitle)
            if (chatDebug()) console.debug('Chat title updated successfully')
            return properTitle
          } catch (error) {
            console.error('Failed to update chat title:', error)
            return chat.title
          }
        })
      : null
    if (titleReady) background.track('generate chat title', titleReady)

    const directToolCallResult: DirectToolCallResult | null = directToolCallOutcome?.result ?? null
    const directToolCallExecuted = directToolCallOutcome?.executed ?? false

    if (!useCodexManagedUsage && !process.env.OPENAI_API_KEY) {
      closeMCPClientsLater(background, mcpClients)
      return jsonResponse(
        {
          error: 'API key not configured. Please add OPENAI_API_KEY to your environment variables.',
        },
        500
      )
    }

    const baseTools = toToolSet(
      createVITTools(userId, {
        sessionUser: { name: session.user.name, email: session.user.email },
        musicPlayerState: payload.musicPlayerState,
      })
    )
    const prefersWebSearch = effectivePreferredTool === 'web-search'
    let tools: ToolSet = baseTools

    if (Object.keys(mcpResult.tools).length > 0) {
      tools = { ...tools, ...mcpResult.tools }
    }

    if (prefersWebSearch) {
      try {
        tools = {
          ...tools,
          web_search: openai.tools.webSearch({ searchContextSize: 'medium' }),
        }
      } catch (error) {
        console.error('Failed to initialize OpenAI web search tool:', error)
      }
    }

    // Scira-style group filtering: if the user chose a preferred tool, trim
    // the tool registry down to that group's allowlist so the model stops
    // reaching for irrelevant tools. Unknown/missing selection keeps the full
    // registry intact.
    const groupId = preferredToolToGroupId(effectivePreferredTool)
    const group = getGroupConfig(groupId)
    const groupSystemAddition = groupId ? (group.systemPrompt ?? '') : ''
    if (groupId) {
      const filtered: ToolSet = {}
      for (const [name, tool] of Object.entries(loadConfiguredTools(tools, group))) {
        if (tool) filtered[name] = tool
      }
      if (Object.keys(filtered).length > 0) {
        tools = filtered
        if (chatDebug()) {
          console.log(`[Chat] Applied tool group "${group.id}" -> ${Object.keys(tools).join(', ')}`)
        }
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

    // Append the group's system preamble so the model knows it's operating in
    // a narrowed tool scope (matches how Scira routes per-group prompts).
    if (groupSystemAddition) {
      systemMessages.push({ role: 'system', content: groupSystemAddition })
    }

    const enhancedMessages = enhanceMessagesWithToolContext(messages, directToolCallResult)

    if (directToolCallResult && directToolCallExecuted) {
      const directResultPayload = getToolOutputPayload(directToolCallResult)
      const formattedContent = readString(directResultPayload, 'formatted_content')
      if (directResultPayload && formattedContent) {
        closeMCPClientsLater(background, mcpClients)
        const responseText = formattedContent
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

        await userMessageSaved
        try {
          await saveMessage(chat.id, 'assistant', responseText, safeInvocations, responseId)
          if (chatDebug()) console.debug('Direct tool call message saved with tool invocation')
        } catch (error) {
          console.error('Failed to save direct tool call message:', error)
        }
        // This path emits no title metadata; the client reads the title from the DB on
        // finish, so make sure it's written (it ran in parallel with the tool call).
        if (titleReady) await titleReady

        return createUIMessageStreamResponse({
          headers: {
            'X-Chat-Id': chat.id,
            'X-Chat-Path': chat.path,
            'X-Chat-Title': chat.title,
          },
          stream,
          consumeSseStream: consumeStream,
        })
      }
    }

    // Determine if user is admin for thinkHarder model selection
    const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
    const isAdmin = Boolean(adminEmail && session.user.email === adminEmail)

    const {
      instructions,
      messages: finalMessages,
      model,
    } = await prepareFinalMessages(enhancedMessages, systemMessages, finalPrefersWebSearch, {
      thinkHarder: thinkHarder ?? false,
      isAdmin,
    })
    const openaiPromptCacheKey = `pc:v1:${chat.id.slice(0, 40)}`
    const effectiveProvider = model.provider
    const effectiveModelId = model.modelId

    if (finalMessages.length === 0) {
      closeMCPClientsLater(background, mcpClients)
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

    if (useCodexManagedUsage) {
      const codexPrompt = buildCodexPromptFromMessages(finalMessages)
      const codexBaseInstructions = systemMessages
        .map(message => message.content.trim())
        .filter(Boolean)
        .join('\n\n')
      const codexDeveloperInstructions =
        'You are the in-product assistant for The Everything Assistant. Avoid claiming to be Codex unless the user explicitly asks about underlying runtime.'

      const stream = createUIMessageStream({
        originalMessages: uiMessages,
        generateId,
        onError: error => {
          console.error('[Chat] Codex managed stream error:', error)
          return CLIENT_ERROR_MESSAGE
        },
        execute: async ({ writer }) => {
          try {
            const textPartId = `codex-${generateId()}`
            let streamedText = ''
            const codexToolInvocationsById = new Map<string, CodexToolInvocation>()
            const inputArgs = (input: unknown) => (isRecord(input) ? input : undefined)

            writer.write({ type: 'text-start', id: textPartId })

            const codexResult: RunChatgptTurnResult = await runChatgptManagedTurn(userId, {
              prompt: codexPrompt,
              baseInstructions: codexBaseInstructions || undefined,
              developerInstructions: codexDeveloperInstructions,
              personality: 'none',
              tools,
              toolExecutionMessages: finalMessages,
              onToolEvent: (event: CodexToolEvent) => {
                if (event.phase === 'input-available') {
                  writer.write({
                    type: 'tool-input-available',
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    input: event.input,
                  })
                  codexToolInvocationsById.set(event.toolCallId, {
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    args: inputArgs(event.input),
                    state: 'call',
                  })
                  return
                }

                if (event.phase === 'output-available') {
                  writer.write({
                    type: 'tool-output-available',
                    toolCallId: event.toolCallId,
                    output: event.output,
                  })
                  const existing = codexToolInvocationsById.get(event.toolCallId)
                  codexToolInvocationsById.set(event.toolCallId, {
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                    args: existing?.args ?? inputArgs(event.input),
                    result: event.output,
                    state: 'result',
                  })
                  return
                }

                writer.write({
                  type: 'tool-output-error',
                  toolCallId: event.toolCallId,
                  errorText: event.errorText,
                })
                const existing = codexToolInvocationsById.get(event.toolCallId)
                codexToolInvocationsById.set(event.toolCallId, {
                  toolCallId: event.toolCallId,
                  toolName: event.toolName,
                  args: existing?.args ?? inputArgs(event.input),
                  state: 'error',
                  error: event.errorText,
                })
              },
              onTextDelta: delta => {
                if (!delta) return
                streamedText += delta
                writer.write({
                  type: 'text-delta',
                  id: textPartId,
                  delta,
                })
              },
            }).catch((error: unknown) => {
              // The cached "connected" flag may be stale (e.g. token revoked); re-check next time.
              background.track('invalidate codex status', invalidateChatgptStatus(userId))
              throw error
            })

            if (!streamedText && codexResult.text) {
              streamedText = codexResult.text
              writer.write({
                type: 'text-delta',
                id: textPartId,
                delta: codexResult.text,
              })
            }

            writer.write({ type: 'text-end', id: textPartId })

            const assistantText = (streamedText || codexResult.text || '').trim()
            const persistedText = assistantText || CLIENT_ERROR_MESSAGE
            const responseId = `codex-${codexResult.turnId || Date.now()}`
            const safeInvocations = sanitizeToolInvocations(
              Array.from(codexToolInvocationsById.values())
            )

            await userMessageSaved
            try {
              await saveMessage(chat.id, 'assistant', persistedText, safeInvocations, responseId)
            } catch (error) {
              console.error('Failed to save codex managed message:', error)
            }

            const usage = codexResult.usage
            if (usage) {
              background.track(
                'save codex usage',
                saveTokenUsage({
                  userId,
                  chatId: chat.id,
                  model: codexResult.model || 'codex/chatgpt-managed',
                  stepIndex: null,
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  totalTokens: usage.totalTokens,
                  meta: {
                    type: 'final',
                    provider: 'codex-app-server',
                    authMode: 'chatgpt',
                    cachedInputTokens: usage.cachedInputTokens,
                    reasoningOutputTokens: usage.reasoningOutputTokens,
                  },
                })
              )
            }

            // No title metadata on this path either: keep the DB title ready by stream end.
            if (titleReady) await titleReady
          } finally {
            closeMCPClientsLater(background, mcpClients)
          }
        },
      })

      return createUIMessageStreamResponse({
        headers: {
          'X-Chat-Id': chat.id,
          'X-Chat-Path': `/chat/${chat.id}`,
          'X-Chat-Title': chat.title,
          'X-Chat-Provider': 'codex-chatgpt',
        },
        stream,
        consumeSseStream: consumeStream,
      })
    }

    const parsedOpenAIMaxOutputTokens = Number.parseInt(
      process.env.OPENAI_MAX_OUTPUT_TOKENS || '8000',
      10
    )
    const openaiMaxOutputTokens = Number.isFinite(parsedOpenAIMaxOutputTokens)
      ? parsedOpenAIMaxOutputTokens
      : 8000

    const supportsOpenAIPromptCacheRetention = (modelId: string) => modelId.startsWith('gpt-5.1')

    const providerOptions = {
      openai: {
        ...defaultProviderOptions.openai,
        parallelToolCalls: true,
        store: false,
        maxToolCalls: 4,
        reasoningEffort: thinkHarder ? 'high' : 'none',
        reasoningSummary: 'detailed',
        promptCacheKey: openaiPromptCacheKey,
        ...(supportsOpenAIPromptCacheRetention(effectiveModelId)
          ? { promptCacheRetention: '24h' }
          : {}),
      } satisfies OpenAILanguageModelResponsesOptions,
    }

    const persistStreamError = (error: unknown) => {
      console.error('Streaming error occurred:', error)

      closeMCPClientsLater(background, mcpClients)

      if (process.env.STREAM_ERRORS_TO_CHAT === 'true') {
        background.track(
          'save stream error',
          userMessageSaved.then(() =>
            saveMessage(chat.id, 'assistant', CLIENT_ERROR_MESSAGE, [], `error-${Date.now()}`)
          )
        )
      }
    }

    const streamStartMs = Date.now()
    let chunkCount = 0
    let firstChunkAt: number | null = null
    let noChunkTimer: ReturnType<typeof setTimeout> | null = null

    const clearNoChunkLog = () => {
      if (noChunkTimer) {
        clearTimeout(noChunkTimer)
        noChunkTimer = null
      }
    }

    const scheduleNoChunkLog = () => {
      if (noChunkTimer) return
      noChunkTimer = setTimeout(() => {
        if (chunkCount === 0) {
          console.warn('[Chat] No chunks received after 15s', {
            provider: effectiveProvider,
            modelId: effectiveModelId,
            elapsedMs: Date.now() - streamStartMs,
          })
        }
      }, 15000)
    }

    const handleStreamError = ({ error }: { error: unknown }) => {
      const errorText = getErrorText(error)
      clearNoChunkLog()
      console.warn('[Chat] Stream error', {
        provider: effectiveProvider,
        modelId: effectiveModelId,
        errorText,
      })
      persistStreamError(error)
    }

    const handleStreamChunk = ({ chunk }: { chunk: { type: string } }) => {
      chunkCount += 1
      if (firstChunkAt === null) {
        firstChunkAt = Date.now()
        clearNoChunkLog()
        console.warn('[Chat] First chunk received', {
          provider: effectiveProvider,
          modelId: effectiveModelId,
          chunkType: chunk.type,
          elapsedMs: firstChunkAt - streamStartMs,
        })
      }
    }

    // Resolves true once the `stop` step's usage row is written; the final-usage
    // fallback in onEnd only writes when that didn't happen (same rule as before).
    let finalStepUsageSaved: Promise<boolean> = Promise.resolve(false)

    // The SDK awaits onStepEnd before continuing the stream, so the DB write is
    // detached instead of delaying the next step / the finish.
    const handleStepEnd = ({ finishReason, usage, stepNumber }: StepResult<ToolSet>) => {
      const usageTotals = normalizeTokenUsage(usage)
      const saved = saveTokenUsage({
        userId,
        chatId: chat.id,
        model: model.modelId,
        stepIndex: stepNumber,
        inputTokens: usageTotals.inputTokens,
        outputTokens: usageTotals.outputTokens,
        totalTokens: usageTotals.totalTokens,
        meta: { finishReason },
      }).then(
        () => true,
        (e: unknown) => {
          console.warn('Failed to persist step usage:', e)
          return false
        }
      )
      background.track('save step usage', saved)
      if (finishReason === 'stop') {
        finalStepUsageSaved = saved
      }
    }

    // The SDK awaits onEnd before closing the stream: only the assistant-message
    // insert stays inline (the chat page reads it right after the stream ends);
    // VTOP parsing (an LLM call), usage rows and MCP teardown run after the response.
    const handleEnd = async (result: StreamTextEndEvent<ToolSet>) => {
      clearNoChunkLog()
      const toolResultsById = new Map<string | undefined, FinishedToolResult>()
      const collect = (toolResult: FinishedToolResult) => {
        if (!toolResultsById.has(toolResult.toolCallId)) {
          toolResultsById.set(toolResult.toolCallId, toolResult)
        }
      }
      result.toolResults.forEach(collect)
      for (const step of result.steps) step.toolResults.forEach(collect)

      if (directToolCallResult) {
        // Replaces in place, or appends — same as the previous findIndex/push.
        toolResultsById.set(directToolCallResult.toolCallId, directToolCallResult)
      }
      const uniqueToolResults = Array.from(toolResultsById.values())

      const buildInvocations = () =>
        sanitizeToolInvocations(
          uniqueToolResults.map(tr => {
            const toolOutput = getToolOutput(tr)
            return {
              toolCallId: tr.toolCallId || `${tr.toolName}-${Date.now()}`,
              toolName: tr.toolName,
              args: getToolInputPayload(tr) || {},
              result: toolOutput || null,
              state: inferLegacyToolState(tr, toolOutput),
            }
          })
        )

      const unparsedVTOPResults = uniqueToolResults.filter(tr => {
        const toolOutput = getToolOutputPayload(tr)
        return (
          tr.toolName === 'queryVTOP' &&
          toolOutput?.success &&
          toolOutput.data &&
          !toolOutput.parsedData
        )
      })

      const messageId = result.response.id
      let savedWithInvocations = false
      await userMessageSaved
      try {
        await saveMessage(chat.id, 'assistant', result.text, buildInvocations(), messageId)
        savedWithInvocations = true
        if (chatDebug()) console.debug('Final message saved with tool invocations')
      } catch (error) {
        console.error('Failed to save final message:', error)
        try {
          await saveMessage(chat.id, 'assistant', result.text, [], messageId)
          if (chatDebug()) console.debug('Final message saved without tool invocations (fallback)')
        } catch (fallbackError) {
          console.error(
            'Failed to save final message even without tool invocations:',
            fallbackError
          )
        }
      }

      if (unparsedVTOPResults.length > 0) {
        background.track(
          'parse VTOP results',
          (async () => {
            for (const tr of unparsedVTOPResults) {
              const toolOutput = getToolOutputPayload(tr)
              if (!toolOutput) continue
              try {
                const parsed = await parseVTOPData(
                  toolOutput,
                  readString(getToolInputPayload(tr), 'command') || 'data',
                  recentUserContext(messages),
                  userId
                )
                Object.assign(toolOutput, {
                  parsedData: parsed,
                  formatted_content: parsed.formatted_content,
                  structured_data: parsed.structured_data,
                  summary: parsed.summary,
                })
              } catch (e) {
                console.error('Failed to parse VTOP data in final result:', e)
              }
            }
            if (savedWithInvocations) {
              await updateMessageToolInvocations(messageId, buildInvocations())
            }
          })()
        )
      }

      const usageTotals = normalizeTokenUsage(result.usage)
      background.track(
        'save final usage',
        finalStepUsageSaved.then(async savedStopStep => {
          if (savedStopStep) return
          try {
            await saveTokenUsage({
              userId,
              chatId: chat.id,
              model: model.modelId,
              stepIndex: null,
              inputTokens: usageTotals.inputTokens,
              outputTokens: usageTotals.outputTokens,
              totalTokens: usageTotals.totalTokens,
              meta: { type: 'final' },
            })
          } catch (e) {
            console.warn('Failed to persist final usage:', e)
          }
        })
      )

      closeMCPClientsLater(background, mcpClients)
    }

    await (earlyRateLimit ?? enforceUserRateLimit(userId))
    scheduleNoChunkLog()

    const result = streamText({
      model: openai(effectiveModelId),
      instructions,
      messages: finalMessages,
      tools,
      maxRetries: 0,
      maxOutputTokens: openaiMaxOutputTokens,
      stopWhen: isStepCount(10),
      providerOptions,
      onChunk: handleStreamChunk,
      onStepEnd: handleStepEnd,
      onEnd: handleEnd,
      onError: handleStreamError,
    })

    const uiStream = result.toUIMessageStream<AppUIMessage>({
      originalMessages: uiMessages,
      generateMessageId: generateId,
      messageMetadata: ({ part }) => {
        if (part.type === 'finish') {
          return {
            chatId: chat.id,
            chatPath: `/chat/${chat.id}`,
            chatTitle: chat.title,
          }
        }
        return undefined
      },
      onError: () => CLIENT_ERROR_MESSAGE,
    })

    return createUIMessageStreamResponse({
      headers: {
        'X-Chat-Id': chat.id,
        'X-Chat-Path': `/chat/${chat.id}`,
        'X-Chat-Title': chat.title,
      },
      stream: titleReady ? withFinalTitle(uiStream, titleReady) : uiStream,
      consumeSseStream: consumeStream,
    })
  } catch (error) {
    console.error('Chat API error:', error)

    if (error instanceof UserRateLimitError) {
      return jsonResponse(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: CLIENT_ERROR_MESSAGE,
          type: 'user_rate_limit',
        },
        429
      )
    }

    if (error instanceof Error && error.message.toLowerCase().includes('rate limit')) {
      return jsonResponse(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: CLIENT_ERROR_MESSAGE,
          type: 'model_rate_limit',
        },
        429
      )
    }

    return jsonResponse({ error: CLIENT_ERROR_MESSAGE }, 500)
  }
}
