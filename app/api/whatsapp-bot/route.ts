import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function validateAPIKey(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const apiKey = process.env.WHATSAPP_BOT_API_KEY
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false
  }
  
  const token = authHeader.slice(7)
  return token === apiKey
}

async function getOrCreateWhatsAppUser(phoneNumber: string, userName?: string) {
  let user = await prisma.user.findFirst({
    where: {
      preferences: {
        path: ['whatsapp', 'phoneNumber'],
        equals: phoneNumber
      }
    }
  })

  if (!user) {
    const email = `whatsapp-${phoneNumber}@wa-bot.local`
    const name = userName || `WhatsApp User ${phoneNumber.slice(-4)}`
    
    user = await prisma.user.create({
      data: {
        email,
        name,
        preferences: {
          whatsapp: {
            phoneNumber,
            joinedAt: new Date().toISOString(),
            isWhatsAppUser: true
          }
        }
      }
    })
    
    console.log(`Created new WhatsApp user: ${name} (${phoneNumber})`)
  }

  return user
}

export async function POST(request: NextRequest) {
  try {
    if (!validateAPIKey(request)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { messages, source, userContext } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request format: messages array required' },
        { status: 400 }
      )
    }

    const userMessage = messages[messages.length - 1]
    if (!userMessage || userMessage.role !== 'user') {
      return NextResponse.json(
        { error: 'Last message must be from user' },
        { status: 400 }
      )
    }

    if (source === 'whatsapp' && userContext?.phoneNumber) {
      const { phoneNumber, userName } = userContext
      
      // Get or create user for this WhatsApp number
      const user = await getOrCreateWhatsAppUser(phoneNumber, userName)
      
      // Create a simple session-like object for the WhatsApp user
      const fakeSession = {
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      }

      // Import the chat processing logic
      const { rateLimitedAI } = await import('@/lib/rate-limited-ai')
      const { createVITTools } = await import('@/lib/tools')
      const { VIT_SYSTEM_PROMPT } = await import('@/lib/prompts')
      const { memoryService } = await import('@/lib/memory/memory-service')
      const { smoothStream, extractReasoningMiddleware } = await import('ai')

      const memorySettings = await memoryService.getUserMemorySettings(user.id)
      const isMemoryEnabled = memorySettings?.isEnabled ?? true

      let memoryContext = ''
      if (isMemoryEnabled) {
        try {
          const memories = await memoryService.getUserMemories(user.id, { pageSize: 50 })
          if (memories.length > 0) {
            memoryContext = `
<memories>
  <context>Saved information from previous WhatsApp conversations:</context>
  <memory_list>
${memories
  .map(
    (m: { content: string; updatedAt: string | number | Date }) =>
      `    <memory>
      <content>${m.content}</content>
      <last_updated>${new Date(m.updatedAt).toLocaleDateString()}</last_updated>
    </memory>`
  )
  .join('\n')}
  </memory_list>
</memories>`
          }
        } catch (error) {
          console.error('Failed to load memories for WhatsApp user:', error)
        }
      }

      const tools = createVITTools(user.id)

      const systemPrompt = `${VIT_SYSTEM_PROMPT}

<whatsapp_context>
This conversation is happening via WhatsApp. The user is messaging through WhatsApp Web.
- Keep responses concise and mobile-friendly
- Use emojis appropriately for WhatsApp
- Break long responses into shorter messages
- Be conversational and helpful
- User: ${userName || 'WhatsApp User'} (${phoneNumber})
</whatsapp_context>

${memoryContext ? `\n\n<memory_context>\n  <instructions>Use the following information to provide more personalized and relevant responses.</instructions>\n  ${memoryContext}\n</memory_context>` : ''}

CRITICAL TOOL CONTINUATION RULES:
- YOU MUST NEVER STOP AFTER CALLING A TOOL
- Tool calls are ONLY information gathering steps, NOT final responses
- After ANY tool call, you MUST immediately continue with a natural response
- When you call a tool, that's step 1 - step 2 is ALWAYS providing your answer using that information
- The conversation flow is: [user question] → [tool call] → [YOUR RESPONSE USING TOOL RESULTS]`

      const finalMessages = [
        { role: 'system', content: systemPrompt },
        ...messages
      ]

      const reasoningMiddleware = extractReasoningMiddleware({
        tagName: 'reasoning',
      })

      // Process the request through the AI system
      const resultStream = await rateLimitedAI.google.streamText(
        {
          model: await rateLimitedAI.google.model('gemini-2.5-flash'),
          messages: finalMessages,
          tools,
          temperature: 0.7,
          maxTokens: 2048, // Shorter for WhatsApp
          experimental_transform: smoothStream({ chunking: 'word' }),
          middleware: [reasoningMiddleware],
          maxSteps: 3, // Reduced steps for faster response
          experimental_continueSteps: true,
          onStepFinish: async ({ usage, stepIndex }: any) => {
            try {
              if (usage && typeof usage === 'object') {
                const { saveTokenUsage } = await import('@/lib/db')
                await saveTokenUsage({
                  userId: user.id,
                  chatId: null, // No specific chat for WhatsApp
                  model: 'gemini-2.5-flash',
                  stepIndex: typeof stepIndex === 'number' ? stepIndex : null,
                  promptTokens: usage.promptTokens || 0,
                  completionTokens: usage.completionTokens || 0,
                  totalTokens:
                    usage.totalTokens || (usage.promptTokens || 0) + (usage.completionTokens || 0),
                  meta: { source: 'whatsapp', phoneNumber },
                })
              }
            } catch (e) {
              console.warn('Failed to persist WhatsApp usage:', e)
            }
          }
        },
        user.id
      )

      // Return the streaming response
      return resultStream.toDataStreamResponse({
        headers: {
          'X-Source': 'whatsapp',
          'X-User-Id': user.id,
          'X-Phone-Number': phoneNumber
        }
      })
    }

    // Fallback for non-WhatsApp requests
    return NextResponse.json(
      { error: 'This endpoint is specifically for WhatsApp bot integration' },
      { status: 400 }
    )

  } catch (error: any) {
    console.error('WhatsApp bot API error:', error)

    if (error.message?.includes('rate limit')) {
      return NextResponse.json(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'The model is currently overloaded. Please try again later.',
          type: 'model_rate_limit',
        },
        { status: 429 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

// Health check endpoint for the WhatsApp bot service
export async function GET(request: NextRequest) {
  try {
    // Validate API key
    if (!validateAPIKey(request)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      status: 'ok',
      service: 'whatsapp-bot-api',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Health check failed' },
      { status: 500 }
    )
  }
}