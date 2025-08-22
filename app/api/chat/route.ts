'use server'

import { z } from 'zod'
import {
  convertToModelMessages,
  type UIMessage as SDKUIMessage,
  type ModelMessage as SDKModelMessage,
} from 'ai'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { createVITTools } from '@/lib/tools'
import { VIT_SYSTEM_PROMPT } from '@/lib/prompts'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getChat, createChat, saveMessage, updateChat } from '@/lib/db'
import { memoryService } from '@/lib/memory/memory-service'
import { generateChatPath, extractTitleFromContent } from '@/lib/utils'
import { sanitizeToolInvocations } from '@/lib/sanitize-tools'

/** ---- local UI-shape used by your client payload ---- */
type UIMsg = {
  id?: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  parts?: Array<{ type: string; text?: string }>
  attachments?: Array<{ url: string; contentType: string; name?: string }>
  toolInvocations?: any[]
  toolCalls?: any[]
}

/** ---- helpers (UI → text) ---- */
const getTextFromUIMsg = (m: UIMsg): string => {
  if (Array.isArray(m.parts) && m.parts.length) {
    return m.parts
      .filter((p) => p?.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('\n')
  }
  if (typeof m.content === 'string') return m.content
  return ''
}

/** Normalize UIMsg[] to SDK UIMessage[] for conversion (ensure id:string) */
const normalizeToUI = (msgs: UIMsg[]): SDKUIMessage[] =>
  msgs
    .filter((m) => m.role !== 'tool') // UIMessage doesn't carry 'tool' role for conversion
    .map((m, idx) => {
      const id = m.id ?? `ui-${idx}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const parts =
        Array.isArray(m.parts) && m.parts.length
          ? m.parts
              .filter((p) => p?.type === 'text' && typeof p.text === 'string')
              .map((p) => ({ type: 'text', text: String(p.text) }) as const)
          : typeof m.content === 'string' && m.content.trim()
          ? ([{ type: 'text', text: m.content }] as const)
          : ([] as const)
      return {
        id,
        role: (m.role as SDKUIMessage['role']) || 'user',
        parts: parts as unknown as SDKUIMessage['parts'],
      }
    })

/** Build a human-readable context string from tool results and stitch into assistant text */
const toolContextFromAssistant = (msg: UIMsg): string => {
  if (!msg?.toolInvocations || !Array.isArray(msg.toolInvocations)) return ''
  let toolContext = ''

  for (const toolCall of msg.toolInvocations) {
    if (!toolCall?.result) continue

    if (toolCall.toolName === 'knowledgeBase' && toolCall.result.success && toolCall.result.chunks) {
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
        toolContext += `\n\n[VTOP ${String(command).toUpperCase()} DATA CONTEXT]:\n${dataContext}`
        toolContext += `\n\n[IMPORTANT]: VTOP ${command} data was successfully retrieved above. Use this data to answer any follow-up questions about ${command}.`
      }
    } else if (toolCall.result.papers?.length > 0) {
      toolContext += `\n\n[PAPERS DATA CONTEXT]:\nFound ${toolCall.result.papers.length} past papers`
    } else if (toolCall.result.faculty?.length > 0) {
      toolContext += `\n\n[FACULTY DATA CONTEXT]:\nFound ${toolCall.result.faculty.length} faculty members`
    } else if (toolCall.result.companies?.length > 0) {
      toolContext += `\n\n[COMPANIES DATA CONTEXT]:\nFound ${toolCall.result.companies.length} companies`
    } else if (toolCall.result.data?.todayMenu) {
      toolContext += `\n\n[MESS MENU DATA CONTEXT]:\nRetrieved mess menu for ${toolCall.result.data.messType}`
    }
  }

  return toolContext
}

/** ---- title generation ---- */
async function generateChatTitle(userMessage: string, userId?: string): Promise<string> {
  try {
    const cleanMessage = userMessage.trim().toLowerCase()
    if (cleanMessage.length < 10 || ['hi', 'hello', 'hey', 'test', 'help'].includes(cleanMessage)) {
      return extractTitleFromContent(userMessage)
    }

    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error('Title generation timeout')), 5000)
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
        maxOutputTokens: 50,
      },
      userId
    )

    const result = (await Promise.race([modelPromise, timeoutPromise])) as any
    const generatedTitle = result.text.text
    const cleanTitle = generatedTitle.trim().replace(/^["']|["']$/g, '')

    if (cleanTitle && cleanTitle.length <= 60 && cleanTitle.length >= 3) {
      return cleanTitle
    }

    return extractTitleFromContent(userMessage)
  } catch (error) {
    console.error('Title generation failed:', error instanceof Error ? error.message : String(error))
    return extractTitleFromContent(userMessage)
  }
}

/** ---- VTOP data parsing ---- */
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

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const json = await req.json()
    const messages: UIMsg[] = Array.isArray(json) ? json : json.messages || []
    const chatId = Array.isArray(json) ? undefined : json.id
    const directToolCall = Array.isArray(json) ? undefined : json.directToolCall
    const preferredTool = Array.isArray(json) ? undefined : json.preferredTool

    let chat = chatId ? await getChat(chatId, session.user.id) : null
    if (!chat) {
      const firstText = messages[0] ? getTextFromUIMsg(messages[0]) : ''
      const tempTitle = extractTitleFromContent(firstText || 'New Chat')
      const path = generateChatPath()
      chat = await createChat(session.user.id, tempTitle, path, chatId)

      if (firstText.trim()) {
        setTimeout(() => {
          generateChatTitle(firstText, session.user.id)
            .then(async (properTitle) => {
              if (properTitle !== tempTitle) {
                await updateChat(chat!.id, properTitle)
                console.log('Chat title updated successfully:', properTitle)
              }
            })
            .catch((error) => {
              console.error('Failed to update chat title:', error)
            })
        }, 2000)
      }
    }

    /** ---------- optional direct tool call short-circuit ---------- */
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

        // convert UI messages to ModelMessage[] for ToolCallOptions
        const toolMsgModels: SDKModelMessage[] = convertToModelMessages(
          normalizeToUI(messages).filter((m) => m.role !== 'system')
        )

        try {
          const result: any = await tool.execute(directToolCall.args, {
            toolCallId: directToolCall.toolCallId || Date.now().toString(),
            messages: toolMsgModels, // ✅ satisfies ToolCallOptions.messages
          })

          if (
            directToolCall.toolName === 'queryVTOP' &&
            'success' in result &&
            (result as any).success &&
            'data' in result &&
            (result as any).data
          ) {
            try {
              const command =
                ('command' in result ? result.command : directToolCall.args?.command) as string

              const userContext =
                messages && messages.length > 0
                  ? messages
                      .filter((m: any) => m.role === 'user')
                      .slice(-3)
                      .map((m: any) => getTextFromUIMsg(m))
                      .join(' | ')
                  : ''
              const parsedData = await parseVTOPData(result, command, userContext, session.user.id)

              Object.assign(result, {
                parsedData,
                formatted_content: (parsedData as any).formatted_content,
                structured_data: (parsedData as any).structured_data,
                summary: (parsedData as any).summary,
              })

              directToolCallResult = {
                toolCallId: directToolCall.toolCallId || Date.now().toString(),
                toolName: directToolCall.toolName,
                args: directToolCall.args,
                result: result,
                state: 'result',
              }
              directToolCallExecuted = true
            } catch (parseError) {
              console.error('Failed to parse VTOP data:', parseError)
              directToolCallResult = {
                toolCallId: directToolCall.toolCallId || Date.now().toString(),
                toolName: directToolCall.toolName,
                args: directToolCall.args,
                result: result,
                state: 'result',
              }
              directToolCallExecuted = true
            }
          } else {
            directToolCallResult = {
              toolCallId: directToolCall.toolCallId || Date.now().toString(),
              toolName: directToolCall.toolName,
              args: directToolCall.args,
              result: result,
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

    /** ---------- persist last user msg ---------- */
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.role === 'user') {
      const textContent = getTextFromUIMsg(lastMsg)
      await saveMessage(chat!.id, 'user', textContent, undefined, lastMsg.id)
    }

    /** ---------- memory + tool preference banners in system ---------- */
    const memorySettings = await memoryService.getUserMemorySettings(session.user.id)
    const isMemoryEnabled = memorySettings?.isEnabled ?? true

    let memoryContextSnippet = ''
    if (isMemoryEnabled && lastMsg?.role === 'user') {
      try {
        const memories = await memoryService.getUserMemories(session.user.id, { pageSize: 100 })
        if (memories.length > 0) {
          memoryContextSnippet = `
<memory_context>
  <instructions>Use the following information to provide more personalized and relevant responses.</instructions>
  <memories>
${memories
  .map(
    (m: { content: string; updatedAt: string | number | Date }) =>
      `    <memory>
      <content>${m.content}</content>
      <last_updated>${new Date(m.updatedAt).toLocaleDateString()}</last_updated>
    </memory>`
  )
  .join('\n')}
  </memories>
</memory_context>`
        }
      } catch {}
    }

    const toolPreferenceGuidance = preferredTool
      ? `

IMPORTANT: The user has specifically selected the "${preferredTool}" tool. When responding to their query, you should prioritize using this tool if it's relevant to their question. Available tools and their purposes:

- reddit-search: Use searchRedditKnowledge or searchRedditWithContext for student discussions and academic advice
- vtop-query: Use queryVTOP for personal VTOP data like grades, attendance, timetable  
- past-papers: Use findPastPapers for examination papers and course materials
- mess-menu: Use getMessMenu for hostel dining information

If the user's query is relevant to the selected tool "${preferredTool}", use it even if other tools might also be applicable.`
      : ''

    const combinedSystemPrompt = `${VIT_SYSTEM_PROMPT}  
${toolPreferenceGuidance}${memoryContextSnippet}

CRITICAL TOOL CONTINUATION RULES:
- YOU MUST NEVER STOP AFTER CALLING A TOOL
- Tool calls are ONLY information gathering steps, NOT final responses
- After ANY tool call (especially knowledgeBase), you MUST immediately continue with a natural response
- When you call knowledgeBase, that's step 1 - step 2 is ALWAYS providing your answer using that information
- If you call a tool and don't continue with text, you have failed the user
- The conversation flow is: [user question] → [tool call] → [YOUR RESPONSE USING TOOL RESULTS]
- NEVER end the conversation at a tool call - always synthesize and respond`

    /** ---------- construct ModelMessage[] for AI SDK v5 ---------- */
    // First, stitch tool context into assistant text where relevant:
    const augmented = messages.map((m) => {
      if (m.role !== 'assistant') return m
      const ctx = toolContextFromAssistant(m)
      if (!ctx) return m
      const baseText = getTextFromUIMsg(m)
      return {
        ...m,
        parts: [{ type: 'text', text: (baseText || '') + ctx }],
        content: undefined, // prefer parts in UI -> conversion path
      }
    })

    const attachmentAware = augmented.some(
      (m: any) =>
        Array.isArray(m.attachments) &&
        m.attachments.some(
          (a: any) =>
            a?.contentType?.startsWith('application/pdf') || a?.contentType?.startsWith('image/')
        )
    )

    const modelMessages: SDKModelMessage[] = []

    modelMessages.push({
      role: 'system',
      content: combinedSystemPrompt,
    })

    if (!attachmentAware) {
      const uiMsgs: SDKUIMessage[] = normalizeToUI(
        augmented.filter((m) => m.role !== 'system')
      )
      const coreMsgs = convertToModelMessages(uiMsgs)
      modelMessages.push(...coreMsgs)
    } else {
      for (const m of augmented) {
        if (m.role === 'system') continue
        const role = (m.role as 'user' | 'assistant') || 'user'

        const text = getTextFromUIMsg(m)
        const attachments = m.attachments || []

        if (!attachments.length) {
          modelMessages.push({ role, content: text })
          continue
        }

        let content: string | Array<any> = text
        for (const att of attachments) {
          if (!att?.contentType) continue
          if (att.contentType.startsWith('application/pdf')) {
            try {
              const res = await fetch(att.url)
              if (!res.ok) throw new Error(`fetch ${res.status}`)
              const ab = await res.arrayBuffer()
              const sizeMB = ab.byteLength / (1024 * 1024)
              if (sizeMB > 25) {
                content = (Array.isArray(content) ? content : [{ type: 'text', text: content }])
                  .concat({ type: 'text', text: `Attachment '${att.name || 'file'}' skipped: size ${sizeMB.toFixed(1)}MB exceeds 25MB limit.` })
                continue
              }
              content = (Array.isArray(content) ? content : [{ type: 'text', text: content }])
                .concat({ type: 'file', file: Buffer.from(ab), mediaType: att.contentType })
            } catch (e: any) {
              content = (Array.isArray(content) ? content : [{ type: 'text', text: content }])
                .concat({ type: 'text', text: `Failed to load attachment '${att.name || 'file'}': ${e.message}` })
            }
          } else if (att.contentType.startsWith('image/')) {
            try {
              const res = await fetch(att.url)
              if (!res.ok) throw new Error(`fetch ${res.status}`)
              const ab = await res.arrayBuffer()
              const sizeMB = ab.byteLength / (1024 * 1024)
              if (sizeMB > 25) {
                content = (Array.isArray(content) ? content : [{ type: 'text', text: content }])
                  .concat({ type: 'text', text: `Attachment '${att.name || 'file'}' skipped: size ${sizeMB.toFixed(1)}MB exceeds 25MB limit.` })
                continue
              }
              content = (Array.isArray(content) ? content : [{ type: 'text', text: content }])
                .concat({ type: 'image', image: Buffer.from(ab), mediaType: att.contentType })
            } catch (e: any) {
              content = (Array.isArray(content) ? content : [{ type: 'text', text: content }])
                .concat({ type: 'text', text: `Failed to load attachment '${att.name || 'file'}': ${e.message}` })
            }
          }
        }
        modelMessages.push({ role, content })
      }
    }

    /** ---------- direct tool call immediate response path ---------- */
    if (
      directToolCallResult &&
      directToolCallExecuted &&
      directToolCallResult.result?.formatted_content
    ) {
      const responseText =
        directToolCallResult.result.formatted_content ||
        directToolCallResult.result.summary ||
        `Here's your ${directToolCallResult.args?.command || 'data'} from VTOP.`

      const safeInvocations = sanitizeToolInvocations([
        {
          toolCallId: directToolCallResult.toolCallId,
          toolName: directToolCallResult.toolName,
          args: directToolCallResult.args,
          result: directToolCallResult.result,
          state: directToolCallResult.state,
        },
      ])

      try {
        await saveMessage(
          chat!.id,
          'assistant',
          responseText,
          safeInvocations,
          `direct-${Date.now()}`
        )
        console.log('Direct tool call message saved with tool invocation')
      } catch (error) {
        console.error('Failed to save direct tool call message:', error)
      }

      // Maintain backward-compatible streaming frames for your client parser
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `9:{"toolCallId":"${directToolCallResult.toolCallId}","toolName":"${directToolCallResult.toolName}","args":${JSON.stringify(
                directToolCallResult.args
              )}}\n`
            )
          )
          controller.enqueue(
            encoder.encode(
              `a:{"toolCallId":"${directToolCallResult.toolCallId}","result":${JSON.stringify(
                directToolCallResult.result
              )}}\n`
            )
          )
          controller.enqueue(encoder.encode(`0:"${responseText.replace(/"/g, '\\"')}"\n`))
          controller.enqueue(
            encoder.encode(
              `e:{"finishReason":"stop","usage":{"promptTokens":100,"completionTokens":50},"isContinued":false}\n`
            )
          )
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Chat-Id': chat!.id,
          'X-Chat-Path': chat!.path,
        },
      })
    }

    /** ---------- stream from Google via rate-limiter wrapper ---------- */
    const tools = createVITTools(session.user.id)
    // Ensure only ModelMessage[] is passed
    let safeModelMessages = modelMessages
    if (
      !Array.isArray(modelMessages) ||
      modelMessages.some(
        (msg) => !msg.role || typeof msg.content === 'undefined'
      )
    ) {
      // Fallback: convert any UIMessage[] to ModelMessage[]
      try {
        // @ts-ignore
        safeModelMessages = convertToModelMessages(modelMessages)
      } catch (e) {
        console.error('Failed to convert messages to ModelMessage[]:', e)
        throw new Error('Invalid message format for Google API')
      }
    }
    const result = await rateLimitedAI.google.streamText({
      model: await rateLimitedAI.google.model('gemini-2.5-flash'),
      messages: safeModelMessages, // always ModelMessage[]
      tools,
      temperature: 0.7,
      maxTokens: 4096,
      maxSteps: 5,
    })

    // Helper: convert UIMessage parts to legacy toolInvocations for DB persistence
    const toToolInvocations = (parts: any[]): any[] => {
      const out: any[] = []
      for (const p of Array.isArray(parts) ? parts : []) {
        if (!p || typeof p.type !== 'string') continue
        if (p.type === 'tool-call') {
          const name = p.toolName || p.name || 'unknown'
          out.push({
            toolCallId: p.toolCallId || `${name}-${Date.now()}`,
            toolName: name,
            args: p.input ?? p.args,
            state: 'call',
            result: undefined,
          })
        } else if (p.type === 'tool-result') {
          const name = p.toolName || p.name || 'unknown'
          out.push({
            toolCallId: p.toolCallId || `${name}-${Date.now()}`,
            toolName: name,
            args: undefined,
            state: 'result',
            result: p.result ?? p.output,
          })
        } else if (p.type.startsWith('tool-')) {
          const toolName = p.type.replace(/^tool-/, '')
          const state =
            p.state === 'output-available' || p.state === 'output-error' ? 'result' : 'call'
          const result =
            p.state === 'output-available'
              ? p.output
              : p.state === 'output-error'
              ? { success: false, error: p.errorText || 'Tool error' }
              : undefined
          const args = p.input ?? p.args
          out.push({
            toolCallId: p.toolCallId || `${toolName}-${Date.now()}`,
            toolName,
            args,
            state,
            result,
          })
        }
      }
      return out
    }

    const extractText = (msg: any): string => {
      try {
        // Prefer UIMessage.parts -> text
        if (Array.isArray(msg?.parts)) {
          const t = msg.parts
            .filter((p: any) => p && p.type === 'text' && typeof p.text === 'string')
            .map((p: any) => p.text)
            .join('\n')
          if (t) return t
        }
        // Fallback: string content
        if (typeof msg?.content === 'string') return msg.content
        // Fallback: array content segments
        if (Array.isArray(msg?.content)) {
          const t = msg.content
            .filter((c: any) => c && c.type === 'text' && typeof c.text === 'string')
            .map((c: any) => c.text)
            .join('\n')
          if (t) return t
        }
        // Fallback: text field
        if (typeof msg?.text === 'string') return msg.text
      } catch {}
      return ''
    }

    return result.toUIMessageStreamResponse({
      async onFinish(payload: any) {
        // Optional structured debug logging (no content leakage)
        const DEBUG = process.env.DEBUG_AI_STREAM === '1' || process.env.NODE_ENV !== 'production'
        const safeLog = (...args: any[]) => {
          if (DEBUG) {
            try {
              console.log('[chat:onFinish]', ...args)
            } catch {}
          }
        }
        try {
          // Adapter variants:
          // - payload.message (UIMessage)
          // - payload.responseMessage (UI/UI-like message)
          // - payload.messages (array of messages; take the last)
          const responseMessage = payload?.responseMessage
          const messagesArray = Array.isArray(payload?.messages) ? payload.messages : undefined
          const finalMessage =
            payload?.message ??
            responseMessage ??
            (messagesArray && messagesArray.length ? messagesArray[messagesArray.length - 1] : payload)
          const payloadKeys = payload && typeof payload === 'object' ? Object.keys(payload) : []
          const responseMessageKeys = responseMessage && typeof responseMessage === 'object' ? Object.keys(responseMessage) : []
          const messagesLength = Array.isArray(messagesArray) ? messagesArray.length : 0
          // Summarize parts
          const parts: any[] = Array.isArray(finalMessage?.parts) ? finalMessage.parts : []
          const typeCounts: Record<string, number> = {}
          for (const p of parts) {
            const t = (p && typeof p.type === 'string') ? p.type : 'unknown'
            typeCounts[t] = (typeCounts[t] || 0) + 1
          }

          let text = extractText(finalMessage)
          const invocations = toToolInvocations(parts)

          // If no direct text but tool parsed content exists, use that
          if (!text && Array.isArray(invocations)) {
            const formatted = invocations.find((i: any) => i?.result?.formatted_content)?.result
              ?.formatted_content
            if (typeof formatted === 'string' && formatted.trim()) {
              text = formatted
            }
          }

          // Log summary (no text content)
          safeLog({
            role: finalMessage?.role,
            id: finalMessage?.id,
            payloadHasMessage: Boolean(payload?.message),
            payloadKeys,
            hasResponseMessage: Boolean(responseMessage),
            responseMessageKeys,
            messagesLength,
            partsCount: parts.length,
            partTypes: typeCounts,
            contentType: typeof finalMessage?.content,
            contentIsArray: Array.isArray(finalMessage?.content) || undefined,
            textLength: typeof text === 'string' ? text.length : 0,
            invocationsCount: Array.isArray(invocations) ? invocations.length : 0,
          })

          await saveMessage(chat!.id, 'assistant', text || '', invocations)
        } catch (e) {
          console.error('Failed to persist assistant message:', e)
          // If failing to persist, still log a minimal finalMessage shape for diagnosis
          try {
            const finalMessage = payload?.message ?? payload
            const keys = finalMessage && typeof finalMessage === 'object' ? Object.keys(finalMessage) : []
            console.log('[chat:onFinish:error] finalMessage keys:', keys)
          } catch {}
        }
      },
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

    if (String(error.message || '').toLowerCase().includes('rate limit')) {
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
