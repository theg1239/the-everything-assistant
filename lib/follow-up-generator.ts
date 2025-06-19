import { rateLimitedGoogle } from '@/lib/rate-limited-ai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function generateFollowUpSuggestions(
  assistantMessage: string,
  userMessage?: string
): Promise<string[]> {
  try {
    // console.log('generateFollowUpSuggestions called with:', {
    //   assistantLength: assistantMessage.length,
    //   userLength: userMessage?.length || 0,
    //   assistantPreview: assistantMessage.substring(0, 100)
    // })

    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    // console.log('User ID:', userId)

    // console.log('Proceeding with AI generation...')

    const contextPrompt = userMessage
      ? `User asked: "${userMessage}"\nAssistant replied: "${assistantMessage}"`
      : `Assistant message: "${assistantMessage}"`

    // console.log('Context prompt length:', contextPrompt.length)

    const prompt = `Based on the following conversation context, generate 3 relevant follow-up questions that a VIT student might ask next. The questions should be:

1. Specific and actionable
2. Naturally flowing from the conversation
3. Relevant to VIT students (academics, VTOP, campus life, placements, etc.)
4. Concise (under 10 words each)
5. Different from each other in topic/focus

Context:
${contextPrompt}

Common VIT-related topics include:
- VTOP queries (attendance, marks, timetable, fees, exams)
- Academic courses and syllabi
- Campus facilities (mess, hostel, library)
- Placements and career guidance
- Faculty and research opportunities
- Events and activities

Generate exactly 3 follow-up questions, one per line, without numbering or bullet points.`

    // console.log('Calling AI model with prompt length:', prompt.length)
    const result = await rateLimitedGoogle.generateText(
      {
        model: rateLimitedGoogle.model(),
        prompt,
        maxTokens: 150,
        temperature: 0.7,
      },
      userId
    )

    // console.log('AI model raw response:', result.text)

    const suggestions = result.text
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line =>
        line
          .trim()
          .replace(/^[-•*]\s*/, '')
          .toLowerCase()
      )
      .slice(0, 3)

    // console.log('Processed suggestions:', suggestions)
    // console.log('Validation check:', {
    //   length: suggestions.length,
    //   hasValidLength: suggestions.length >= 2,
    //   allLongEnough: suggestions.every(s => s.length >= 5),
    //   shortOnes: suggestions.filter(s => s.length < 5)
    // })

    if (suggestions.length < 2 || suggestions.some(s => s.length < 5)) {
      console.warn('Generated suggestions were invalid, falling back to static ones')
      return getStaticFollowUpSuggestions(assistantMessage)
    }

    // console.log('Using AI-generated suggestions:', suggestions)
    return suggestions
  } catch (error) {
    console.error('Error generating follow-up suggestions:', error)
    // console.log('Falling back to static suggestions')
    return getStaticFollowUpSuggestions(assistantMessage)
  }
}

function getStaticFollowUpSuggestions(assistantMessage: string): string[] {
  const message = assistantMessage.toLowerCase()
  if (message.includes('vtop') || message.includes('marks') || message.includes('attendance')) {
    return ['show my detailed attendance', 'check fee payment status', 'what about other subjects?']
  }

  if (message.includes('syllabus') || message.includes('course') || message.includes('subject')) {
    return ['get past exam papers', 'show course materials', 'tell me about faculty']
  }

  if (message.includes('placement') || message.includes('company') || message.includes('package')) {
    return ['what skills to focus on?', 'show placement trends', 'interview preparation tips?']
  }

  if (message.includes('hostel') || message.includes('mess') || message.includes('campus')) {
    return ['show other campus facilities', 'tell me about events', 'what about sports facilities?']
  }

  if (message.includes('research') || message.includes('project') || message.includes('faculty')) {
    return ['how to join research?', 'show ongoing projects', 'connect with faculty']
  }

  if (
    message.includes('code') ||
    message.includes('programming') ||
    message.includes('algorithm')
  ) {
    return ['show similar examples', 'explain the complexity', 'what are best practices?']
  }

  if (message.includes('exam') || message.includes('study') || message.includes('grade')) {
    return ['give me study tips', 'show academic progress', 'how to improve grades?']
  }

  return ['tell me more about this', 'can you give an example?', 'how does this apply to VIT?']
}
