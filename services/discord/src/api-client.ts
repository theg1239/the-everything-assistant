import { z } from 'zod'

interface ConversationHistory {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface APIResponse {
  text: string
  reasoning?: string
  toolResults: unknown[]
  error?: string
}

export interface UserContext {
  source?: string
  userId?: string
  username?: string
  channelId?: string
  guildId?: string
}

// One `data:` payload of the AI SDK UI message stream. Only the fields we read are validated;
// fields with an unexpected type are treated as absent.
const uiStreamChunkSchema = z.looseObject({
  type: z.string().optional().catch(undefined),
  delta: z.string().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
  errorText: z.string().optional().catch(undefined),
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Reads `value[key]` when `value` is an object, otherwise `undefined`. */
const getProp = (value: unknown, key: string): unknown => (isRecord(value) ? value[key] : undefined)

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

class APIClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl
    this.apiKey = apiKey
  }

  async sendChatRequest(
    userQuestion: string,
    userContext: UserContext = {},
    conversationHistory: ConversationHistory[] = []
  ): Promise<APIResponse> {
    try {
      console.log(`sending message: ${userQuestion.substring(0, 50)}...`)

      const requestBody = {
        message: userQuestion,
        source: 'discord',
        userId: userContext.userId,
        userContext: {
          username: userContext.username,
          channelId: userContext.channelId,
          guildId: userContext.guildId,
        },
        conversationHistory: conversationHistory.slice(-5).map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
      }

      console.log(`sending discord request with ${conversationHistory.length} history messages`)

      const response = await fetch(`${this.baseUrl}/api/whatsapp-bot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, text/plain',
          'X-WABA-UI-STREAM': '1',
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'the-everything-assistant-bot/1.0.0',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`)
      }

      const result = await this.parseStreamingResponse(response)

      if (
        (!result.text || result.text.includes("couldn't generate a proper response")) &&
        conversationHistory.length > 0
      ) {
        console.log('retrying request without conversation history...')
        return await this.sendChatRequest(userQuestion, userContext, [])
      }
      return result
    } catch (error) {
      console.error('API request failed:', error)
      throw error
    }
  }

