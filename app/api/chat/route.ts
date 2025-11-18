import {
  smoothStream,
  extractReasoningMiddleware,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
} from 'ai'
import { inspect } from 'util'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { createVITTools } from '@/lib/tools'
import { VIT_SYSTEM_PROMPT } from '@/lib/prompts'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getChat, createChat, saveMessage, updateChat } from '@/lib/db'
import { memoryService } from '@/lib/memory/memory-service'
import { extractTitleFromContent } from '@/lib/utils'
import { sanitizeToolInvocations } from '@/lib/sanitize-tools'
import {
  uiMessagesToLegacyMessages,
  type AppUIMessage,
  type LegacyMessage,
} from '@/lib/ai-message-conversion'
import type { JsonValue } from '@/types/tools'
import { z } from 'zod'

type ToolCallPayload = {
  toolName: string
  args?: Record<string, JsonValue>
  toolCallId?: string
}

type ChatRequestPayload = {
  id?: string
  directToolCall?: ToolCallPayload
  preferredTool?: string
  messages?: AppUIMessage[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }

  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue)
  }

  return false
}

const normalizeToolCall = (value: unknown): ToolCallPayload | undefined => {
  if (!isRecord(value) || typeof value.toolName !== 'string') {
    return undefined
  }

  const normalizedArgs: Record<string, JsonValue> | undefined = isRecord(value.args)
    ? Object.entries(value.args).reduce<Record<string, JsonValue>>((acc, [key, arg]) => {
        if (isJsonValue(arg)) {
          acc[key] = arg
        }
        return acc
      }, {})
    : undefined

  return {
    toolName: value.toolName,
    toolCallId: typeof value.toolCallId === 'string' ? value.toolCallId : undefined,
    args: normalizedArgs,
  }
}

type LegacyToolMessage = LegacyMessage

const getMessageText = (message: LegacyMessage | null | undefined): string =>
  message?.content ?? ''

const parseChatRequestPayload = (value: unknown): ChatRequestPayload | null => {
  if (!isRecord(value)) {
    return null
  }

  const payload: ChatRequestPayload = {}

  if (typeof value.id === 'string') {
    payload.id = value.id
  }

  if (typeof value.preferredTool === 'string') {
    payload.preferredTool = value.preferredTool
  }

  const directToolCall = normalizeToolCall(
    (value as { directToolCall?: unknown }).directToolCall
  )
  if (directToolCall) {
    payload.directToolCall = directToolCall
  }

  const rawMessages = (value as { messages?: unknown }).messages
  if (Array.isArray(rawMessages)) {
    payload.messages = rawMessages as AppUIMessage[]
  }

  return payload
}

