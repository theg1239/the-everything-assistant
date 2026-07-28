import {
  createUIMessageStream,
  smoothStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  consumeStream,
} from 'ai'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { getErrorText } from '@/lib/ai-stream-fallback'
import { createVITTools } from '@/lib/tools'
import type { ModelProvider } from '@/lib/model-registry'
import type { ApiKeyEntry } from '@/lib/api-key-manager'
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
import { getToolInputPayload, getToolOutputPayload, inferLegacyToolState } from './lib/tool-helpers'
import { executeDirectToolCall } from './lib/direct-tool-call'
import { buildMemoryContext } from './lib/memory-context'
import { enhanceMessagesWithToolContext, prepareFinalMessages } from './lib/message-prep'
import { buildSystemPrompt } from './lib/prompt'

const getMessageText = (message: LegacyMessage | null | undefined): string => message?.content ?? ''

const CLIENT_ERROR_MESSAGE = 'An error occurred.'

const buildCodexPromptFromMessages = (messages: any[]): string => {
  const conversation = messages
    .map(message => {
      const role = typeof message?.role === 'string' ? message.role : 'user'
      if (role === 'system') return ''
      return {
        role,
        content: message?.content ?? '',
      }
    })
    .filter(Boolean)
  const serialized = JSON.stringify(conversation)

  return [
    'Use the conversation payload below as the canonical chat history.',
    'Answer as the assistant to the latest user message.',
    serialized,
  ]
    .filter(Boolean)
    .join('\n\n')
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
        filename?: string
        name?: string
        mediaType?: string
        providerMetadata?: { attachmentName?: string }
        providerOptions?: { attachmentName?: string }
        file?: {
          url?: string
          filename?: string
          name?: string
          mediaType?: string
          providerMetadata?: { attachmentName?: string }
          providerOptions?: { attachmentName?: string }
        }
      }
      const url =
        typeof filePart.url === 'string'
          ? filePart.url
          : typeof filePart.file?.url === 'string'
            ? filePart.file.url
            : undefined
      const mediaType =
        typeof filePart.mediaType === 'string'
          ? filePart.mediaType
          : typeof filePart.file?.mediaType === 'string'
            ? filePart.file.mediaType
            : undefined
      if (!url || !mediaType) return null
      const name =
        filePart.filename ||
        filePart.providerMetadata?.attachmentName ||
        filePart.providerOptions?.attachmentName ||
        filePart.name ||
        filePart.file?.filename ||
        filePart.file?.providerMetadata?.attachmentName ||
        filePart.file?.providerOptions?.attachmentName ||
        filePart.file?.name ||
        undefined
      return {
        url,
        name,
        contentType: mediaType,
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

    let useCodexManagedUsage = false
    try {
      const chatgptStatus = await getChatgptStatus(session.user.id)
      useCodexManagedUsage = chatgptStatus.connected
    } catch (error) {
      console.warn('[Chat] Unable to read codex ChatGPT status, falling back to API keys', error)
    }

    if (!useCodexManagedUsage && !process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEYS) {
      return new Response(
        JSON.stringify({
          error:
            'API key not configured. Please add OPENAI_API_KEY or OPENAI_API_KEYS to your environment variables.',
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

    const { context: memoryContext, isEnabled: isMemoryEnabled } = await buildMemoryContext(
      session.user.id
    )

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
        const webSearchTool = rateLimitedAI.openai.tools.web_search({
          searchContextSize: 'medium',
        })
        if (webSearchTool) {
          tools = {
            ...tools,
            web_search: webSearchTool,
          }
        }
      } catch (error) {
        console.error('Failed to initialize OpenAI web search tool:', error)
        tools = { ...tools }
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
      const filtered = loadConfiguredTools(tools, group)
      if (filtered && Object.keys(filtered).length > 0) {
        tools = filtered as Record<string, any>
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

    const { finalMessages, model, attachmentAware } = await prepareFinalMessages(
      enhancedMessages,
      systemMessages,
      finalPrefersWebSearch,
      !isExistingChat,
      { thinkHarder: thinkHarder ?? false, isAdmin }
    )
    const openaiPromptCacheKey = `pc:v1:${chat.id.slice(0, 40)}`
    const effectiveProvider = model.provider
    const effectiveModelId = model.modelId

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

    if (useCodexManagedUsage) {
      const codexPrompt = buildCodexPromptFromMessages(finalMessages)
      const codexBaseInstructions = systemMessages
        .map(message => message?.content?.trim?.() ?? '')
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
            const codexToolInvocationsById = new Map<
              string,
              {
                toolCallId: string
                toolName: string
                args?: Record<string, unknown>
                result?: unknown
                state: 'call' | 'result' | 'error'
                error?: string
              }
            >()

            writer.write({ type: 'text-start', id: textPartId })

            const codexResult: RunChatgptTurnResult = await runChatgptManagedTurn(session.user.id, {
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
                    args:
                      event.input && typeof event.input === 'object'
                        ? (event.input as Record<string, unknown>)
                        : undefined,
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
                    args:
                      existing?.args ??
                      (event.input && typeof event.input === 'object'
                        ? (event.input as Record<string, unknown>)
                        : undefined),
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
                  args:
                    existing?.args ??
                    (event.input && typeof event.input === 'object'
                      ? (event.input as Record<string, unknown>)
                      : undefined),
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
              await saveMessage(chat.id, 'assistant', persistedText, safeInvocations, responseId)
            } catch (error) {
              console.error('Failed to save codex managed message:', error)
            }

            if (codexResult.usage) {
              try {
                const { saveTokenUsage } = await import('@/lib/db')
                await saveTokenUsage({
                  userId: session.user.id,
                  chatId: chat.id,
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
          'X-Chat-Id': chat.id,
          'X-Chat-Path': `/chat/${chat.id}`,
          'X-Chat-Title': chat.title,
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
    const allowedProviders: ModelProvider[] = ['openai']
    const preferredProviders: ModelProvider[] = ['openai']

    const supportsOpenAIPromptCacheRetention = (modelId: string) => modelId.startsWith('gpt-5.1')

    const buildOpenAIProviderOptions = (modelId: string) => ({
      openai: {
        parallelToolCalls: true,
        store: false,
        maxToolCalls: 4,
        reasoningEffort: thinkHarder || modelId === 'gpt-5.6-sol' ? 'high' : 'none',
        reasoningSummary: 'detailed',
        promptCacheKey: openaiPromptCacheKey,
        ...(supportsOpenAIPromptCacheRetention(modelId) ? { promptCacheRetention: '24h' } : {}),
      },
    })

    const providerClient = rateLimitedAI[model.provider as keyof typeof rateLimitedAI]
    if (!providerClient) {
      throw new Error(`Unsupported model provider: ${model.provider}`)
    }

    const providerOptions = buildOpenAIProviderOptions(effectiveModelId)

    const persistStreamError = async (error: any) => {
      console.error('Streaming error occurred:', error)

      if (mcpClients.length > 0) {
        await closeMCPClients(mcpClients)
        console.log(`[MCP] Closed ${mcpClients.length} MCP client(s) after error`)
      }

      if (process.env.STREAM_ERRORS_TO_CHAT === 'true') {
        try {
          await saveMessage(chat.id, 'assistant', CLIENT_ERROR_MESSAGE, [], `error-${Date.now()}`)
          console.debug('Streaming error saved to database')
        } catch (saveError) {
          console.error('Failed to save streaming error:', saveError)
        }
      }
    }

    let activeStreamProvider = effectiveProvider
    let activeStreamModelId = effectiveModelId

    const handleStreamError = async (error: any) => {
      const errorText = getErrorText(error)
      clearNoChunkLog()
      console.warn('[Chat] Stream error', {
        provider: activeStreamProvider,
        modelId: activeStreamModelId,
        errorText,
      })
      await persistStreamError(error)
    }

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
    }

    const handleStepFinish = async ({
      text,
      toolCalls,
      toolResults,
      finishReason,
      usage,
      stepIndex,
      reasoningText,
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
            inputTokens: usageTotals.inputTokens,
            outputTokens: usageTotals.outputTokens,
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

    const handleFinish = async (result: any, { reasoningText }: any = {}) => {
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
        (result, index, array) => index === array.findIndex(r => r.toolCallId === result.toolCallId)
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
        await saveMessage(chat.id, 'assistant', result.text, safeInvocations, result.response.id)
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

    const baseStreamOptions = {
      messages: finalMessages,
      tools,
      maxRetries: 0,
      maxOutputTokens: 40000,
      experimental_transform: smoothStream({ chunking: 'word' }),
      stopWhen: stepCountIs(10),
      onChunk: handleStreamChunk,
      onStepFinish: handleStepFinish,
      onFinish: handleFinish,
    }

    const streamProviderOverrides: Record<string, Partial<any>> = {
      openai: {
        maxOutputTokens: openaiMaxOutputTokens,
        middleware: [],
      },
    }

    const streamOptions = {
      ...baseStreamOptions,
      model: { modelId: model.modelId },
      ...(providerOptions ? { providerOptions } : {}),
      providerOverrides: streamProviderOverrides,
      onError: handleStreamError,
    }

    const uiStreamOnError = (_error: unknown) => CLIENT_ERROR_MESSAGE

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

    const handleKeySelected = (_idx: number, entry?: ApiKeyEntry) => {
      activeStreamProvider = entry?.provider === 'openai' ? 'openai' : effectiveProvider
      activeStreamModelId = effectiveModelId
    }

    const startStream = async () => {
      scheduleNoChunkLog()
      const result = await providerClient.streamText(streamOptions, session.user.id, {
        allowedProviders,
        preferredProviders,
        onKeySelected: handleKeySelected,
      })
      return result.toUIMessageStream(uiStreamOptions)
    }

    const stream = await startStream()

    return createUIMessageStreamResponse({
      headers: {
        'X-Chat-Id': chat.id,
        'X-Chat-Path': `/chat/${chat.id}`,
        'X-Chat-Title': chat.title,
      },
      stream,
      consumeSseStream: consumeStream,
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

    return new Response(JSON.stringify({ error: CLIENT_ERROR_MESSAGE }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
