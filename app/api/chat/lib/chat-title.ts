import { generateText } from 'ai'

import { defaultProviderOptions, languageModel } from '@/lib/ai'
import { extractTitleFromContent } from '@/lib/utils'
import { enforceUserRateLimit } from '@/lib/user-rate-limiter'

const TITLE_TIMEOUT_MS = 5000

export async function generateChatTitle(userMessage: string, userId?: string): Promise<string> {
  try {
    const cleanMessage = userMessage.trim().toLowerCase()
    if (cleanMessage.length < 10 || ['hi', 'hello', 'hey', 'test', 'help'].includes(cleanMessage)) {
      return extractTitleFromContent(userMessage)
    }

    await enforceUserRateLimit(userId)
    const result = await generateText({
      model: languageModel('chatTitle'),
      providerOptions: defaultProviderOptions,
      // Replaces the old Promise.race timeout; this also cancels the request.
      abortSignal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
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
    })

    const cleanTitle = result.text.trim().replace(/^['"]|['"]$/g, '')

    if (cleanTitle && cleanTitle.length <= 60 && cleanTitle.length >= 3) {
      return cleanTitle
    }

    return extractTitleFromContent(userMessage)
  } catch (error) {
    console.error(
      'Title generation failed:',
      error instanceof Error ? error.message : String(error)
    )
    return extractTitleFromContent(userMessage)
  }
}
