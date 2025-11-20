import { VIT_SYSTEM_PROMPT } from '@/lib/prompts'

export function buildSystemPrompt(options: {
  prefersWebSearch: boolean
  effectivePreferredTool?: string
  memoryContext: string
  isMemoryEnabled: boolean
}) {
  const { prefersWebSearch, effectivePreferredTool, memoryContext, isMemoryEnabled } = options

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

  const webSearchPrompt = `You are a VIT assistant that uses the web search tool to gather the latest information before answering. Search when the user asks for facts, current events, or details you are unsure about. Summarize findings in a friendly, trustworthy tone and cite the retrieved information in natural language.`

  if (prefersWebSearch) return webSearchPrompt

  return `${VIT_SYSTEM_PROMPT}  

${toolPreferenceGuidance}${memoryGuidance}

CRITICAL TOOL CONTINUATION RULES:
- YOU MUST NEVER STOP AFTER CALLING A TOOL
- Tool calls are ONLY information gathering steps, NOT final responses
- After ANY tool call (especially knowledgeBase), you MUST immediately continue with a natural response
- When you call knowledgeBase, that's step 1 - step 2 is ALWAYS providing your answer using that information
- If you call a tool and don't continue with text, you have failed the user
- The conversation flow is: [user question] → [tool call] → [YOUR RESPONSE USING TOOL RESULTS]
- NEVER end the conversation at a tool call - always synthesize and respond`
}