async function generateChatTitle(userMessage: string, userId?: string): Promise<string> {
  try {
    const cleanMessage = userMessage.trim().toLowerCase()
    if (cleanMessage.length < 10 || ['hi', 'hello', 'hey', 'test', 'help'].includes(cleanMessage)) {
      return extractTitleFromContent(userMessage)
    }

    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error('Title generation timeout')), 5000) // Reduced from 10s to 5s for faster TTFT
    )

    const modelPromise = rateLimitedAI.groq.generateText(
      {
        model: await rateLimitedAI.groq.model('meta-llama/llama-4-scout-17b-16e-instruct'),
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
        maxTokens: 50,
      },
      userId
    )

    const result = (await Promise.race([modelPromise, timeoutPromise])) as any
    const generatedTitle = result.text
    const cleanTitle = generatedTitle.trim().replace(/^["']|["']$/g, '')

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

async function parseVTOPData(
  rawData: any,
  command: string,
  userContext: string = '',
  userId?: string
) {
  try {
    const vtopParseSchema = z.object({
      success: z.boolean(),
      formatted_content: z.string(),
      structured_data: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .optional(),
      summary: z.string(),
    })

    const result = await rateLimitedAI.google.generateObject(
      {
        model: await rateLimitedAI.google.model(),
        schema: vtopParseSchema,
        prompt: `
You are a helpful assistant that parses VTOP (VIT Online Portal) data and formats it in a clean, natural language format.

USER'S ORIGINAL REQUEST: ${userContext}
Command: ${command}
Raw Data: ${JSON.stringify(rawData)}

SPECIAL HANDLING FOR COURSE MATERIALS/DOWNLOADS:
${
  rawData.downloadInfo &&
  rawData.downloadInfo.servedFiles &&
  rawData.downloadInfo.servedFiles.length > 0
    ? `
🔥 CRITICAL: DOWNLOAD FILES ARE AVAILABLE AND MUST BE INCLUDED!

SERVED FILES WITH DOWNLOAD LINKS:
${rawData.downloadInfo.servedFiles
  .map((file: any) => {
    const cleanName = file.name.replace(/_\\d+\\.(pdf|pptx|docx|txt)$/i, '.$1')
    return `- <strong>${cleanName}</strong> <span style=  "color: #6b7280; font-size: 0.875rem;">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span> <a href="\${file.downloadUrl}" download="\${file.name}">Download</a>`
  })
  .join('\n')}

FILES SUMMARY:
- Total Downloaded: ${rawData.downloadInfo.filesDownloaded || rawData.downloadInfo.servedFiles.length}
- Total Available: ${rawData.downloadInfo.totalFiles || rawData.downloadInfo.servedFiles.length}
- Available via temporary download links (expires in 2 hours)

⚠️ MANDATORY: You MUST include these download links in your formatted_content as clickable HTML links!
⚠️ DO NOT mention any local paths - only use the served download URLs!
`
    : rawData.downloadInfo && rawData.downloadInfo.downloadPath
      ? `
LOCAL FILES DOWNLOADED:
- Files Downloaded: ${rawData.downloadInfo.filesDownloaded || 0}
- Local Path: ${rawData.downloadInfo.downloadPath}
(Note: No served links available)
`
      : ''
}

${
  rawData.data && typeof rawData.data === 'string' && rawData.data.includes('📚')
    ? `
COURSE MATERIALS CONTEXT: This appears to be course materials/topics. Format these as a clear list with proper structure.
`
    : ''
}

${
  rawData.step === 'materials' && rawData.options && Array.isArray(rawData.options)
    ? `
MATERIALS LIST DETECTED: The data contains a materials list with ${rawData.options.length} items. 
Extract and format each material entry from the options array. Each option may contain:
- number: the item number
- description: material description (may include date and topic)
- topic: specific topic name
- date: material date

Format these as a clear, readable list showing the date and topic for each material.
`
    : ''
}

${
  rawData.step === 'semester' && rawData.options && Array.isArray(rawData.options)
    ? `
SEMESTER SELECTION DETECTED: The data contains a semester list with ${rawData.options.length} options.
Extract and format each semester option from the options array. Each option contains:
- number: the selection number
- description: semester description (e.g., "Fall Semester 2023-24 - VLR")

Format these as a numbered list that the user can choose from. Include clear instruction for the user to select by number.
Example format:
1 │ VL20232401 │ Fall Semester 2023-24 - VLR
2 │ VL20232405 │ Winter Semester 2023-24 - VLR

Always include the phrase "Which semester would you like to view? You can select by entering the corresponding number."
`
    : ''
}

${
  rawData.step === 'course' && rawData.options && Array.isArray(rawData.options)
    ? `
COURSE SELECTION DETECTED: The data contains a course list with ${rawData.options.length} options.
Extract and format each course option from the options array. Each option contains:
- number: the selection number  
- description: course description (e.g., "BCSE101E - Computer Programming: Python - ETH")

Format these as a numbered list that the user can choose from.
`
    : ''
}

${
  rawData.step === 'faculty' && rawData.options && Array.isArray(rawData.options)
    ? `
FACULTY SELECTION DETECTED: The data contains a faculty list with ${rawData.options.length} options.
Extract and format each faculty option from the options array for user selection.
`
    : ''
}



Please parse this VTOP data and return a structured response with:
- success: true if parsing was successful
- formatted_content: A natural language description with proper formatting that directly addresses the user's original request
- structured_data: Key-value pairs extracted from the data (optional)
- summary: A brief summary of what this data shows in relation to what the user asked for

IMPORTANT: Use the user's original request to understand what they were looking for and tailor your response accordingly. For example:
- If they asked about "Thursday classes", focus on Thursday in the timetable
- If they asked about "attendance for chemistry", highlight chemistry attendance specifically
- If they asked about "summer semester grades", emphasize that semester's performance
- If they asked about "upcoming exams", focus on dates and timing
- If they asked about course materials or "pull up course page", include download links prominently

get rid of any mentions about the existence of an ICS file even if it has been provided to you in the prompt, you must not include any such information in your output.

FORMATTING GUIDELINES:
1. Use bullet points and lists for better readability when showing multiple items
2. If you need to present tabular data, use HTML table tags: <table>, <tr>, <td>, <th>
3. Use HTML formatting tags like <strong>, <em>, <br>, <p>, <ul>, <li> for better presentation
4. For profile data: Write in natural sentences about the person's details
5. For attendance: Describe attendance in conversational language
6. For marks/grades: Explain performance in narrative form with lists for multiple subjects
7. For receipts/financial data: Describe transactions naturally with HTML tables if needed
8. For timetable: Present schedule information with clear time blocks and lists
9. For course materials/topics: Use bullet points or numbered lists for clarity
10. For download links: Always include clickable download links when available
11. Make it engaging and easy to read, like explaining to a friend
12. Always relate back to what the user originally asked for

DO NOT USE ASTERIKS, use HTML tags only for formatting. Nothing else. Do not include text like "You've downloaded <x> files already"
DO NOT include text like "Please select the materials to download by entering their corresponding numbers (e.g., "1-5", "0" for all, or "1,3,5").", just prompt the user to ask if they want to download specific materials or all of them.
Reformat the titles of the files based on the topics, like "Boundary layers, Laminar flow and turbulent flow, _1.pptx" should be reformatted to just "Boundary layers, Laminar flow and turbulent flow.pptx" without the "_1" suffix.

SPECIAL HANDLING FOR COURSE PAGE/MATERIALS:
- If downloadInfo.servedFiles exists, ALWAYS include download links
- Format course materials as a numbered list with topics and dates
- Include clear download buttons/links for each file
- Ask if the user wants to download specific materials when showing options
- If the data contains materials options (step=materials, options array), format the materials list immediately
- When showing materials list, display the actual topics and dates, not generic text

SEMESTER SELECTION FORMATTING:
- If step='semester' and options array exists, ALWAYS format the semester options as a clear numbered list
- Use format: Semester Name | Year 
- Include clear instruction: "Which semester would you like to view?"
- Example: "Fall Semester | 2023-24"
- Format multiple semesters as a list. Ensure they aren't in single lines or whatever, they should be in a pretty list format.

COURSE/FACULTY SELECTION FORMATTING:
- If step='course' or step='faculty' and options array exists, format as numbered list
- Show all available options clearly for user selection
- Include selection instruction

MATERIALS LIST FORMATTING:
- If step='materials' and options array exists, extract and format each material entry
- Show format: "Date: Topic/Description" 
- Use numbered or bulleted lists for clear presentation
- Always ask if user wants to download specific materials or all of them

Example formats:
- Receipts: "Here are your recent payments to VIT: <table><tr><th>Date</th><th>Amount</th><th>Description</th></tr>..."
- Attendance: "Your attendance looks good overall. In Mathematics, you have 85% attendance which is above the required 75%..."
- Timetable for "Thursday classes": "Looking at your Thursday schedule specifically, you have..."
- Course Materials: "Here are the available materials:<ul><li>Topic 1 - <a href='download-link'>Download</a></li></ul>"
- Semester Selection: "Please select the semester you want to view:<br>Fall Semester | 2023-24<br>Winter Semester | 2023-24<br>Which semester would you like to view?"

Make the formatted_content engaging and conversational while being informative and contextually relevant to the user's request.
`,
      },
      userId
    )

    return result.object
  } catch (error) {
    console.error('Error parsing VTOP data with AI SDK:', error)
    return {
      success: false,
      error: 'Failed to parse VTOP data',
      formatted_content: 'Unable to parse the data at this time.',
      structured_data: {},
      summary: 'Parsing failed',
    }
  }
}

function getToolOutputPayload(tool: any) {
  if (!tool) return null
  return tool.result ?? tool.output ?? null
}

function getToolInputPayload(tool: any) {
  if (!tool) return undefined
  return tool.args ?? tool.input ?? undefined
}

function inferLegacyToolState(tool: any, output: any): 'result' | 'error' {
  const state = typeof tool?.state === 'string' ? tool.state : ''
  if (output && typeof output === 'object') {
    if ('success' in output && output.success === false) {
      return 'error'
    }
    return 'result'
  }
  if (state.includes('error')) {
    return 'error'
  }
  if (state.includes('output')) {
    return 'result'
  }
  return 'error'
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }
    const rawPayload = await req.json().catch(() => null)
    const payload = parseChatRequestPayload(rawPayload)
    if (!payload) {
      return new Response('Invalid request body', { status: 400 })
    }
    const { id: requestedChatId, directToolCall, preferredTool } = payload
    const uiMessages: AppUIMessage[] = payload.messages ?? []
    const messages = uiMessagesToLegacyMessages(uiMessages)
    const metadataPreferredTool =
      uiMessages.length > 0
        ? ((uiMessages[uiMessages.length - 1]?.metadata || {}) as Record<string, any>)
            ?.preferredTool
        : undefined
    const effectivePreferredTool = preferredTool || metadataPreferredTool

    const normalizedChatId =
      typeof requestedChatId === 'string' && requestedChatId.trim().length > 0
        ? requestedChatId
        : generateId()

    let chat = normalizedChatId ? await getChat(normalizedChatId, session.user.id) : null
    if (!chat) {
      const initialContent = getMessageText(messages[0])
      const tempTitle = extractTitleFromContent(initialContent || 'New Chat')
      const path = `/chat/${normalizedChatId}`
      chat = await createChat(session.user.id, tempTitle, path, normalizedChatId)

      const userMessage = initialContent
      if (userMessage.trim()) {
        setTimeout(() => {
          generateChatTitle(userMessage, session.user.id)
            .then(async properTitle => {
              if (properTitle !== tempTitle) {
                await updateChat(chat!.id, properTitle)
                console.log('Chat title updated successfully:', properTitle)
              }
            })
            .catch(error => {
              console.error('Failed to update chat title:', error)
            })
        }, 2000)
      }
    }

    let directToolCallResult: any = null
    let directToolCallExecuted = false

    if (directToolCall) {
      const tools = createVITTools(session.user.id)
      const tool = tools[directToolCall.toolName as keyof typeof tools]

      if (tool && typeof tool.execute === 'function') {
        if (
          directToolCall.toolName === 'getFacultyInfo' &&
          directToolCall.args &&
          directToolCall.args.facultyName &&
          !directToolCall.args.includeCourses
        ) {
          directToolCall.args.includeCourses = true
        }
        try {
          type ToolExecutionOptions = {
            toolCallId: string
            messages: LegacyMessage[]
          }
          type ToolExecute = (
            args: Record<string, JsonValue>,
            options: ToolExecutionOptions
          ) => Promise<Record<string, JsonValue> | JsonValue | null>
          const execute = tool.execute as unknown as ToolExecute
          const toolArgs: Record<string, JsonValue> =
            (directToolCall.args && Object.keys(directToolCall.args).length > 0
              ? directToolCall.args
              : {}) ?? {}
          const executionOptions = {
            toolCallId: directToolCall.toolCallId || Date.now().toString(),
            messages,
          }
          const rawResult = (await execute(toolArgs, executionOptions)) ?? null
          const resultObject =
            rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)
              ? (rawResult as Record<string, JsonValue>)
              : null
          const structuredResult =
            resultObject && ('success' in resultObject || 'data' in resultObject)
              ? (resultObject as Record<string, any>)
              : null

          if (
            directToolCall.toolName === 'queryVTOP' &&
            structuredResult &&
            structuredResult.success !== false &&
            structuredResult.data
          ) {
            try {
              const command = (
                structuredResult.command ?? directToolCall.args?.command
              ) as string

              const userContext =
                messages && messages.length > 0
                  ? messages
                      .filter((m: any) => m.role === 'user')
                      .slice(-3)
                      .map((m: any) => m.content)
                      .join(' | ')
                  : ''
              const parsedData = await parseVTOPData(
                structuredResult,
                command,
                userContext,
                session.user.id
              )

              Object.assign(structuredResult, {
                parsedData,
                formatted_content: (parsedData as any).formatted_content,
                structured_data: (parsedData as any).structured_data,
                summary: (parsedData as any).summary,
              })

              directToolCallResult = {
                toolCallId: directToolCall.toolCallId || Date.now().toString(),
                toolName: directToolCall.toolName,
                args: directToolCall.args,
                result: structuredResult,
                state: 'result',
              }
              directToolCallExecuted = true
            } catch (parseError) {
              console.error('Failed to parse VTOP data:', parseError)
              directToolCallResult = {
                toolCallId: directToolCall.toolCallId || Date.now().toString(),
                toolName: directToolCall.toolName,
                args: directToolCall.args,
                result: structuredResult ?? rawResult,
                state: 'result',
              }
              directToolCallExecuted = true
            }
          } else {
            directToolCallResult = {
              toolCallId: directToolCall.toolCallId || Date.now().toString(),
              toolName: directToolCall.toolName,
              args: directToolCall.args,
              result: structuredResult ?? rawResult,
              state: 'result',
            }
            directToolCallExecuted = true
          }
        } catch (error: any) {
          console.error('Direct tool call failed:', error)
          directToolCallResult = {
            toolCallId: directToolCall.toolCallId || Date.now().toString(),
            toolName: directToolCall.toolName,
            args: directToolCall.args,
            result: {
              success: false,
              error: error.message || 'Tool execution failed',
              timestamp: new Date().toISOString(),
            },
            state: 'error',
          }
          directToolCallExecuted = true
        }
      } else {
        console.error('Direct tool call - tool not found:', directToolCall.toolName)
        directToolCallResult = {
          toolCallId: directToolCall.toolCallId || Date.now().toString(),
          toolName: directToolCall.toolName,
          args: directToolCall.args,
          result: {
            success: false,
            error: 'Tool not found',
            timestamp: new Date().toISOString(),
          },
          state: 'error',
        }
        directToolCallExecuted = true
      }
    }

    if (!process.env.GROQ_API_KEY) {
      return new Response(
        JSON.stringify({
          error: 'API key not configured. Please add GROQ_API_KEY to your environment variables.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const userMessage = messages.length > 0 ? messages[messages.length - 1] : null
    if (userMessage?.role === 'user') {
      const persistedContent = getMessageText(userMessage)
      await saveMessage(chat.id, 'user', persistedContent, undefined, userMessage.id)
    }

    const memorySettings = await memoryService.getUserMemorySettings(session.user.id)
    const isMemoryEnabled = memorySettings?.isEnabled ?? true

    let memoryContext = ''
    if (isMemoryEnabled && userMessage?.role === 'user') {
      try {
        const memories = await memoryService.getUserMemories(session.user.id, { pageSize: 100 })

        if (memories.length > 0) {
          memoryContext = `
<memories>
  <context>Saved information from previous conversations:</context>
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
      } catch (error) {}
    }

    const baseTools = createVITTools(session.user.id)
    const prefersWebSearch = effectivePreferredTool === 'web-search'
    let tools: Record<string, any> = baseTools

    if (prefersWebSearch) {
      try {
        const googleSearchTool = rateLimitedAI.google.tools.google_search()
        tools = googleSearchTool ? { google_search: googleSearchTool } : {}
      } catch (error) {
        console.error('Failed to initialize Google Search tool:', error)
        tools = {}
      }
    }

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

    const combinedSystemPrompt = prefersWebSearch
      ? webSearchPrompt
      : `${VIT_SYSTEM_PROMPT}  

${toolPreferenceGuidance}${memoryGuidance}

CRITICAL TOOL CONTINUATION RULES:
- YOU MUST NEVER STOP AFTER CALLING A TOOL
- Tool calls are ONLY information gathering steps, NOT final responses
- After ANY tool call (especially knowledgeBase), you MUST immediately continue with a natural response
- When you call knowledgeBase, that's step 1 - step 2 is ALWAYS providing your answer using that information
- If you call a tool and don't continue with text, you have failed the user
- The conversation flow is: [user question] → [tool call] → [YOUR RESPONSE USING TOOL RESULTS]
- NEVER end the conversation at a tool call - always synthesize and respond`


    const enhancedMessages = messages.map((message: any, index: number) => {
      if (message.role === 'user' && index === messages.length - 1) {
        return message
      }

      if (
        message.role === 'assistant' &&
        message.toolInvocations &&
        message.toolInvocations.length > 0
      ) {
        let toolContext = ''

        for (const toolCall of message.toolInvocations) {
          if (toolCall.result) {
            if (
              toolCall.toolName === 'knowledgeBase' &&
              toolCall.result.success &&
              toolCall.result.chunks
            ) {
              const knowledgeContext = toolCall.result.chunks
                .map((c: any) => (c.content || '').trim())
                .filter(Boolean)
                .join('\n\n')
                .slice(0, 6000)

              if (knowledgeContext) {
                toolContext += `\n\n[KNOWLEDGE BASE CONTEXT]:\n${knowledgeContext}`
                toolContext += `\n\n[IMPORTANT]: Use the above knowledge base information to answer the user's question. Format your response naturally with proper markdown formatting, bullet points, and lowercase text (except for proper nouns and course codes).`
              }
            } else if (toolCall.toolName === 'queryVTOP' && toolCall.result.success) {
              const command = toolCall.result.command || toolCall.args?.command || 'data'
              let dataContext = ''

              if (toolCall.result.formatted_content) {
                dataContext = toolCall.result.formatted_content
              } else if (toolCall.result.summary) {
                dataContext = toolCall.result.summary
              } else if (toolCall.result.data || toolCall.result.output) {
                const rawData = toolCall.result.data || toolCall.result.output
                if (typeof rawData === 'string') {
                  dataContext = rawData.substring(0, 500) + (rawData.length > 500 ? '...' : '')
                } else if (Array.isArray(rawData)) {
                  dataContext = `Retrieved ${rawData.length} items for ${command}`
                } else {
                  dataContext = `Retrieved ${command} data from VTOP`
                }
              }
              if (dataContext) {
                toolContext += `\n\n[VTOP ${command.toUpperCase()} DATA CONTEXT]:\n${dataContext}`
                toolContext += `\n\n[IMPORTANT]: VTOP ${command} data was successfully retrieved above. Use this data to answer any follow-up questions about ${command}.`
              }
            } else if (toolCall.result.papers && toolCall.result.papers.length > 0) {
              toolContext += `\n\n[PAPERS DATA CONTEXT]:\nFound ${toolCall.result.papers.length} past papers`
            } else if (toolCall.result.faculty && toolCall.result.faculty.length > 0) {
              toolContext += `\n\n[FACULTY DATA CONTEXT]:\nFound ${toolCall.result.faculty.length} faculty members`
            } else if (toolCall.result.companies && toolCall.result.companies.length > 0) {
              toolContext += `\n\n[COMPANIES DATA CONTEXT]:\nFound ${toolCall.result.companies.length} companies`
            } else if (toolCall.result.data && toolCall.result.data.todayMenu) {
              toolContext += `\n\n[MESS MENU DATA CONTEXT]:\nRetrieved mess menu for ${toolCall.result.data.messType}`
            }
          }
        }

        if (toolContext) {
          return {
            ...message,
            content: (message.content || '') + toolContext,
          }
        }
      }
      return message
    })

    if (directToolCallResult && directToolCallExecuted) {
      const lastUserMessage = enhancedMessages[enhancedMessages.length - 1]
      if (lastUserMessage && lastUserMessage.role === 'user') {
        let toolContext = ''

        if (directToolCallResult.toolName === 'queryVTOP') {
          const directResultPayload = getToolOutputPayload(directToolCallResult)
          if (directResultPayload?.success) {
            const command =
              directResultPayload.command ||
              getToolInputPayload(directToolCallResult)?.command ||
              'data'
            let dataContext = ''

            if (directResultPayload.formatted_content) {
              dataContext = directResultPayload.formatted_content
            } else if (directResultPayload.summary) {
              dataContext = directResultPayload.summary
            } else if (directResultPayload.data || directResultPayload.output) {
              const rawData = directResultPayload.data || directResultPayload.output
              if (typeof rawData === 'string') {
                dataContext = rawData.substring(0, 500) + (rawData.length > 500 ? '...' : '')
              } else if (Array.isArray(rawData)) {
                dataContext = `Retrieved ${rawData.length} items for ${command}`
              } else {
                dataContext = `Retrieved ${command} data from VTOP`
              }
            }

            if (dataContext) {
              toolContext = `\n\n[VTOP ${command.toUpperCase()} DATA CONTEXT]:\n${dataContext}`
              toolContext += `\n\n[IMPORTANT]: VTOP ${command} data was successfully retrieved above. Use this data to answer the user's question about ${command}.`
            }
          }
        }

        if (toolContext) {
          enhancedMessages[enhancedMessages.length - 1] = {
            ...lastUserMessage,
            content: (lastUserMessage.content || '') + toolContext,
          }
        }
      }
    }

    if (directToolCallResult && directToolCallExecuted) {
      const directResultPayload = getToolOutputPayload(directToolCallResult)
      if (directResultPayload?.formatted_content) {
        const responseText =
          directResultPayload.formatted_content ||
          directResultPayload.summary ||
          `Here's your ${directToolCallResult.args?.command || 'data'} from VTOP.`

        const mockResult = {
          text: responseText,
          response: { id: `direct-${Date.now()}` },
          toolResults: [directToolCallResult],
          steps: [
            {
              toolResults: [directToolCallResult],
            },
          ],
        }

        const safeInvocations = sanitizeToolInvocations([
          {
            toolCallId: directToolCallResult.toolCallId,
            toolName: directToolCallResult.toolName,
            args: directToolCallResult.args,
            result: directResultPayload,
            state: directToolCallResult.state,
          },
        ])

        try {
          await saveMessage(
            chat.id,
            'assistant',
            responseText,
            safeInvocations,
            mockResult.response.id
          )
          console.log('Direct tool call message saved with tool invocation')
        } catch (error) {
          console.error('Failed to save direct tool call message:', error)
        }

        const stream = createUIMessageStream<AppUIMessage>({
          originalMessages: uiMessages,
          generateId,
          execute: ({ writer }) => {
            const messageId = generateId()
            const textPartId = generateId()

            writer.write({ type: 'start', messageId })
            writer.write({
              type: 'tool-input-available',
              toolCallId: directToolCallResult.toolCallId,
              toolName: directToolCallResult.toolName,
              input: directToolCallResult.args,
            })
            writer.write({
              type: 'tool-output-available',
              toolCallId: directToolCallResult.toolCallId,
              output: directResultPayload,
            })
            writer.write({ type: 'text-start', id: textPartId })
            writer.write({ type: 'text-delta', id: textPartId, delta: responseText })
            writer.write({ type: 'text-end', id: textPartId })
            writer.write({
              type: 'finish',
              finishReason: 'stop',
              messageMetadata: {
                chatId: chat.id,
                chatPath: chat.path,
              },
            })
          },
        })

        return createUIMessageStreamResponse({
          headers: {
            'X-Chat-Id': chat.id,
            'X-Chat-Path': chat.path,
          },
          stream,
        })
      }
    }

    const attachmentAware = enhancedMessages.some(
      (m: any) =>
        Array.isArray(m.attachments) &&
        m.attachments.some(
          (a: any) =>
            a?.contentType?.startsWith('application/pdf') || a?.contentType?.startsWith('image/')
        )
    )

    let modelName = 'gemini-flash-latest'
    const hasPdf =
      attachmentAware &&
      enhancedMessages.some((m: any) =>
        m.attachments?.some((a: any) => a?.contentType === 'application/pdf')
      )
    if (hasPdf) {
      modelName = 'gemini-flash-latest'
    }

    let finalMessages: any[] = prefersWebSearch
      ? []
      : [{ role: 'system', content: combinedSystemPrompt }]
    if (!attachmentAware) {
      for (const m of enhancedMessages) {
        if (!m?.content || typeof m.content !== 'string' || m.content.trim().length === 0) {
          continue
        }
        finalMessages.push({ role: m.role, content: m.content })
      }
    } else {
      for (const m of enhancedMessages) {
        if (!m.attachments || m.attachments.length === 0) {
          if (m.content && m.content.trim().length > 0) {
            finalMessages.push({ role: m.role, content: m.content })
          }
          continue
        }
        const parts: any[] = []
        if (m.content) {
          parts.push({ type: 'input_text', text: m.content })
        }
        for (const att of m.attachments) {
          if (!att?.contentType) continue
          if (
            att.contentType.startsWith('application/pdf') ||
            att.contentType.startsWith('image/')
          ) {
            try {
              const res = await fetch(att.url)
              if (!res.ok) throw new Error(`fetch ${res.status}`)
              const ab = await res.arrayBuffer()
              const sizeMB = ab.byteLength / (1024 * 1024)
              if (sizeMB > 25) {
                parts.push({
                  type: 'input_text',
                  text: `Attachment '${att.name || 'file'}' skipped: size ${sizeMB.toFixed(1)}MB exceeds 25MB limit.`,
                })
                continue
              }
              parts.push({
                type: 'file',
                data: Buffer.from(ab),
                mimeType: att.contentType,
                name:
                  att.name ||
                  (att.contentType.startsWith('image/') ? 'image' : 'document') + '-' + Date.now(),
              })
            } catch (e: any) {
              parts.push({
                type: 'input_text',
                text: `Failed to load attachment '${att.name || 'file'}': ${e.message}`,
              })
            }
          }
        }
        if (parts.length === 0) {
          continue
        }
        finalMessages.push({ role: m.role, content: parts })
      }
    }

    finalMessages = finalMessages.filter(msg => {
      if (!msg) return false
      if (typeof msg.content === 'string') {
        return msg.content.trim().length > 0
      }
      if (Array.isArray(msg.content)) {
        return msg.content.length > 0
      }
      return Boolean(msg.content)
    })

    const hasConversationContent = finalMessages.some(msg => msg.role !== 'system')

    if (!hasConversationContent) {
      const fallbackText = "i'm on standby — ask a question or run a tool so i know what to do."
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`0:"${fallbackText.replace(/"/g, '\\"')}"\n`))
          controller.enqueue(
            encoder.encode(
              'e:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0},"isContinued":false}\n'
            )
          )
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Chat-Id': chat.id,
          'X-Chat-Path': `/chat/${chat.id}`,
        },
      })
    }

    let savedFinalStepUsage = false

    const reasoningMiddleware = extractReasoningMiddleware({
      tagName: 'reasoning',
    })

    const resultStream = await rateLimitedAI.google.streamText(
      {
        model: await rateLimitedAI.google.model(modelName),
        messages: finalMessages,
        tools,
        temperature: 0.7,
        maxTokens: 4096,
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget: 2048,
              includeThoughts: true,
            },
          },
        },
        experimental_transform: smoothStream({ chunking: 'word' }),
        middleware: [reasoningMiddleware],
        stopWhen: stepCountIs(5),
        onError: async (error: any) => {
          console.error('Streaming error occurred:', error)

          try {
            await saveMessage(
              chat.id,
              'assistant',
              `I encountered an error while processing your request: ${error.message || 'Unknown streaming error'}`,
              [],
              `error-${Date.now()}`
            )
            console.log('Streaming error saved to database')
          } catch (saveError) {
            console.error('Failed to save streaming error:', saveError)
          }
        },
        onStepFinish: async ({
          text,
          toolCalls,
          toolResults,
          finishReason,
          usage,
          stepIndex,
          reasoning,
        }: any) => {
          console.log(`Step finished:`, {
            model: modelName,
            hasText: !!text,
            toolCallsCount: toolCalls?.length || 0,
            toolResultsCount: toolResults?.length || 0,
            finishReason,
            stepIndex,
            usage,
          })

          if (reasoning) {
            try {
              console.log('Extracted reasoning (step):', reasoning)
            } catch (e) {
              console.warn('Failed to log extracted reasoning (step):', e)
            }
          }

          try {
            if (usage && typeof usage === 'object') {
              const { saveTokenUsage } = await import('@/lib/db')
              await saveTokenUsage({
                userId: session.user.id,
                chatId: chat.id,
                model: modelName,
                stepIndex: typeof stepIndex === 'number' ? stepIndex : null,
                promptTokens: usage.promptTokens || 0,
                completionTokens: usage.completionTokens || 0,
                totalTokens:
                  usage.totalTokens || (usage.promptTokens || 0) + (usage.completionTokens || 0),
                meta: { finishReason },
              })
              if (finishReason === 'stop') {
                savedFinalStepUsage = true
              }
            }
          } catch (e) {
            console.warn('Failed to persist step usage:', e)
          }

          const knowledgeBaseCalls =
            toolCalls?.filter((tc: any) => tc.toolName === 'knowledgeBase') || []
          if (knowledgeBaseCalls.length > 0) {
            console.log('Knowledge base tool called, model should continue automatically...')
          }
        },
        onFinish: async (result: any, { reasoning }: any = {}) => {
          console.log('Stream finished, processing final result...')

          try {
            console.log('Full model response:', inspect(result, { depth: null }))
          } catch (e) {
            console.warn('Failed to log full model response:', e)
          }

          try {
            const reasoningParts: string[] = []

            if (reasoning) {
              if (typeof reasoning === 'string') reasoningParts.push(reasoning)
              else if (Array.isArray(reasoning)) reasoningParts.push(...reasoning)
              else if (typeof reasoning === 'object') reasoningParts.push(JSON.stringify(reasoning))
            }

            const resp = (result && (result.response || result)) || null
            if (resp && Array.isArray(resp.messages)) {
              for (const msg of resp.messages) {
                const content = msg.content
                if (Array.isArray(content)) {
                  for (const part of content) {
                    if (part && (part.type === 'reasoning' || part.type === 'thought')) {
                      if (part.text) reasoningParts.push(part.text)
                      else reasoningParts.push(JSON.stringify(part))
                    }
                  }
                }
              }
            }

            if ((result as any)?.candidates) {
              const candidates = (result as any).candidates
              for (const cand of candidates) {
                if (cand?.content?.parts && Array.isArray(cand.content.parts)) {
                  for (const p of cand.content.parts) {
                    if (p && (p.thought || p.type === 'reasoning' || p.type === 'thought')) {
                      if (p.text) reasoningParts.push(p.text)
                      else if (p.content) reasoningParts.push(p.content)
                      else reasoningParts.push(JSON.stringify(p))
                    }
                  }
                }
              }
            }

            if (reasoningParts.length > 0) {
              console.log('Extracted reasoning parts (final):')
              for (const [i, r] of reasoningParts.entries()) {
                console.log(`[reasoning #${i + 1}]\n${r}`)
              }
            } else {
              console.log('No reasoning parts found in final result')
            }
          } catch (e) {
            console.warn('Failed to extract/log reasoning parts (final):', e)
          }

          const allToolResults: any[] = []

          const finalToolResults = (result as any).toolResults ?? result.toolCalls ?? []
          allToolResults.push(...finalToolResults)

          if ((result as any).steps) {
            for (const step of (result as any).steps) {
              const stepToolResults = step.toolResults ?? step.toolCalls ?? []
              allToolResults.push(...stepToolResults)
            }
          }

          const uniqueToolResults = allToolResults.filter(
            (result, index, array) =>
              index === array.findIndex(r => r.toolCallId === result.toolCallId)
          )

          if (directToolCallResult) {
            const existingIndex = uniqueToolResults.findIndex(
              r => r.toolCallId === directToolCallResult.toolCallId
            )
            if (existingIndex === -1) {
              uniqueToolResults.push(directToolCallResult)
            } else {
              uniqueToolResults[existingIndex] = directToolCallResult
            }
          }

          console.log(
            `Collected ${uniqueToolResults.length} unique tool results from all steps${directToolCallResult ? ' (including direct tool call)' : ''}`
          )

          for (const tr of uniqueToolResults) {
            const toolOutput = getToolOutputPayload(tr)
            if (
              tr.toolName === 'queryVTOP' &&
              toolOutput?.success &&
              toolOutput.data &&
              !toolOutput.parsedData
            ) {
              try {
                const userContext =
                  messages && messages.length > 0
                    ? messages
                        .filter((m: any) => m.role === 'user')
                        .slice(-3)
                        .map((m: any) => m.content)
                        .join(' | ')
                    : ''
                const parsed = await parseVTOPData(
                  toolOutput,
                  getToolInputPayload(tr)?.command || 'data',
                  userContext,
                  session.user.id
                )
                Object.assign(toolOutput, {
                  parsedData: parsed,
                  formatted_content: (parsed as any).formatted_content,
                  structured_data: (parsed as any).structured_data,
                  summary: (parsed as any).summary,
                })
              } catch (e) {
                console.error('Failed to parse VTOP data in final result:', e)
              }
            }
          }

          const allInvocations = uniqueToolResults.map((tr: any) => {
            const toolOutput = getToolOutputPayload(tr)
            const toolArgs = getToolInputPayload(tr) || {}
            return {
              toolCallId: tr.toolCallId || `${tr.toolName}-${Date.now()}`,
              toolName: tr.toolName,
              args: toolArgs,
              result: toolOutput || null,
              state: inferLegacyToolState(tr, toolOutput),
            }
          })

          const safeInvocations = sanitizeToolInvocations(allInvocations)

          try {
            await saveMessage(
              chat.id,
              'assistant',
              result.text,
              safeInvocations,
              result.response.id
            )
            console.log(`Final message saved with ${safeInvocations.length} tool invocations`)
          } catch (error) {
            console.error('Failed to save final message:', error)
            try {
              await saveMessage(chat.id, 'assistant', result.text, [], result.response.id)
              console.log('Final message saved without tool invocations (fallback)')
            } catch (fallbackError) {
              console.error(
                'Failed to save final message even without tool invocations:',
                fallbackError
              )
            }
          }

          try {
            const finalUsage = (result as any)?.usage
            if (!savedFinalStepUsage && finalUsage && typeof finalUsage === 'object') {
              const { saveTokenUsage } = await import('@/lib/db')
              await saveTokenUsage({
                userId: session.user.id,
                chatId: chat.id,
                model: modelName,
                stepIndex: null,
                promptTokens: finalUsage.promptTokens || 0,
                completionTokens: finalUsage.completionTokens || 0,
                totalTokens:
                  finalUsage.totalTokens ||
                  (finalUsage.promptTokens || 0) + (finalUsage.completionTokens || 0),
                meta: { type: 'final' },
              })
            }
          } catch (e) {
            console.warn('Failed to persist final usage:', e)
          }
        },
      },
      session.user.id
    )

    return resultStream.toUIMessageStreamResponse({
      originalMessages: uiMessages,
      generateMessageId: generateId,
      headers: {
        'X-Chat-Id': chat.id,
        'X-Chat-Path': `/chat/${chat.id}`,
      },
      messageMetadata: ({ part }) => {
        if (part.type === 'finish') {
          return {
            chatId: chat.id,
            chatPath: `/chat/${chat.id}`,
          }
        }
      },
      onError: () => 'An error occurred while processing your request.',
    })
  } catch (error: any) {
    console.error('Chat API error:', error)

    if (error.message?.includes('User rate limit exceeded')) {
      return new Response(
        JSON.stringify({
          error: 'RATE_LIMIT_EXCEEDED',
          message: error.message,
          type: 'user_rate_limit',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (error.message?.toLowerCase().includes('rate limit')) {
      return new Response(
        JSON.stringify({
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'The model is currently overloaded. Please try again later.',
          type: 'model_rate_limit',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
