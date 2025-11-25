import { smoothStream, extractReasoningMiddleware, createUIMessageStreamResponse, generateId, stepCountIs } from 'ai'
import { inspect } from 'util'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { createVITTools } from '@/lib/tools'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getChat, createChat, saveMessage, updateChat } from '@/lib/db'
import { extractTitleFromContent } from '@/lib/utils'
import { sanitizeToolInvocations } from '@/lib/sanitize-tools'
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
import type { UIMessagePart } from 'ai'

const getMessageText = (message: LegacyMessage | null | undefined): string =>
  message?.content ?? ''

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
    const { id: requestedChatId, directToolCall, preferredTool } = payload
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

    const { finalMessages, model, attachmentAware } = await prepareFinalMessages(
      enhancedMessages,
      systemMessages,
      finalPrefersWebSearch,
      !isExistingChat
    )
    const promptCacheKey =
      model.provider === 'openai'
        ? `pc:v1:${chat.id.slice(0, 40)}`
        : undefined

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

    const providerClient = rateLimitedAI[model.provider as keyof typeof rateLimitedAI]
    if (!providerClient) {
      throw new Error(`Unsupported model provider: ${model.provider}`)
    }

    const resolvedModel = await providerClient.model(model.modelId)

    const providerOptions =
      model.provider === 'google'
        ? {
            google: {
              thinkingConfig: {
                thinkingBudget: 4096,
                includeThoughts: true,
              },
            },
          }
        : model.provider === 'openai'
          ? {
              openai: {
                parallelToolCalls: true,
                store: false,
                maxToolCalls: 4,
                reasoningSummary: 'detailed',
                promptCacheKey,
                ...(model.modelId.startsWith('gpt-5.1')
                  ? { promptCacheRetention: '24h' }
                  : {}),
              },
            }
          : undefined

    const resultStream = await providerClient.streamText(
      {
        model: resolvedModel,
        messages: finalMessages,
        tools,
        temperature: 0.3,
        maxTokens: 40000,
        ...(providerOptions ? { providerOptions } : {}),
        experimental_transform: smoothStream({ chunking: 'word' }),
        middleware: model.provider === 'openai' ? [] : [reasoningMiddleware],
        stopWhen: stepCountIs(10),
        onError: async (error: any) => {
          console.error('Streaming error occurred:', error)

          if (mcpClients.length > 0) {
            await closeMCPClients(mcpClients)
            console.log(`[MCP] Closed ${mcpClients.length} MCP client(s) after error`)
          }

          try {
            await saveMessage(
              chat.id,
              'assistant',
              `I encountered an error while processing your request: ${error.message || 'Unknown streaming error'}`,
              [],
              `error-${Date.now()}`
            )
            console.debug('Streaming error saved to database')
          } catch (saveError) {
            console.error('Failed to save streaming error:', saveError)
          }
        },
        onStepFinish: async ({
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
              const { saveTokenUsage } = await import('@/lib/db')
              await saveTokenUsage({
                userId: session.user.id,
                chatId: chat.id,
                model: model.modelId,
                stepIndex: typeof stepIndex === 'number' ? stepIndex : null,
                promptTokens: usage.promptTokens || 0,
                completionTokens: usage.completionTokens || 0,
                totalTokens:
                  usage.totalTokens || (usage.promptTokens || 0) + (usage.completionTokens || 0),
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
        },
        onFinish: async (result: any, { reasoning }: any = {}) => {
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
              const { saveTokenUsage } = await import('@/lib/db')
              await saveTokenUsage({
                userId: session.user.id,
                chatId: chat.id,
                model: model.modelId,
                stepIndex: null,
                promptTokens: finalUsage.promptTokens || 0,
                completionTokens: finalUsage.completionTokens || 0,
                totalTokens:
                  finalUsage.totalTokens ||
                  (finalUsage.promptTokens || 0) + (finalUsage.completionTokens || 0),
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
        },
      },
      session.user.id
    )

    return resultStream.toUIMessageStreamResponse({
      originalMessages: uiMessages,
      generateMessageId: generateId,
      headers: {
        'X-Chat-Id': chat.id,
        'X-Chat-Path': `/chat/${chat.id}`,
        'X-Chat-Title': chat.title,
      },
      messageMetadata: ({ part }) => {
        if (part.type === 'finish') {
          return {
            chatId: chat.id,
            chatPath: `/chat/${chat.id}`,
            chatTitle: chat.title,
          }
        }
      },
      onError: () => 'An error occurred while processing your request.',
    })
  } catch (error: any) {
    console.error('Chat API error:', error)

    if (error.message?.includes('User rate limit exceeded')) {
      return new Response(
        JSON.stringify({
          error: 'RATE_LIMIT_EXCEEDED',
          message: error.message,
          type: 'user_rate_limit',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (error.message?.toLowerCase().includes('rate limit')) {
      return new Response(
        JSON.stringify({
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'The model is currently overloaded. Please try again later.',
          type: 'model_rate_limit',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
