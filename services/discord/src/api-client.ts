import fetch from 'node-fetch';

interface ConversationHistory {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface APIResponse {
  text: string;
  toolResults: any[];
  error?: string;
}

class APIClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async sendChatRequest(
    userQuestion: string, 
    userContext: any = {}, 
    conversationHistory: ConversationHistory[] = []
  ): Promise<APIResponse> {
    try {
      const messages: any[] = [];
      
      const recentHistory = conversationHistory.slice(-5);
      for (const historyItem of recentHistory) {
        messages.push({
          role: historyItem.role,
          content: historyItem.content,
          id: `discord-history-${historyItem.timestamp}-${Math.random().toString(36).substr(2, 6)}`
        });
      }
      
      messages.push({
        role: 'user',
        content: userQuestion,
        id: `discord-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });

      console.log(`sending ${messages.length} messages (${recentHistory.length} history + 1 current)`);

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'the-everything-assistant-bot/1.0.0'
        },
        body: JSON.stringify({
          message: userQuestion,
          source: 'discord',
          userId: userContext.userId || 'discord-user',
          conversationHistory: recentHistory
        }),
        // @ts-ignore - node-fetch types issue
        timeout: 30000
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const result = await this.parseStreamingResponse(response);
      
        if ((!result.text || result.text.includes('couldn\'t generate a proper response')) && recentHistory.length > 0) {
        console.log('retrying request without conversation history...');
        return await this.sendChatRequest(userQuestion, userContext, []);
      }      return result;

    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  private async parseStreamingResponse(response: any): Promise<APIResponse> {
    try {
      const text = await response.text();
      console.log('raw api response:', text.substring(0, 400) + '...');
      console.log('response length:', text.length);
      
      const lines = text.split('\n').filter((line: string) => line.trim());
      console.log('total lines:', lines.length);
      
      let finalText = '';
      let toolResults: any[] = [];
      let error: string | null = null;

      for (const line of lines) {
        try {
          console.log('processing line:', line.substring(0, 100) + (line.length > 100 ? '...' : ''));
          
          if (line.startsWith('0:')) {
            let content = line.slice(2);
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1);
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n');
            finalText += content;
          } else if (line.startsWith('1:')) {
            let content = line.slice(2);
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1);
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n');
            finalText += content;
          } else if (line.startsWith('f:')) {
            const metadata = JSON.parse(line.slice(2));
            console.log('Received metadata:', metadata);
          } else if (line.startsWith('9:')) {
            const toolCall = JSON.parse(line.slice(2));
            console.log('Tool call detected:', toolCall.toolName);
          } else if (line.startsWith('a:')) {
            const toolResult = JSON.parse(line.slice(2));
            toolResults.push(toolResult);
          } else if (line.startsWith('e:')) {
            const endData = JSON.parse(line.slice(2));
            if (endData.finishReason !== 'stop') {
              console.warn('Stream ended unexpectedly:', endData.finishReason);
            }
          } else if (line.startsWith('d:')) {
            try {
              const data = JSON.parse(line.slice(2));
              if (data.text) {
                finalText += data.text;
              } else if (data.content) {
                finalText += data.content;
              } else if (typeof data === 'string') {
                finalText += data;
              }
            } catch (e) {
              const rawContent = line.slice(2);
              if (rawContent && rawContent !== '{}') {
                finalText += rawContent;
              }
            }
          } else if (line.startsWith('2:') || line.startsWith('3:') || line.startsWith('4:')) {
            let content = line.slice(2);
            if (content.startsWith('"') && content.endsWith('"')) {
              content = content.slice(1, -1);
            }
            content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n');
            if (content && content.trim() !== '') {
              finalText += content;
            }
          }
        } catch (parseError) {
          console.warn('Failed to parse line:', line.substring(0, 100), (parseError as Error).message);
        }
      }

      if (!finalText.trim()) {
        console.log('No text content found, checking tool results...');
        for (const result of toolResults) {
          if (result.result && result.result.formatted_content) {
            finalText += result.result.formatted_content + '\n';
          } else if (result.result && result.result.summary) {
            finalText += result.result.summary + '\n';
          }
        }
      }

      if (!finalText.trim() && lines.some((line: string) => line.includes('completionTokens'))) {
        console.warn('API completed successfully but returned no text content');
        console.log('Full response for debugging:', text);
        finalText = 'I processed your request but the response was empty. This might be a temporary issue with the AI service. Please try again.';
      }

      finalText = finalText.trim();
      
      console.log('Parsed response length:', finalText.length);
      console.log('Response preview:', finalText.substring(0, 100) + '...');

      return {
        text: finalText || 'I received your message but couldn\'t generate a proper response. Please try again.',
        toolResults,
        error: error || undefined
      };

    } catch (error) {
      console.error('Failed to parse streaming response:', error);
      return {
        text: 'Sorry, I encountered an error processing your request. Please try again later.',
        toolResults: [],
        error: (error as Error).message
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/whatsapp-bot`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'the-everything-assistant-bot/1.0.0'
        },
        // @ts-ignore
        timeout: 5000
      });

      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  async sendFeedback(interactionId: string, feedback: any): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'the-everything-assistant-bot/1.0.0'
        },
        body: JSON.stringify({
          interactionId,
          feedback,
          source: 'discord'
        }),
        // @ts-ignore
        timeout: 10000
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to send feedback:', error);
      return false;
    }
  }
}

export default APIClient;