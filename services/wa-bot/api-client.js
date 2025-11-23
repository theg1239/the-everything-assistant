const fetch = require('node-fetch')
const crypto = require('crypto')

class APIClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl
    this.apiKey = apiKey
    this.signingSecret = process.env.MAIN_APP_SIGNING_SECRET || process.env.WA_SIGNING_SECRET
  }

  async sendChatRequest(userQuestion, userContext = {}, conversationHistory = []) {
    try {
      const messages = []

      const recentHistory = conversationHistory.slice(-5)
      for (const historyItem of recentHistory) {
        messages.push({
          role: historyItem.role,
          content: historyItem.content,
          id: `wa-history-${historyItem.timestamp}-${Math.random().toString(36).substr(2, 6)}`,
        })
      }

      messages.push({
        role: 'user',
        content: userQuestion,
        id: `wa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      })

      console.log(
        `📋 Sending ${messages.length} messages (${recentHistory.length} history + 1 current)`
      )

      const body = JSON.stringify({
        messages,
        source: 'whatsapp',
        userContext,
      })

      const timestamp = Date.now().toString()
      const signature =
        this.signingSecret && userContext.phoneNumber
          ? crypto
              .createHmac('sha256', this.signingSecret)
              .update(`${timestamp}.${body}`)
              .digest('hex')
          : undefined

      const headers = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, text/plain',
          'X-WABA-UI-STREAM': '1', // ask server for UI stream so we can capture reasoning
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'WhatsApp-Bot-Service/1.0.0',
        },
        body,
        timeout: 30000, // 30 second timeout
      }

      if (signature) {
        headers.headers['X-WA-Timestamp'] = timestamp
        headers.headers['X-WA-Signature'] = signature
        headers.headers['X-WA-Phone'] = userContext.phoneNumber
      }

      const response = await fetch(`${this.baseUrl}/api/whatsapp-bot`, headers)

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`)
      }

      const result = await this.parseStreamingResponse(response)

      if (
        (!result.text || result.text.includes("couldn't generate a proper response")) &&
        recentHistory.length > 0
      ) {
        console.log('🔄 Retrying request without conversation history...')
        return await this.sendChatRequest(userQuestion, userContext, [])
      }

      return result
    } catch (error) {
      console.error('API request failed:', error)
      throw error
    }
  }

  async parseStreamingResponse(response) {
    try {
      const rawText = await this.readTextStream(response)
      console.log('📥 Raw API response:', rawText.substring(0, 400) + '...')
      console.log('📊 Response length:', rawText.length)

      const contentType = (response.headers.get('content-type') || '').toLowerCase()
      const isSse = contentType.includes('text/event-stream')

      if (isSse || rawText.includes('data:')) {
        const { text, reasoning, toolResults } = this.parseUIStream(rawText)
        if (text || reasoning || (toolResults || []).length) {
          const enriched = text || this.extractMessageFromToolResults(toolResults)
          return {
            text:
              enriched ||
              "I received your message but couldn't generate a proper response. Please try again.",
            reasoning: reasoning || '',
            toolResults: toolResults || [],
            error: null,
          }
        }
        const regexText = this.extractTextDeltas(rawText)
        if (regexText) {
          return {
            text: regexText,
            reasoning: '',
            toolResults: [],
            error: null,
          }
        }
      }

      // Fast path for the new AI SDK text stream (plain text, no prefixes)
      const textFromPlainStream = rawText.trim()
      if (!isSse && textFromPlainStream && !/^[0-4aefd]:/.test(textFromPlainStream.split('\n')[0] || '')) {
        console.log('🆕 Parsed plain text stream response')
        return { text: textFromPlainStream, reasoning: '', toolResults: [], error: null }
      }

      // Legacy parser (kept for backwards compatibility with numbered data streams)
      const lines = rawText.split('\n').filter(line => line.trim())
      console.log('📝 Total lines (legacy path):', lines.length)

    let finalText = ''
    let toolResults = []

    for (const line of lines) {
      const cleanedLine = (line || '').trim().startsWith('data:')
          ? line.trim().slice(5).trim()
          : line.trim()

        try {
          if (cleanedLine.startsWith('0:') || cleanedLine.startsWith('1:')) {
            let content = cleanedLine.slice(2)
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1)
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n')
            finalText += content
          } else if (cleanedLine.startsWith('f:')) {
            const metadata = JSON.parse(cleanedLine.slice(2))
            console.log('📋 Received metadata:', metadata)
          } else if (cleanedLine.startsWith('9:')) {
            const toolCall = JSON.parse(cleanedLine.slice(2))
            console.log('🔧 Tool call detected:', toolCall.toolName)
          } else if (cleanedLine.startsWith('a:')) {
            const toolResult = JSON.parse(cleanedLine.slice(2))
            toolResults.push(toolResult)
          } else if (cleanedLine.startsWith('e:')) {
            const endData = JSON.parse(cleanedLine.slice(2))
            if (endData.finishReason && endData.finishReason !== 'stop') {
              console.warn('⚠️ Stream ended unexpectedly:', endData.finishReason)
            }
          } else if (cleanedLine.startsWith('d:')) {
            try {
              const data = JSON.parse(cleanedLine.slice(2))
              if (data.text) {
                finalText += data.text
              } else if (data.content) {
                finalText += data.content
              } else if (typeof data === 'string') {
                finalText += data
              }
            } catch (e) {
              const rawContent = cleanedLine.slice(2)
              if (rawContent && rawContent !== '{}') {
                finalText += rawContent
              }
            }
          } else if (
            cleanedLine.startsWith('2:') ||
            cleanedLine.startsWith('3:') ||
            cleanedLine.startsWith('4:')
          ) {
            let content = cleanedLine.slice(2)
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1)
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n')
            if (content && content.trim() !== '') {
              finalText += content
            }
          }
        } catch (parseError) {
          console.warn('⚠️ Failed to parse line:', cleanedLine.substring(0, 100), parseError)
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
      for (const result of toolResults) {
        if (result?.result?.formatted_content) {
          finalText += result.result.formatted_content + '\n'
        } else if (result?.result?.summary) {
            finalText += result.result.summary + '\n'
          }
        }
      }

    const fallbackFromTool = this.extractMessageFromToolResults(toolResults)
    const safeText =
      finalText.trim() ||
      fallbackFromTool ||
      "I received your message but couldn't generate a proper response. Please try again."

    console.log('✅ Parsed response length:', safeText.length)
    console.log('📄 Response preview:', safeText.substring(0, 100) + '...')

    return {
      text: safeText,
      reasoning: '',
      toolResults,
      error: null,
    }
    } catch (error) {
      console.error('❌ Failed to parse streaming response:', error)
      return {
        text: 'Sorry, I encountered an error processing your request. Please try again later.',
        reasoning: '',
        toolResults: [],
        error: error.message,
      }
    }
  }

  async readTextStream(response) {
    if (!response?.body) {
      return ''
    }

    const decoder = new TextDecoder()
    let result = ''

    if (typeof response.body.getReader === 'function' && typeof TextDecoderStream === 'function') {
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        result += value
      }
    } else {
      for await (const chunk of response.body) {
        result += decoder.decode(chunk, { stream: true })
      }
      result += decoder.decode()
    }

    return result
  }

  /**
   * Parse UI message SSE stream produced by AI SDK createUIMessageStreamResponse.
   * Returns accumulated text (assistant answer) and reasoning (if streamed).
   */
  parseUIStream(rawText) {
    const lines = rawText.split(/\r?\n/)
    let reasoning = ''
    let text = ''
    const toolResults = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) {
        continue
      }
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let chunk
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
        case 'tool-output-available':
          toolResults.push(chunk)
          break
        case 'error':
          console.error('❌ Stream error chunk:', chunk.errorText || chunk.error)
          break
        default:
          break
      }
    }

    let finalText = (text || '').trim()
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

    if (!finalText) {
      const regexDelta =
        this.extractTextDeltas(rawText) || this.extractTextDeltas(rawText.replace(/\\"/g, '"'))
      if (regexDelta) finalText = regexDelta.trim()
    }

    return { text: finalText, reasoning: (reasoning || '').trim(), toolResults }
  }

  extractTextDeltas(rawText) {
    // Capture any text-delta blocks even when other quoted fields appear between type and delta
    const matches = [
      ...rawText.matchAll(/"type"\s*:\s*"text-delta"[\s\S]*?"delta"\s*:\s*"([^"]*)"/g),
    ]
    if (!matches.length) return ''
    return matches.map(m => (m[1] || '').replace(/\\\\n/g, '\n')).join('')
  }


  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/api/whatsapp-bot`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'WhatsApp-Bot-Service/1.0.0',
        },
        timeout: 5000,
      })

      return response.ok
    } catch (error) {
      console.error('Health check failed:', error)
      return false
    }
  }

  async sendFeedback(interactionId, feedback) {
    try {
      const response = await fetch(`${this.baseUrl}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'WhatsApp-Bot-Service/1.0.0',
        },
        body: JSON.stringify({
          interactionId,
          feedback,
          source: 'whatsapp',
        }),
        timeout: 10000,
      })

      return response.ok
    } catch (error) {
      console.error('Failed to send feedback:', error)
      return false
    }
  }

  extractMessageFromToolResults(toolResults = []) {
    for (const tr of toolResults) {
      const payload = tr?.result || tr?.data || tr
      if (!payload || typeof payload !== 'object') continue

      const candidates = [
        payload.message,
        payload.formatted_content,
        payload.summary,
        payload.content,
        payload.text,
        payload.error,
      ].filter(Boolean)

      if (candidates.length) {
        const first = candidates[0]
        return Array.isArray(first) ? JSON.stringify(first) : String(first)
      }
    }
    return ''
  }
}

module.exports = APIClient
