import fetch from 'node-fetch'

interface ConversationHistory {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface APIResponse {
  text: string
  reasoning?: string
  toolResults: any[]
  error?: string
}

class APIClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl
    this.apiKey = apiKey
  }

  async sendChatRequest(
    userQuestion: string,
    userContext: any = {},
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
        // @ts-ignore - node-fetch types issue
        timeout: 30000,
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

  private async parseStreamingResponse(response: any): Promise<APIResponse> {
    try {
      const rawText = await this.readTextStream(response)
      console.log('raw api response:', rawText.substring(0, 400) + '...')
      console.log('response length:', rawText.length)

      const contentType = (response.headers.get('content-type') || '').toLowerCase()
      const isSse = contentType.includes('text/event-stream')

      if (isSse) {
        const { text, reasoning } = this.parseUIStream(rawText)
        return {
          text:
            text ||
            "I received your message but couldn't generate a proper response. Please try again.",
          reasoning,
          toolResults: [],
          error: undefined,
        }
      }

      // Heuristic: if body contains SSE-style "data: {\"type\":\"text-delta\"...}"
      if (rawText.includes('"type":"text-delta"') || rawText.includes('data: {"type":"text-')) {
        const { text, reasoning } = this.parseUIStream(rawText)
        if (text || reasoning) {
          return {
            text:
              text ||
              "I received your message but couldn't generate a proper response. Please try again.",
            reasoning,
            toolResults: [],
            error: undefined,
          }
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
      let toolResults: any[] = []
      let error: string | null = null

      for (const line of lines) {
        try {
          console.log('processing line:', line.substring(0, 100) + (line.length > 100 ? '...' : ''))

          if (line.startsWith('0:')) {
            let content = line.slice(2)
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1)
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n')
            finalText += content
          } else if (line.startsWith('1:')) {
            let content = line.slice(2)
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1)
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n')
            finalText += content
          } else if (line.startsWith('f:')) {
            const metadata = JSON.parse(line.slice(2))
            console.log('Received metadata:', metadata)
          } else if (line.startsWith('9:')) {
            const toolCall = JSON.parse(line.slice(2))
            console.log('Tool call detected:', toolCall.toolName)
          } else if (line.startsWith('a:')) {
            const toolResult = JSON.parse(line.slice(2))
            toolResults.push(toolResult)
          } else if (line.startsWith('e:')) {
            const endData = JSON.parse(line.slice(2))
            if (endData.finishReason !== 'stop') {
              console.warn('Stream ended unexpectedly:', endData.finishReason)
            }
          } else if (line.startsWith('d:')) {
            try {
              const data = JSON.parse(line.slice(2))
              if (data.text) {
                finalText += data.text
              } else if (data.content) {
                finalText += data.content
              } else if (typeof data === 'string') {
                finalText += data
              }
            } catch (e) {
              const rawContent = line.slice(2)
              if (rawContent && rawContent !== '{}') {
                finalText += rawContent
              }
            }
          } else if (line.startsWith('2:') || line.startsWith('3:') || line.startsWith('4:')) {
            let content = line.slice(2)
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
            (parseError as Error).message
          )
        }
      }

      if (!finalText.trim()) {
        console.log('No text content found, checking tool results...')
        for (const result of toolResults) {
          if (result.result && result.result.formatted_content) {
            finalText += result.result.formatted_content + '\n'
          } else if (result.result && result.result.summary) {
            finalText += result.result.summary + '\n'
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
        error: (error as Error).message,
      }
    }
  }

  /**
   * Read response body as UTF-8 text, supporting both web streams and Node readable streams.
   */
  private async readTextStream(response: any): Promise<string> {
    if (!response?.body) return ''

    const decoder = new TextDecoder()
    let result = ''

    const hasTDS = typeof (globalThis as any).TextDecoderStream === 'function'
    if (typeof (response.body as any).getReader === 'function' && hasTDS) {
      const reader = (response.body as any)
        .pipeThrough(new (globalThis as any).TextDecoderStream())
        .getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        result += value
      }
    } else {
      for await (const chunk of response.body as any) {
        result += decoder.decode(chunk, { stream: true })
      }
      result += decoder.decode()
    }

    return result
  }

  /**
   * Parse AI SDK UI SSE stream for reasoning + text deltas.
   */
  private parseUIStream(rawText: string): { text: string; reasoning: string } {
    const events = rawText.split('\n\n').filter(Boolean)
    let reasoning = ''
    let text = ''
    const toolResults: any[] = []

    for (const event of events) {
      for (const line of event.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload) continue

        let chunk: any
        try {
          chunk = JSON.parse(payload)
        } catch {
          continue
        }

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
    }

    let finalText = text.trim()
    if (!finalText && toolResults.length > 0) {
      for (const tr of toolResults) {
        const result = tr.result || tr.data || tr
        const candidate =
          result?.formatted_content || result?.summary || result?.content || result?.text
        if (candidate && typeof candidate === 'string') {
          finalText = candidate.trim()
          if (finalText) break
        }
      }
    }

    return { text: finalText, reasoning: reasoning.trim() }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/whatsapp-bot`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'the-everything-assistant-bot/1.0.0',
        },
        // @ts-ignore
        timeout: 5000,
      })

      return response.ok
    } catch (error) {
      console.error('Health check failed:', error)
      return false
    }
  }

  async sendFeedback(interactionId: string, feedback: any): Promise<boolean> {
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
        // @ts-ignore
        timeout: 10000,
      })

      return response.ok
    } catch (error) {
      console.error('Failed to send feedback:', error)
      return false
    }
  }
}

export default APIClient
