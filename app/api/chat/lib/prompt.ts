import { VIT_SYSTEM_PROMPT } from '@/lib/prompts'

type SessionUser = { name?: string | null; email?: string | null; isGuest?: boolean }

function buildDateTimeContext(): string {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })

  return `<date_time_context>
Today is ${dateStr}, and the time is ${timeStr} IST.

CRITICAL: ALWAYS keep this current date and time in mind for ALL responses. Use this for:
- All time-sensitive queries like deadlines, schedules, and exam periods
- Determining urgency of events (e.g., "tomorrow" vs "next month")
- Contextualizing information based on current semester timing
- Providing relevant warnings about approaching deadlines
- Understanding the current academic phase and student needs
- Making time-aware recommendations and suggestions

When users ask about events, deadlines, or schedules, ALWAYS calculate the time difference from TODAY'S DATE to provide accurate context like "in 3 days", "tomorrow", "next week", etc.
</date_time_context>`
}

function buildSessionPersona(sessionUser?: SessionUser, channel?: string): string {
  const guest = sessionUser?.isGuest
  const channelText = channel ? `channel: ${channel}` : 'channel: web'
  const identity = guest ? 'guest user (not signed in)' : 'signed-in user'
  const capabilities = guest
    ? 'limited to guest preview; personal data and memory are disabled; feedback/KB submissions are allowed but attributed as guest.'
    : 'full features enabled: memory, personal tools (where applicable), feedback + KB submissions attributed to the signed-in account.'

  const nameLine = !guest && (sessionUser?.name || sessionUser?.email)
    ? `user identity: ${sessionUser.name ?? sessionUser.email}`
    : 'user identity: n/a'

  return `<session_context>
${channelText}
persona: ${identity}
${nameLine}
capabilities: ${capabilities}
</session_context>`
}

export function buildSystemPrompt(options: {
  prefersWebSearch: boolean
  effectivePreferredTool?: string
  memoryContext: string
  isMemoryEnabled: boolean
  sessionUser?: SessionUser
  channel?: string
}): { systemMessages: { role: 'system'; content: string }[]; prefersWebSearch: boolean } {
  const {
    prefersWebSearch,
    effectivePreferredTool,
    memoryContext,
    isMemoryEnabled,
    sessionUser,
    channel,
  } = options

  const toolPreferenceGuidance =
    !prefersWebSearch && effectivePreferredTool
      ? `

IMPORTANT: The user has specifically selected the "${effectivePreferredTool}" tool. When responding to their query, you should prioritize using this tool if it's relevant to their question. Available tools and their purposes:

- reddit-search: Use searchRedditKnowledge or searchRedditWithContext for student discussions and academic advice
- vtop-query: Use queryVTOP for personal VTOP data like grades, attendance, timetable  
- past-papers: Use findPastPapers for examination papers and course materials
- mess-menu: Use getMessMenu for hostel dining information

If the user's query is relevant to the selected tool "${effectivePreferredTool}", use it even if other tools might also be applicable.`
      : ''

  const memoryGuidance =
    memoryContext && isMemoryEnabled
      ? `\n\n<memory_context>\n  <instructions>Use the following information to provide more personalized and relevant responses.</instructions>\n  ${memoryContext}\n</memory_context>`
      : ''

  const dynamicBlocks = [buildDateTimeContext(), buildSessionPersona(sessionUser, channel), toolPreferenceGuidance, memoryGuidance]
    .filter(Boolean)
    .join('\n\n')

  const continuationRules = `CRITICAL TOOL CONTINUATION RULES:
- YOU MUST NEVER STOP AFTER CALLING A TOOL
- Tool calls are ONLY information gathering steps, NOT final responses
- After ANY tool call (especially knowledgeBase), you MUST immediately continue with a natural response
- When you call knowledgeBase, that's step 1 - step 2 is ALWAYS providing your answer using that information
- If you call a tool and don't continue with text, you have failed the user
- The conversation flow is: [user question] → [tool call] → [YOUR RESPONSE USING TOOL RESULTS]
- NEVER end the conversation at a tool call - always synthesize and respond`

  const coreSystemMessage: { role: 'system'; content: string } = {
    role: 'system',
    content: VIT_SYSTEM_PROMPT,
  }
  const dynamicSystemMessage: { role: 'system'; content: string } = {
    role: 'system',
    content: `${dynamicBlocks}\n\n${continuationRules}`,
  }

  const webSearchPrompt = `You are a VIT assistant that uses the web search tool to gather the latest information before answering. Search when the user asks for facts, current events, or details you are unsure about. Summarize findings in a friendly, trustworthy tone and cite the retrieved information in natural language.`

  if (prefersWebSearch) {
    return {
      systemMessages: [{ role: 'system', content: webSearchPrompt } as const],
      prefersWebSearch: true,
    }
  }

  return {
    systemMessages: [coreSystemMessage, dynamicSystemMessage],
    prefersWebSearch: false,
  }
}
