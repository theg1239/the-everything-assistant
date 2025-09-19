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

async function getOrCreateBotUser(source: string, userId: string, userName?: string) {
  const emailPrefix = source === 'whatsapp' ? 'whatsapp' : 'discord'
  const email = `${emailPrefix}-${userId}@${source}-bot.local`
  
  let user = await prisma.user.findFirst({
    where: {
      preferences: {
        path: [source, source === 'whatsapp' ? 'phoneNumber' : 'userId'],
        equals: userId
      }
    }
  })

  if (!user) {
    const name = userName || `${source.charAt(0).toUpperCase() + source.slice(1)} User ${userId.slice(-4)}`
    
    const preferences: any = {
      [source]: {
        ...(source === 'whatsapp' ? { phoneNumber: userId } : { userId }),
        joinedAt: new Date().toISOString(),
        [`is${source.charAt(0).toUpperCase() + source.slice(1)}User`]: true
      }
    }

    user = await prisma.user.create({
      data: {
        email,
        name,
        preferences
      }
    })
    
    console.log(`Created new ${source} user: ${name} (${userId})`)
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
    const { messages, message, source, userContext, userId, conversationHistory } = body

    // Handle different request formats
    let processedMessages: any[] = []
    let userMessage: string = ''
    let requestSource = source || 'whatsapp'
    let userInfo: any = {}

    if (message && typeof message === 'string') {
      // Discord format: { message, source: 'discord', userId, conversationHistory }
      userMessage = message
      requestSource = source || 'discord'
      userInfo = { userId, userName: userContext?.username }
      
      // Convert conversation history to messages format
      if (conversationHistory && Array.isArray(conversationHistory)) {
        processedMessages = conversationHistory.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          id: `${requestSource}-history-${msg.timestamp}-${Math.random().toString(36).substr(2, 6)}`
        }))
      }
      
      processedMessages.push({
        role: 'user',
        content: userMessage,
        id: `${requestSource}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      })
    } else if (messages && Array.isArray(messages) && messages.length > 0) {
      // WhatsApp format: { messages, source: 'whatsapp', userContext }
      processedMessages = messages
      const lastMessage = messages[messages.length - 1]
      
      if (!lastMessage || lastMessage.role !== 'user') {
        return NextResponse.json(
          { error: 'Last message must be from user' },
          { status: 400 }
        )
      }
      
      userMessage = lastMessage.content
      requestSource = source || 'whatsapp'
      
      if (requestSource === 'whatsapp' && userContext?.phoneNumber) {
        userInfo = { userId: userContext.phoneNumber, userName: userContext.userName }
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid request format: message or messages array required' },
        { status: 400 }
      )
    }

    // Get or create user for this bot request
    const user = await getOrCreateBotUser(requestSource, userInfo.userId, userInfo.userName)
    
    // Create a simple session-like object for the bot user
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
  <context>Saved information from previous ${requestSource} conversations:</context>
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
        console.error(`Failed to load memories for ${requestSource} user:`, error)
      }
    }

    const tools = createVITTools(user.id)

    // Create context-specific system prompt
    const contextPrompt = requestSource === 'whatsapp' 
      ? `<whatsapp_context>
This conversation is happening via WhatsApp. The user is messaging through WhatsApp Web.
- Keep responses concise and mobile-friendly
- Use emojis appropriately for WhatsApp
- Break long responses into shorter messages
- Be conversational and helpful
- User: ${userInfo.userName || 'WhatsApp User'} (${userInfo.userId})
</whatsapp_context>`
      : `<discord_context>
This conversation is happening via Discord. The user is using slash commands.
- keep responses concise and lowercase (except proper nouns and course codes)
- no emojis
- be conversational and helpful
- user: ${userInfo.userName || 'Discord User'} (${userInfo.userId})
</discord_context>`

    const systemPrompt = `${VIT_SYSTEM_PROMPT}

${contextPrompt}

${memoryContext ? `\n\n<memory_context>\n  <instructions>Use the following information to provide more personalized and relevant responses.</instructions>\n  ${memoryContext}\n</memory_context>` : ''}

CRITICAL TOOL CONTINUATION RULES:
- YOU MUST NEVER STOP AFTER CALLING A TOOL
- Tool calls are ONLY information gathering steps, NOT final responses
- After ANY tool call, you MUST immediately continue with a natural response
- When you call a tool, that's step 1 - step 2 is ALWAYS providing your answer using that information
- The conversation flow is: [user question] → [tool call] → [YOUR RESPONSE USING TOOL RESULTS]`

    const finalMessagesForAI = [
      { role: 'system', content: systemPrompt },
      ...processedMessages
    ]

    const reasoningMiddleware = extractReasoningMiddleware({
      tagName: 'reasoning',
    })

    // Process the request through the AI system
    const resultStream = await rateLimitedAI.google.streamText(
      {
        model: await rateLimitedAI.google.model('gemini-2.5-flash'),
        messages: finalMessagesForAI,
        tools,
        temperature: 0.7,
        maxTokens: requestSource === 'whatsapp' ? 2048 : 4096,
        experimental_transform: smoothStream({ chunking: 'word' }),
        middleware: [reasoningMiddleware],
        maxSteps: 3,
        experimental_continueSteps: true,
        onStepFinish: async ({ usage, stepIndex }: any) => {
          try {
            if (usage && typeof usage === 'object') {
              const { saveTokenUsage } = await import('@/lib/db')
              await saveTokenUsage({
                userId: user.id,
                chatId: null, // No specific chat for bot users
                model: 'gemini-2.5-flash',
                stepIndex: typeof stepIndex === 'number' ? stepIndex : null,
                promptTokens: usage.promptTokens || 0,
                completionTokens: usage.completionTokens || 0,
                totalTokens:
                  usage.totalTokens || (usage.promptTokens || 0) + (usage.completionTokens || 0),
                meta: { source: requestSource, userId: userInfo.userId },
              })
            }
          } catch (e) {
            console.warn(`Failed to persist ${requestSource} usage:`, e)
          }
        }
      },
      user.id
    )

    // Return the streaming response
    return resultStream.toDataStreamResponse({
      headers: {
        'X-Source': requestSource,
        'X-User-Id': user.id,
        'X-Bot-User-Id': userInfo.userId
      }
    })

  } catch (error: any) {
    console.error('Bot API error:', error)

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

// Health check endpoint for bot services
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
      service: 'bot-api',
      supports: ['whatsapp', 'discord'],
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