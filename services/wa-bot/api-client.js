const fetch = require('node-fetch');

class APIClient {
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }

    async sendChatRequest(userQuestion, userContext = {}) {
        try {
            const response = await fetch(`${this.baseUrl}/api/whatsapp-bot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'User-Agent': 'WhatsApp-Bot-Service/1.0.0'
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: 'user',
                            content: userQuestion,
                            id: `wa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
                        }
                    ],
                    source: 'whatsapp',
                    userContext
                }),
                timeout: 30000 // 30 second timeout
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }

            return await this.parseStreamingResponse(response);

        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    async parseStreamingResponse(response) {
        try {
            const text = await response.text();
            
            const lines = text.split('\n').filter(line => line.trim());
            let finalText = '';
            let toolResults = [];
            let error = null;

            for (const line of lines) {
                try {
                    if (line.startsWith('0:"')) {
                        const content = line.slice(3, -1).replace(/\\"/g, '"');
                        finalText += content;
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
                    }
                } catch (parseError) {
                    console.warn('Failed to parse line:', line, parseError.message);
                }
            }

            if (!finalText.trim()) {
                for (const result of toolResults) {
                    if (result.result && result.result.formatted_content) {
                        finalText += result.result.formatted_content + '\n';
                    } else if (result.result && result.result.summary) {
                        finalText += result.result.summary + '\n';
                    }
                }
            }

            return {
                text: finalText.trim() || 'I received your message but couldn\'t generate a proper response. Please try again.',
                toolResults,
                error
            };

        } catch (error) {
            console.error('Failed to parse streaming response:', error);
            return {
                text: 'Sorry, I encountered an error processing your request. Please try again later.',
                toolResults: [],
                error: error.message
            };
        }
    }

    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/api/whatsapp-bot`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'User-Agent': 'WhatsApp-Bot-Service/1.0.0'
                },
                timeout: 5000
            });

            return response.ok;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }

    async sendFeedback(interactionId, feedback) {
        try {
            const response = await fetch(`${this.baseUrl}/api/feedback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'User-Agent': 'WhatsApp-Bot-Service/1.0.0'
                },
                body: JSON.stringify({
                    interactionId,
                    feedback,
                    source: 'whatsapp'
                }),
                timeout: 10000
            });

            return response.ok;
        } catch (error) {
            console.error('Failed to send feedback:', error);
            return false;
        }
    }
}

module.exports = APIClient;