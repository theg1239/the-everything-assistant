import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCurrentVITContext } from '@/lib/data/context-integration'
import { getModelConfig } from '@/lib/model-registry'

type ConversationMessage = {
  role: 'user' | 'assistant'
  content: string
}

export async function generateFollowUpSuggestions(
  assistantMessage: string,
  userMessage?: string,
  conversationHistory?: ConversationMessage[]
): Promise<string[]> {
  try {

    const session = await getServerSession(authOptions)
    const userId = session?.user?.id

    // Build conversation context from history
    let contextPrompt = ''
    
    if (conversationHistory && conversationHistory.length > 0) {
      // Take the last 6 messages for context (3 exchanges)
      const recentHistory = conversationHistory.slice(-6)
      contextPrompt = 'RECENT CONVERSATION:\n'
      for (const msg of recentHistory) {
        const role = msg.role === 'user' ? 'User' : 'Assistant'
        // Truncate long messages
        const content = msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content
        contextPrompt += `${role}: ${content}\n`
      }
      contextPrompt += '\n'
    } else if (userMessage) {
      contextPrompt = `User asked: "${userMessage}"\nAssistant replied: "${assistantMessage}"\n\n`
    } else {
      contextPrompt = `Assistant message: "${assistantMessage}"\n\n`
    }

    const currentVITInfo = getCurrentVITContext()

    const prompt = `You are a VIT assistant that suggests clickable follow-up buttons to the student. These will appear directly to the user; each line must be phrased as a user query they would tap, not as instructions to them.

IMPORTANT: Generate follow-up questions that are SPECIFICALLY relevant to the ongoing conversation. Do NOT generate generic questions - they MUST relate directly to what was just discussed.

${contextPrompt}
YOUR AVAILABLE CAPABILITIES (what you can actually answer):

VTOP DATA ACCESS:
- Student profile information (name, reg no, branch, year)
- Marks and detailed assessment scores for all subjects
- Semester-wise grades and CGPA calculations
- Attendance percentage for all subjects with breakdown
- Current semester timetable and class schedules
- Fee payment receipts and transaction history
- Hostel allotment and accommodation details
- Library dues and book status
- Exam schedules and seating arrangements
- Course materials and faculty information download
- Digital assignments and project submissions
- Night slip records and leave applications

REAL-TIME VIT INFORMATION:
- Current academic calendar and semester dates
- Exam schedules (CAT-1, CAT-2, FAT dates)
- Working Saturdays and holiday calendar
- Important deadlines and registration dates
- Latest campus events and announcements
- Current semester status and what's happening now

ACADEMIC RESOURCES:
- Past exam papers and study materials
- Faculty information and contact details
- Course syllabi and curriculum details
- Placement statistics and company information
- Campus facilities (mess menus, sports, library)
- Research opportunities and project guidance

KNOWLEDGE BASE ACCESS:
- Student discussions from Reddit communities
- Academic help and study strategies
- Programming solutions and examples
- Career guidance and interview preparation
- VIT-specific experiences and tips

WHAT YOU CANNOT DO:
- Access personal data outside VTOP
- Provide real-time updates on non-VIT events
- Answer questions unrelated to VIT student life
- Generate content not based on VIT context
- Provide medical or legal advice
- Make decisions for the user
- You do not know what courses a faculty teaches currently

CURRENT VIT CONTEXT:
${currentVITInfo}

Generate exactly 3 follow-up questions that:
1. DIRECTLY continue or expand on the specific topic just discussed
2. Reference specific details mentioned in the conversation (course names, subjects, dates, etc.)
3. Are natural next questions someone would ask after this exact exchange
4. Are concise (under 12 words each)
5. Use natural, conversational language (lowercase)
6. Read as the user speaking/asking; no instructions or meta text

DO NOT generate generic questions like "tell me more" or "what else can you do". Each question must be specifically tied to the conversation content.

Output exactly 3 questions, one per line, without numbering or bullet points.`

    const followUpModel = getModelConfig('followUps')
    const providerClient = rateLimitedAI[followUpModel.provider as keyof typeof rateLimitedAI]
    if (!providerClient) {
      throw new Error(`Unsupported model provider for follow ups: ${followUpModel.provider}`)
    }

    const result = await providerClient.generateText(
      {
        model: { modelId: followUpModel.modelId },
        prompt,
        maxOutputTokens: 150,
        temperature: 0.7,
      },
      userId
    )


    const suggestions = result.text
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) =>
        line
          .trim()
          .replace(/^[-•*]\s*/, '')
          .toLowerCase()
      )
      .slice(0, 3)


    if (suggestions.length < 2 || suggestions.some((s: string) => s.length < 5)) {
      console.warn('Generated suggestions were invalid, falling back to static ones')
      return getStaticFollowUpSuggestions(assistantMessage)
    }

    return suggestions
  } catch (error) {
    console.error('Error generating follow-up suggestions:', error)
    return getStaticFollowUpSuggestions(assistantMessage)
  }
}

function getStaticFollowUpSuggestions(assistantMessage: string): string[] {
  const message = assistantMessage.toLowerCase()

  const currentSemesterSuggestions = [
    'when is the next semester registration?',
    'show me fall semester exam dates',
    'what classes start in july?',
  ]

  if (message.includes('vtop') || message.includes('marks') || message.includes('attendance')) {
    return [
      'check my current semester attendance',
      'show detailed marks breakdown',
      'get my fee payment status',
    ]
  }

  if (message.includes('course') || message.includes('subject') || message.includes('materials')) {
    return [
      'download course materials for this semester',
      'get past exam papers',
      'show faculty contact information',
    ]
  }

  if (message.includes('exam') || message.includes('cat') || message.includes('fat')) {
    return [
      'when are cat-1 exams this semester?',
      'show exam schedule for fall 2025',
      'check assignment deadlines',
    ]
  }

  if (message.includes('timetable') || message.includes('schedule') || message.includes('class')) {
    return [
      'show my current semester timetable',
      'what classes do i have tomorrow?',
      'check lab schedule',
    ]
  }

  if (message.includes('placement') || message.includes('company') || message.includes('package')) {
    return [
      'show latest placement statistics',
      'what companies are visiting?',
      'get interview preparation tips',
    ]
  }

  if (message.includes('hostel') || message.includes('mess') || message.includes('campus')) {
    return [
      "check today's mess menu",
      'show campus sports facilities',
      'tell me about upcoming events',
    ]
  }

  if (
    message.includes('registration') ||
    message.includes('deadline') ||
    message.includes('academic')
  ) {
    return currentSemesterSuggestions
  }

  if (message.includes('calendar') || message.includes('date') || message.includes('schedule')) {
    return [
      'show working saturdays this semester',
      'when is gravitas 2025?',
      'check holiday calendar',
    ]
  }

  if (message.includes('research') || message.includes('project') || message.includes('faculty')) {
    return [
      'how to join research projects?',
      'show faculty research areas',
      'get project guidelines',
    ]
  }

  if (message.includes('library') || message.includes('book') || message.includes('due')) {
    return ['check my library dues', 'show library timings', 'how to renew books?']
  }

  if (
    message.includes('placement') ||
    message.includes('internship') ||
    message.includes('company')
  ) {
    return [
      'show placement statistics',
      'list top recruiting companies',
      'show recent placement offers',
      'compare placement statistics by campus',
      'show highest package offers',
    ]
  }

  return [
    'show my vtop attendance',
    'when is the next semester FFCS?',
    'check fall semester exam dates',
  ]
}
