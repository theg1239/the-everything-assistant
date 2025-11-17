const fetch = require('node-fetch')

class APIClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl
    this.apiKey = apiKey
  }

  async sendChatRequest(userQuestion, userContext = {}, conversationHistory = []) {
    try {
      // Build messages array with conversation history
      const messages = []

      // Add conversation history (limit to prevent token overflow)
      const recentHistory = conversationHistory.slice(-5) // Only last 5 messages
      for (const historyItem of recentHistory) {
        messages.push({
          role: historyItem.role,
          content: historyItem.content,
          id: `wa-history-${historyItem.timestamp}-${Math.random().toString(36).substr(2, 6)}`,
        })
      }

      // Add current user question
      messages.push({
        role: 'user',
        content: userQuestion,
        id: `wa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      })

      console.log(
        `📋 Sending ${messages.length} messages (${recentHistory.length} history + 1 current)`
      )

      const response = await fetch(`${this.baseUrl}/api/whatsapp-bot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'WhatsApp-Bot-Service/1.0.0',
        },
        body: JSON.stringify({
          messages,
          source: 'whatsapp',
          userContext,
        }),
        timeout: 30000, // 30 second timeout
      })

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`)
      }

      const result = await this.parseStreamingResponse(response)

      // If we got an empty response and we included history, try without history
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
      const text = await response.text()
      console.log('📥 Raw API response:', text.substring(0, 400) + '...')
      console.log('📊 Response length:', text.length)

      const lines = text.split('\n').filter(line => line.trim())
      console.log('📝 Total lines:', lines.length)

      let finalText = ''
      let toolResults = []
      let error = null

      for (const line of lines) {
        try {
          console.log(
            '🔍 Processing line:',
            line.substring(0, 100) + (line.length > 100 ? '...' : '')
          )

          // Handle different streaming response formats
          if (line.startsWith('0:')) {
            // Text content - handle both quoted and unquoted formats
            let content = line.slice(2)
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1)
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n')
            finalText += content
          } else if (line.startsWith('1:')) {
            // Alternative text format
            let content = line.slice(2)
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1)
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n')
            finalText += content
          } else if (line.startsWith('f:')) {
            // Function/metadata response format
            const metadata = JSON.parse(line.slice(2))
            console.log('📋 Received metadata:', metadata)
          } else if (line.startsWith('9:')) {
            // Tool call
            const toolCall = JSON.parse(line.slice(2))
            console.log('🔧 Tool call detected:', toolCall.toolName)
          } else if (line.startsWith('a:')) {
            // Tool result
            const toolResult = JSON.parse(line.slice(2))
            toolResults.push(toolResult)
          } else if (line.startsWith('e:')) {
            // End of stream
            const endData = JSON.parse(line.slice(2))
            if (endData.finishReason !== 'stop') {
              console.warn('⚠️ Stream ended unexpectedly:', endData.finishReason)
            }
          } else if (line.startsWith('d:')) {
            // Data chunk format
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
              // Not JSON, treat as raw text
              const rawContent = line.slice(2)
              if (rawContent && rawContent !== '{}') {
                finalText += rawContent
              }
            }
          } else if (line.startsWith('2:') || line.startsWith('3:') || line.startsWith('4:')) {
            // Additional text content formats
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
          console.warn('⚠️ Failed to parse line:', line.substring(0, 100), parseError.message)
        }
      }

      // If no direct text found, try to extract from tool results
      if (!finalText.trim()) {
        console.log('⚠️ No text content found, checking tool results...')
        for (const result of toolResults) {
          if (result.result && result.result.formatted_content) {
            finalText += result.result.formatted_content + '\n'
          } else if (result.result && result.result.summary) {
            finalText += result.result.summary + '\n'
          }
        }
      }

      // If still no content and we have completion stats, this might be an API issue
      if (!finalText.trim() && lines.some(line => line.includes('completionTokens'))) {
        console.warn('⚠️ API completed successfully but returned no text content')
        console.log('📋 Full response for debugging:', text)
        finalText =
          'I processed your request but the response was empty. This might be a temporary issue with the AI service. Please try again.'
      }

      // Clean up the final text
      finalText = finalText.trim()

      console.log('✅ Parsed response length:', finalText.length)
      console.log('📄 Response preview:', finalText.substring(0, 100) + '...')

      return {
        text:
          finalText ||
          "I received your message but couldn't generate a proper response. Please try again.",
        toolResults,
        error,
      }
    } catch (error) {
      console.error('❌ Failed to parse streaming response:', error)
      return {
        text: 'Sorry, I encountered an error processing your request. Please try again later.',
        toolResults: [],
        error: error.message,
      }
    }
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
}

module.exports = APIClient