  private async parseStreamingResponse(response: Response): Promise<APIResponse> {
    try {
      const rawText = await this.readTextStream(response)
      console.log('raw api response:', rawText.substring(0, 400) + '...')
      console.log('response length:', rawText.length)

      const contentType = (response.headers.get('content-type') || '').toLowerCase()
      const isSse = contentType.includes('text/event-stream')

      // Prefer UI/SSE parsing whenever the payload contains data: lines or SSE content type
      if (isSse || rawText.includes('data:')) {
        const { text, reasoning } = this.parseUIStream(rawText)
        if (text || reasoning) {
          return {
            text,
            reasoning,
            toolResults: [],
            error: undefined,
          }
        }
        // Regex fallback in case structured parsing missed deltas
        const regexText = this.extractTextDeltas(rawText)
        if (regexText) {
          return { text: regexText, reasoning: '', toolResults: [], error: undefined }
        }
      }

      // Fast path for plain text streams that already contain the full answer
      const plainText = rawText.trim()
      const firstLine = plainText.split('\n')[0] || ''
      if (plainText && !/^[0-4aefd]:/.test(firstLine)) {
        return {
          text: plainText,
          reasoning: '',
          toolResults: [],
          error: undefined,
        }
      }

    const lines = rawText.split('\n').filter((line: string) => line.trim())
    console.log('total lines:', lines.length)

    let finalText = ''
    const toolResults: unknown[] = []
      let error: string | null = null

      for (const line of lines) {
        try {
          const trimmedLine = line.trim()
          console.log(
            'processing line:',
            trimmedLine.substring(0, 100) + (trimmedLine.length > 100 ? '...' : '')
          )

          if (trimmedLine.startsWith('0:')) {
            let content = trimmedLine.slice(2)
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1)
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n')
            finalText += content
          } else if (trimmedLine.startsWith('1:')) {
            let content = trimmedLine.slice(2)
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1)
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n')
            finalText += content
          } else if (trimmedLine.startsWith('f:')) {
            const metadata: unknown = JSON.parse(trimmedLine.slice(2))
            console.log('Received metadata:', metadata)
          } else if (trimmedLine.startsWith('9:')) {
            const toolCall: unknown = JSON.parse(trimmedLine.slice(2))
            console.log('Tool call detected:', getProp(toolCall, 'toolName'))
          } else if (trimmedLine.startsWith('a:')) {
            const toolResult: unknown = JSON.parse(trimmedLine.slice(2))
            toolResults.push(toolResult)
          } else if (trimmedLine.startsWith('e:')) {
            const endData: unknown = JSON.parse(trimmedLine.slice(2))
            const finishReason = getProp(endData, 'finishReason')
            if (finishReason !== 'stop') {
              console.warn('Stream ended unexpectedly:', finishReason)
            }
          } else if (trimmedLine.startsWith('data:')) {
            const payload = trimmedLine.slice(5).trim()
            if (payload && payload !== '[DONE]') {
              try {
                const parsedChunk = uiStreamChunkSchema.safeParse(JSON.parse(payload))
                if (!parsedChunk.success) continue
                const chunk = parsedChunk.data
                switch (chunk.type) {
                  case 'text-delta':
                    finalText += chunk.delta || ''
                    break
                  case 'reasoning-delta':
                    // reasoning chunks are informational for Discord; ignore for now
                    break
                  case 'tool-result':
                    toolResults.push(chunk)
                    break
                  case 'error':
                    error = error || chunk.error || chunk.errorText || null
                    break
                }
              } catch {
                // ignore malformed SSE payloads
              }
            }
          } else if (trimmedLine.startsWith('d:')) {
            try {
              const data: unknown = JSON.parse(trimmedLine.slice(2))
              const dataText = getProp(data, 'text')
              const dataContent = getProp(data, 'content')
              if (dataText) {
                finalText += String(dataText)
              } else if (dataContent) {
                finalText += String(dataContent)
              } else if (typeof data === 'string') {
                finalText += data
              }
            } catch {
              const rawContent = trimmedLine.slice(2)
              if (rawContent && rawContent !== '{}') {
                finalText += rawContent
              }
            }
          } else if (
            trimmedLine.startsWith('2:') ||
            trimmedLine.startsWith('3:') ||
            trimmedLine.startsWith('4:')
          ) {
            let content = trimmedLine.slice(2)
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1)
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n')
            if (content && content.trim() !== '') {
              finalText += content
            }
          }
        } catch (parseError) {
          console.warn(
            'Failed to parse line:',
            line.substring(0, 100),
            errorMessage(parseError)
          )
        }
      }

      // Last-gasp fallback: scrape any text-delta payloads in the entire stream
      if (!finalText.trim()) {
        const regexDelta =
          this.extractTextDeltas(rawText) || this.extractTextDeltas(rawText.replace(/\\"/g, '"'))
        if (regexDelta) {
          console.log('Recovered text from regex fallback')
          finalText += regexDelta
        }
      }

      if (!finalText.trim()) {
        console.log('No text content found, checking tool results...')
        for (const result of toolResults) {
          const inner = getProp(result, 'result')
          const formattedContent = getProp(inner, 'formatted_content')
          const summary = getProp(inner, 'summary')
          if (formattedContent) {
            finalText += String(formattedContent) + '\n'
          } else if (summary) {
            finalText += String(summary) + '\n'
          }
        }
      }

      if (!finalText.trim() && lines.some((line: string) => line.includes('completionTokens'))) {
        console.warn('API completed successfully but returned no text content')
        console.log('Full response for debugging:', rawText)
        finalText =
          'I processed your request but the response was empty. This might be a temporary issue with the AI service. Please try again.'
      }

      finalText = finalText.trim()

      console.log('Parsed response length:', finalText.length)
      console.log('Response preview:', finalText.substring(0, 100) + '...')

      return {
        text:
          finalText ||
          "I received your message but couldn't generate a proper response. Please try again.",
        reasoning: '',
        toolResults,
        error: error || undefined,
      }
    } catch (error) {
      console.error('Failed to parse streaming response:', error)
      return {
        text: 'Sorry, I encountered an error processing your request. Please try again later.',
        reasoning: '',
        toolResults: [],
        error: errorMessage(error),
      }
    }
  }

  /**
   * Read the (web stream) response body as UTF-8 text.
   */
  private async readTextStream(response: Response): Promise<string> {
    if (!response.body) return ''

    let result = ''
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      result += value
    }

    return result
  }

  /**
   * Parse AI SDK UI SSE stream for reasoning + text deltas.
   */
  private parseUIStream(rawText: string): { text: string; reasoning: string } {
    // Robust per-line parser; handles SSE payload even if content-type wasn't SSE
    const lines = rawText.split(/\r?\n/)
    let reasoning = ''
    let text = ''
    const toolResults: unknown[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(payload)
      } catch {
        continue
      }
      const parsedChunk = uiStreamChunkSchema.safeParse(parsedJson)
      if (!parsedChunk.success) continue
      const chunk = parsedChunk.data

      switch (chunk.type) {
        case 'reasoning-delta':
          reasoning += chunk.delta || ''
          break
        case 'text-delta':
          text += chunk.delta || ''
          break
        case 'tool-result':
          toolResults.push(chunk)
          break
        case 'error':
          console.error('stream error chunk:', chunk.errorText || chunk.error)
          break
        default:
          break
      }
    }

    let finalText = text.trim()
    if (!finalText && toolResults.length > 0) {
      for (const tr of toolResults) {
        const result = getProp(tr, 'result') || getProp(tr, 'data') || tr
        const candidate =
          getProp(result, 'formatted_content') ||
          getProp(result, 'summary') ||
          getProp(result, 'content') ||
          getProp(result, 'text')
        if (candidate && typeof candidate === 'string') {
          finalText = candidate.trim()
          if (finalText) break
        }
      }
    }

    if (!finalText) {
      const regexDelta =
        this.extractTextDeltas(rawText) || this.extractTextDeltas(rawText.replace(/\\"/g, '"'))
      if (regexDelta) finalText = regexDelta.trim()
    }

    return { text: finalText, reasoning: reasoning.trim() }
  }

  private extractTextDeltas(rawText: string): string {
    // Capture any text-delta blocks even when other quoted fields appear between type and delta
    const matches = [
      ...rawText.matchAll(/"type"\s*:\s*"text-delta"[\s\S]*?"delta"\s*:\s*"([^"]*)"/g),
    ]
    if (!matches.length) return ''
    return matches.map(m => (m[1] || '').replace(/\\\\n/g, '\n')).join('')
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/whatsapp-bot`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'the-everything-assistant-bot/1.0.0',
        },
      })

      return response.ok
    } catch (error) {
      console.error('Health check failed:', error)
      return false
    }
  }

  async sendFeedback(interactionId: string, feedback: unknown): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'the-everything-assistant-bot/1.0.0',
        },
        body: JSON.stringify({
          interactionId,
          feedback,
          source: 'discord',
        }),
      })

      return response.ok
    } catch (error) {
      console.error('Failed to send feedback:', error)
      return false
    }
  }
}

export default APIClient
