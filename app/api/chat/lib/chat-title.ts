import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { extractTitleFromContent } from '@/lib/utils'
import { getModelConfig } from '@/lib/model-registry'

export async function generateChatTitle(userMessage: string, userId?: string): Promise<string> {
  try {
    const cleanMessage = userMessage.trim().toLowerCase()
    if (cleanMessage.length < 10 || ['hi', 'hello', 'hey', 'test', 'help'].includes(cleanMessage)) {
      return extractTitleFromContent(userMessage)
    }

    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error('Title generation timeout')), 5000)
    )

    const chatTitleModel = getModelConfig('chatTitle')
    const providerClient = rateLimitedAI[chatTitleModel.provider as keyof typeof rateLimitedAI]
    if (!providerClient) {
      throw new Error(`Unsupported model provider for chat title: ${chatTitleModel.provider}`)
    }

    const modelPromise = providerClient.generateText(
      {
        model: await providerClient.model(chatTitleModel.modelId),
        prompt: `Generate a concise, descriptive title for a chat conversation based on the user's first message. The title should:
- Be 3-8 words maximum
- Capture the main topic or intent
- Be specific but not overly detailed
- Avoid generic phrases like "New Chat" or "User Question"
- Use title case formatting

User's first message: "${userMessage}"

Examples:
- "What's the mess menu today?" → "Today's Mess Menu"
- "How do I register for courses?" → "Course Registration Help"
- "Tell me about VIT placements" → "VIT Placement Information"
- "What are my exam schedules?" → "Exam Schedule Query"

Respond with ONLY the title, nothing else.`,
        maxOutputTokens: 50,
      },
      userId
    )

    const result = (await Promise.race([modelPromise, timeoutPromise])) as any
    const generatedTitle = result.text
    const cleanTitle = generatedTitle.trim().replace(/^['"]|['"]$/g, '')

    if (cleanTitle && cleanTitle.length <= 60 && cleanTitle.length >= 3) {
      return cleanTitle
    }

    return extractTitleFromContent(userMessage)
  } catch (error) {
    console.error('Title generation failed:', error instanceof Error ? error.message : String(error))
    return extractTitleFromContent(userMessage)
  }
}
