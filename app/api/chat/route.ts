import {
  createUIMessageStream,
  smoothStream,
  createUIMessageStreamResponse,
  generateId,
  isStepCount,
  consumeStream,
  streamText,
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
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getChat, createChat, saveMessage, updateChat } from '@/lib/db'
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
import {
  getChatgptStatus,
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

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }
    const userId = session.user.id
    const rawPayload: unknown = await req.json().catch(() => null)
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

    let chat = normalizedChatId ? await getChat(normalizedChatId, userId) : null
    const isExistingChat = !!chat
    if (!chat) {
      const initialContent = getMessageText(messages[0])
      const tempTitle = extractTitleFromContent(initialContent || 'New Chat')
      const path = `/chat/${normalizedChatId}`
      const createdChat = await createChat(userId, tempTitle, path, normalizedChatId)
      chat = createdChat

      const userMessage = initialContent
      if (userMessage.trim()) {
        try {
          const properTitle = await generateChatTitle(userMessage, userId)
          if (properTitle !== tempTitle) {
            await updateChat(createdChat.id, properTitle)
            createdChat.title = properTitle
            console.debug('Chat title updated successfully')
          }
        } catch (error) {
          console.error('Failed to update chat title:', error)
        }
      }
    }

    let directToolCallResult: DirectToolCallResult | null = null
    let directToolCallExecuted = false

    if (directToolCall) {
      const { result, executed } = await executeDirectToolCall({
        directToolCall,
        messages,
        userId,
      })
      directToolCallResult = result
      directToolCallExecuted = executed
    }

    let useCodexManagedUsage = false
    try {
      const chatgptStatus = await getChatgptStatus(userId)
      useCodexManagedUsage = chatgptStatus.connected
    } catch (error) {
      console.warn('[Chat] Unable to read codex ChatGPT status, falling back to API key', error)
    }

    if (!useCodexManagedUsage && !process.env.OPENAI_API_KEY) {
      return jsonResponse(
        {
          error: 'API key not configured. Please add OPENAI_API_KEY to your environment variables.',
        },
        500
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

    const { context: memoryContext, isEnabled: isMemoryEnabled } = await buildMemoryContext(userId)

    const baseTools = toToolSet(
      createVITTools(userId, {
        sessionUser: { name: session.user.name, email: session.user.email },
        musicPlayerState: payload.musicPlayerState,
      })
    )
    const prefersWebSearch = effectivePreferredTool === 'web-search'
    let tools: ToolSet = baseTools

    let mcpClients: Awaited<ReturnType<typeof fetchMCPTools>>['clients'] = []
    if (payload.mcpConfigs && payload.mcpConfigs.length > 0) {
      try {
        const mcpResult = await fetchMCPTools(payload.mcpConfigs)
        if (Object.keys(mcpResult.tools).length > 0) {
          tools = { ...tools, ...mcpResult.tools }
          mcpClients = mcpResult.clients
          console.log(
            `[MCP] Loaded ${Object.keys(mcpResult.tools).length} tools from ${mcpClients.length} MCP servers`
          )
        }
        if (mcpResult.errors.length > 0) {
          console.warn(
            '[MCP] Some MCP servers failed to connect:',
            mcpResult.errors.map(e => `${e.config.name}: ${e.error}`)
          )
        }
      } catch (error) {
        console.error('[MCP] Failed to fetch MCP tools:', error)
        // Continue without MCP tools - don't fail the request
      }
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
        console.log(`[Chat] Applied tool group "${group.id}" -> ${Object.keys(tools).join(', ')}`)
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

        try {
          await saveMessage(chat.id, 'assistant', responseText, safeInvocations, responseId)
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
    } = await prepareFinalMessages(
      enhancedMessages,
      systemMessages,
      finalPrefersWebSearch,
      !isExistingChat,
      { thinkHarder: thinkHarder ?? false, isAdmin }
    )
    const openaiPromptCacheKey = `pc:v1:${chat.id.slice(0, 40)}`
    const effectiveProvider = model.provider
    const effectiveModelId = model.modelId

    if (finalMessages.length === 0) {
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

    // Narrowed `chat` for the callbacks below.
    const activeChat = chat

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

            try {
              await saveMessage(
                activeChat.id,
                'assistant',
                persistedText,
                safeInvocations,
                responseId
              )
            } catch (error) {
              console.error('Failed to save codex managed message:', error)
            }

            if (codexResult.usage) {
              try {
                const { saveTokenUsage } = await import('@/lib/db')
                await saveTokenUsage({
                  userId,
                  chatId: activeChat.id,
                  model: codexResult.model || 'codex/chatgpt-managed',
                  stepIndex: null,
                  inputTokens: codexResult.usage.inputTokens,
                  outputTokens: codexResult.usage.outputTokens,
                  totalTokens: codexResult.usage.totalTokens,
                  meta: {
                    type: 'final',
                    provider: 'codex-app-server',
                    authMode: 'chatgpt',
                    cachedInputTokens: codexResult.usage.cachedInputTokens,
                    reasoningOutputTokens: codexResult.usage.reasoningOutputTokens,
                  },
                })
              } catch (error) {
                console.warn('Failed to persist codex managed usage:', error)
              }
            }
          } finally {
            if (mcpClients.length > 0) {
              await closeMCPClients(mcpClients)
              console.log(`[MCP] Closed ${mcpClients.length} MCP client(s)`)
            }
          }
        },
      })

      return createUIMessageStreamResponse({
        headers: {
          'X-Chat-Id': activeChat.id,
          'X-Chat-Path': `/chat/${activeChat.id}`,
          'X-Chat-Title': activeChat.title,
          'X-Chat-Provider': 'codex-chatgpt',
        },
        stream,
        consumeSseStream: consumeStream,
      })
    }

    let savedFinalStepUsage = false

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

    const persistStreamError = async (error: unknown) => {
      console.error('Streaming error occurred:', error)

      if (mcpClients.length > 0) {
        await closeMCPClients(mcpClients)
        console.log(`[MCP] Closed ${mcpClients.length} MCP client(s) after error`)
      }

      if (process.env.STREAM_ERRORS_TO_CHAT === 'true') {
        try {
          await saveMessage(
            activeChat.id,
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

    const handleStreamError = async ({ error }: { error: unknown }) => {
      const errorText = getErrorText(error)
      clearNoChunkLog()
      console.warn('[Chat] Stream error', {
        provider: effectiveProvider,
        modelId: effectiveModelId,
        errorText,
      })
      await persistStreamError(error)
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

    const handleStepEnd = async ({ finishReason, usage, stepNumber }: StepResult<ToolSet>) => {
      try {
        const usageTotals = normalizeTokenUsage(usage)
        const { saveTokenUsage } = await import('@/lib/db')
        await saveTokenUsage({
          userId,
          chatId: activeChat.id,
          model: model.modelId,
          stepIndex: stepNumber,
          inputTokens: usageTotals.inputTokens,
          outputTokens: usageTotals.outputTokens,
          totalTokens: usageTotals.totalTokens,
          meta: { finishReason },
        })
        if (finishReason === 'stop') {
          savedFinalStepUsage = true
        }
      } catch (e) {
        console.warn('Failed to persist step usage:', e)
      }
    }

    const handleEnd = async (result: StreamTextEndEvent<ToolSet>) => {
      clearNoChunkLog()
      const allToolResults: FinishedToolResult[] = [...result.toolResults]
      for (const step of result.steps) {
        allToolResults.push(...step.toolResults)
      }

      const uniqueToolResults = allToolResults.filter(
        (toolResult, index, array) =>
          index === array.findIndex(r => r.toolCallId === toolResult.toolCallId)
      )

      if (directToolCallResult) {
        const directCallId = directToolCallResult.toolCallId
        const existingIndex = uniqueToolResults.findIndex(r => r.toolCallId === directCallId)
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
      }

      const allInvocations = uniqueToolResults.map(tr => {
        const toolOutput = getToolOutput(tr)
        return {
          toolCallId: tr.toolCallId || `${tr.toolName}-${Date.now()}`,
          toolName: tr.toolName,
          args: getToolInputPayload(tr) || {},
          result: toolOutput || null,
          state: inferLegacyToolState(tr, toolOutput),
        }
      })

      const safeInvocations = sanitizeToolInvocations(allInvocations)

      try {
        await saveMessage(
          activeChat.id,
          'assistant',
          result.text,
          safeInvocations,
          result.response.id
        )
        console.debug('Final message saved with tool invocations')
      } catch (error) {
        console.error('Failed to save final message:', error)
        try {
          await saveMessage(activeChat.id, 'assistant', result.text, [], result.response.id)
          console.debug('Final message saved without tool invocations (fallback)')
        } catch (fallbackError) {
          console.error(
            'Failed to save final message even without tool invocations:',
            fallbackError
          )
        }
      }

      try {
        if (!savedFinalStepUsage) {
          const usageTotals = normalizeTokenUsage(result.usage)
          const { saveTokenUsage } = await import('@/lib/db')
          await saveTokenUsage({
            userId,
            chatId: activeChat.id,
            model: model.modelId,
            stepIndex: null,
            inputTokens: usageTotals.inputTokens,
            outputTokens: usageTotals.outputTokens,
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

    await enforceUserRateLimit(userId)
    scheduleNoChunkLog()

    const result = streamText({
      model: openai(effectiveModelId),
      instructions,
      messages: finalMessages,
      tools,
      maxRetries: 0,
      maxOutputTokens: openaiMaxOutputTokens,
      experimental_transform: smoothStream({ chunking: 'word' }),
      stopWhen: isStepCount(10),
      providerOptions,
      onChunk: handleStreamChunk,
      onStepEnd: handleStepEnd,
      onEnd: handleEnd,
      onError: handleStreamError,
    })

    const stream = result.toUIMessageStream<AppUIMessage>({
      originalMessages: uiMessages,
      generateMessageId: generateId,
      messageMetadata: ({ part }) => {
        if (part.type === 'finish') {
          return {
            chatId: activeChat.id,
            chatPath: `/chat/${activeChat.id}`,
            chatTitle: activeChat.title,
          }
        }
        return undefined
      },
      onError: () => CLIENT_ERROR_MESSAGE,
    })

    return createUIMessageStreamResponse({
      headers: {
        'X-Chat-Id': activeChat.id,
        'X-Chat-Path': `/chat/${activeChat.id}`,
        'X-Chat-Title': activeChat.title,
      },
      stream,
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
