import { createDataStream, smoothStream } from 'ai'
import { rateLimitedGoogle } from '@/lib/rate-limited-ai'
import { createVITTools } from '@/lib/tools'
import { VIT_SYSTEM_PROMPT } from '@/lib/prompts'
import { VIT_COMPREHENSIVE_KNOWLEDGE } from '@/lib/knowledge-base'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getChat,
  createChat,
  createChatWithFirstMessage,
  saveMessage,
  updateChat,
  createStreamId,
  getMostRecentStreamId,
  getLastAssistantMessage,
} from '@/lib/db'
import {
  generateChatPath,
  extractTitleFromContent,
  generateUUID,
  getTrailingMessageId,
} from '@/lib/utils'
import { z } from 'zod'
import { createResumableStreamContext, type ResumableStreamContext } from 'resumable-stream'
import { after } from 'next/server'
import { differenceInSeconds } from 'date-fns'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const maxDuration = 60

let globalStreamContext: ResumableStreamContext | null = null

function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      })
      console.log(' > Resumable streams enabled')
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(' > Resumable streams are disabled due to missing REDIS_URL')
      } else {
        console.error('Error creating resumable stream context:', error)
        console.log(' > Falling back to regular streaming without resumability')
      }
      return null
    }
  }

  return globalStreamContext
}

async function generateChatTitle(userMessage: string, userId?: string): Promise<string> {
  try {
    //console.log('Generating title for:', userMessage.substring(0, 50) + '...')

    const cleanMessage = userMessage.trim().toLowerCase()
    if (cleanMessage.length < 5 || ['hi', 'hello', 'hey', 'test', 'help', 'yo', 'sup'].includes(cleanMessage)) {
      console.log('⏭Skipping title generation for simple message')
      return extractTitleFromContent(userMessage)
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Title generation timeout')), 5000)
    )

    const modelPromise = rateLimitedGoogle.generateText(
      {
        model: await rateLimitedGoogle.model('gemini-2.5-flash-lite-preview-06-17'),
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
        maxTokens: 30,
      },
      userId
    )

    const result = (await Promise.race([modelPromise, timeoutPromise])) as any
    const generatedTitle = result.text
    const cleanTitle = generatedTitle.trim().replace(/^["']|["']$/g, '')

    if (cleanTitle && cleanTitle.length <= 60 && cleanTitle.length >= 3) {
      //console.log('Using AI-generated title:', cleanTitle)
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
    // if (process.env.NODE_ENV !== 'production') {
    //   console.log('parseVTOPData received:', {
    //     hasDownloadInfo: !!rawData.downloadInfo,
    //     hasServedFiles: !!(rawData.downloadInfo?.servedFiles),
    //     servedFilesLength: rawData.downloadInfo?.servedFiles?.length || 0,
    //     command
    //   });
    // }

    const vtopParseSchema = z.object({
      success: z.boolean(),
      formatted_content: z.string(),
      structured_data: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .optional(),
      summary: z.string(),
    })

    const result = await rateLimitedGoogle.generateObject(
      {
        model: await rateLimitedGoogle.model('gemini-2.5-flash-lite-preview-06-17'),
        schema: vtopParseSchema,
        prompt: `
You are a helpful assistant that parses VTOP (VIT Online Portal) data and formats it in a clean, natural language format.
For marks, when there's a lot of data and huge amount of subjects, you should summarize the data in a concise way with the help of tables.

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
    const cleanName = file.name.replace(/_\d+\.(pdf|pptx|docx|txt)$/i, '.$1')
    return `- <strong>${cleanName}</strong> <span style=  "color: #6b7280; font-size: 0.875rem;">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span> <a href="${file.downloadUrl}" download="${file.name}">Download</a>`
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
  const startTime = performance.now()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { messages, id: chatId, directToolCall, preferredTool } = await req.json()

    const authTime = performance.now()
    console.log(`Auth completed in ${(authTime - startTime).toFixed(2)}ms`)

    let chat = chatId ? await getChat(chatId, session.user.id) : null
    let firstUserMessage: any = null

    if (!chat) {
      const firstMessage = messages[0]
      const tempTitle = extractTitleFromContent(firstMessage?.content || 'New Chat')
      const path = generateChatPath()
      if (firstMessage?.role === 'user') {
        const chatCreateStart = performance.now()
        const result = await createChatWithFirstMessage(
          session.user.id,
          tempTitle,
          path,
          firstMessage.content,
          firstMessage.id
        )
        chat = result.chat
        firstUserMessage = result.message
        const chatCreateTime = performance.now()
        console.log(
          `Chat and first message created atomically in ${(chatCreateTime - chatCreateStart).toFixed(2)}ms`
        )
      } else {
        const chatCreateStart = performance.now()
        chat = await createChat(session.user.id, tempTitle, path)
        const chatCreateTime = performance.now()
        console.log(`Chat created in ${(chatCreateTime - chatCreateStart).toFixed(2)}ms`)
      }

      // Generate title asynchronously without blocking the response
      const userMessage = firstMessage?.content || ''
      if (userMessage.trim()) {
        // Fire and forget - don't await this
        setImmediate(() => {
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
        })
      }
    }

    if (directToolCall) {
      const tools = createVITTools()
      const tool = tools[directToolCall.toolName as keyof typeof tools]

      if (tool && typeof tool.execute === 'function') {
        try {
          const result = await tool.execute(directToolCall.args, {
            toolCallId: directToolCall.toolCallId || Date.now().toString(),
            messages: messages || [],
          })

          if (
            directToolCall.toolName === 'queryVTOP' &&
            result.success &&
            'data' in result &&
            result.data
          ) {
            try {
              const command = (
                'command' in result ? result.command : directToolCall.args?.command
              ) as string

              const userContext =
                messages && messages.length > 0
                  ? messages
                      .filter((m: any) => m.role === 'user')
                      .slice(-3)
                      .map((m: any) => m.content)
                      .join(' | ')
                  : ''
              const parsedData = await parseVTOPData(result, command, userContext, session.user.id)

              Object.assign(result, {
                parsedData,
                formatted_content: (parsedData as any).formatted_content,
                structured_data: (parsedData as any).structured_data,
                summary: (parsedData as any).summary,
              })

              const assistantResponse =
                (result as any).formatted_content ||
                (result as any).summary ||
                `Successfully retrieved your ${command} data from VTOP.`

              const toolInvocation = {
                toolCallId: directToolCall.toolCallId || Date.now().toString(),
                toolName: directToolCall.toolName,
                args: directToolCall.args,
                result: result,
                state: 'result',
              }

              await saveMessage(
                chat.id,
                'assistant',
                assistantResponse,
                [toolInvocation],
                Date.now().toString()
              )
            } catch (parseError) {
              console.error('Failed to parse VTOP data:', parseError)
            }
          }

          return new Response(JSON.stringify({ success: true, result }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error.message || 'Tool execution failed',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
        }
      } else {
        return new Response(JSON.stringify({ success: false, error: 'Tool not found' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    const userMessage = messages[messages.length - 1]
    if (userMessage.role === 'user' && !firstUserMessage) {
      await saveMessage(chat.id, 'user', userMessage.content, undefined, userMessage.id)
    }

    const streamId = generateUUID()
    await createStreamId(streamId, chat.id)

    const tools = createVITTools()

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

ADDITIONAL COMPREHENSIVE KNOWLEDGE:
${VIT_COMPREHENSIVE_KNOWLEDGE}${toolPreferenceGuidance}`

    const enhancedMessages = messages.map((message: any) => {
      if (
        message.role === 'assistant' &&
        message.toolInvocations &&
        message.toolInvocations.length > 0
      ) {
        let toolContext = ''

        for (const toolCall of message.toolInvocations) {
          if (toolCall.result) {
            if (toolCall.toolName === 'queryVTOP' && toolCall.result.success) {
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
    const stream = createDataStream({
      execute: async dataStream => {
        const result = await rateLimitedGoogle.streamText(
          {
            model: await rateLimitedGoogle.model('gemini-2.5-flash-lite-preview-06-17'),
            messages: [{ role: 'system', content: combinedSystemPrompt }, ...enhancedMessages],
            tools,
            temperature: 0.7,
            maxTokens: 4096,
            toolChoice: 'auto',
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: generateUUID,
            onFinish: async ({ response }: { response: any }) => {
              // console.log('DEBUG: onFinish response structure:', {
              //   hasToolResults: !!(response as any).toolResults,
              //   hasToolCalls: !!response.toolCalls,
              //   hasUsage: !!response.usage,
              //   hasToolInvocations: !!response.toolInvocations,
              //   responseKeys: Object.keys(response),
              //   toolResultsLength: ((response as any).toolResults ?? []).length,
              //   toolCallsLength: (response.toolCalls ?? []).length,
              //   toolInvocationsLength: (response.toolInvocations ?? []).length
              // })

              const toolResults =
                (response as any).toolResults ??
                response.toolCalls ??
                response.toolInvocations ??
                []

              for (const tr of toolResults) {
                if (
                  tr.toolName === 'queryVTOP' &&
                  tr.result?.success &&
                  tr.result.data &&
                  !tr.result.parsedData
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
                      tr.result,
                      tr.args.command,
                      userContext,
                      session.user.id
                    )
                    Object.assign(tr.result, {
                      parsedData: parsed,
                      formatted_content: (parsed as any).formatted_content,
                      structured_data: (parsed as any).structured_data,
                      summary: (parsed as any).summary,
                    })
                  } catch (e) {
                    console.error('Failed to parse VTOP data in stream:', e)
                  }
                }
              }

              const safeInvocations = JSON.parse(JSON.stringify(toolResults))

              let assistantId: string | undefined
              let messageText = ''

              if (
                response.messages &&
                Array.isArray(response.messages) &&
                response.messages.length > 0
              ) {
                const assistantMessages = response.messages.filter(
                  (message: any) => message.role === 'assistant'
                )

                if (assistantMessages.length > 0) {
                  const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]
                  const messageId = getTrailingMessageId(assistantMessages)
                  assistantId = messageId || undefined

                  if (lastAssistantMessage.content) {
                    if (typeof lastAssistantMessage.content === 'string') {
                      messageText = lastAssistantMessage.content
                    } else if (Array.isArray(lastAssistantMessage.content)) {
                      messageText = lastAssistantMessage.content
                        .filter((part: any) => part.type === 'text')
                        .map((part: any) => part.text)
                        .join('')
                    }
                  }
                }
              }
              if (!messageText && response.text) {
                messageText = response.text
                assistantId = assistantId || generateUUID()
              }

              if (!assistantId && safeInvocations && safeInvocations.length > 0) {
                assistantId = generateUUID()
              }

              if (assistantId && (messageText || (safeInvocations && safeInvocations.length > 0))) {
                try {
                  const contentToSave = messageText || ''
                  await saveMessage(
                    chat.id,
                    'assistant',
                    contentToSave,
                    safeInvocations,
                    assistantId
                  )
                  console.log('Assistant message saved successfully')
                } catch (saveError) {
                  console.error('Failed to save assistant message:', saveError)
                }
              } else {
                console.log('Skipping message save - missing data:', {
                  hasAssistantId: !!assistantId,
                  hasMessageText: !!messageText,
                  textLength: messageText?.length || 0,
                  hasToolInvocations: !!(safeInvocations && safeInvocations.length > 0),
                })
              }
            },
          },
          session.user.id
        )
        console.log('Before consumeStream()')
        result.consumeStream()
        console.log('After consumeStream()')

        console.log('Before mergeIntoDataStream()')
        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        })
        console.log('After mergeIntoDataStream()')
      },
      onError: (error: any) => {
        console.error('Data stream error:', error)
        const errorMessage =
          error?.message || 'An unexpected error occurred while processing your request'
        console.log('Simplified error message:', errorMessage)
        return `Error: ${errorMessage}`
      },
    })
    const streamContext = getStreamContext()

    if (streamContext) {
      try {
        console.log('Creating resumable stream with ID:', streamId)
        const resumableResponse = await streamContext.resumableStream(streamId, () => stream)

        console.log('Resumable stream created:', {
          isResponse: resumableResponse instanceof Response,
          hasBody: !!(resumableResponse as any)?.body,
          isReadableStream: resumableResponse instanceof ReadableStream,
          constructor: resumableResponse?.constructor?.name,
          headers:
            resumableResponse instanceof Response
              ? Array.from((resumableResponse as Response).headers.entries())
              : 'not a response',
        })

        return new Response(resumableResponse, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Chat-Id': chat.id,
            'X-Chat-Path': `/chat/${chat.id}`,
          },
        })
      } catch (resumableError) {
        console.error('Resumable stream error, falling back to regular stream:', resumableError)
      }
    }

    console.log('Using regular streaming (no resumable context or error occurred)')
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Chat-Id': chat.id,
        'X-Chat-Path': `/chat/${chat.id}`,
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

    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function GET(request: Request) {
  const startTime = performance.now() // Performance tracking
  const streamContext = getStreamContext()
  const resumeRequestedAt = new Date()

  if (!streamContext) {
    return new Response(null, { status: 204 })
  }

  const { searchParams } = new URL(request.url)
  const chatId = searchParams.get('chatId')

  if (!chatId) {
    return new Response('Bad Request: chatId is required', { status: 400 })
  }

  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }
  const [chat, recentStreamId] = await Promise.all([
    getChat(chatId, session.user.id),
    getMostRecentStreamId(chatId),
  ])

  const dbQueryTime = performance.now()
  console.log(`DB queries completed in ${(dbQueryTime - startTime).toFixed(2)}ms`)

  if (!chat) {
    return new Response('Chat not found', { status: 404 })
  }

  if (!recentStreamId) {
    return new Response('No streams found', { status: 404 })
  }
  const emptyDataStream = createDataStream({
    execute: () => {},
  })
  console.log('Attempting to resume stream for chatId:', chatId, 'with streamId:', recentStreamId)

  let stream: ReadableStream | Response | null = null

  try {
    const streamPromise = streamContext.resumableStream(recentStreamId, () => emptyDataStream)

    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('Stream resume timeout')), 1000)
    )

    stream = await Promise.race([streamPromise, timeoutPromise])
  } catch (resumeError) {
    console.error('Failed to resume stream or timeout occurred:', resumeError)
    stream = null
  }

  console.log('Resume stream result:', {
    streamExists: !!stream,
    isResponse: stream instanceof Response,
    isReadableStream: stream instanceof ReadableStream,
    constructor: stream?.constructor?.name,
    streamId: recentStreamId,
  })
  if (stream) {
    const resumeTime = performance.now()
    console.log(`Stream resumed successfully in ${(resumeTime - startTime).toFixed(2)}ms`)
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Chat-Id': chat.id,
        'X-Chat-Path': `/chat/${chat.id}`,
      },
    })
  }

  const dbRestoreStartTime = performance.now()
  console.log('No resumable stream found, attempting database restore...')
  const mostRecentMessage = await getLastAssistantMessage(chatId)

  const dbRestoreTime = performance.now()
  console.log(`DB restore query completed in ${(dbRestoreTime - dbRestoreStartTime).toFixed(2)}ms`)

  if (!mostRecentMessage) {
    console.log('No assistant messages found in database')
    return new Response(emptyDataStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Chat-Id': chat.id,
        'X-Chat-Path': `/chat/${chat.id}`,
      },
    })
  }

  const messageCreatedAt = new Date(mostRecentMessage.created_at)

  if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
    console.log('Message too old for restore (>15s)')
    return new Response(emptyDataStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Chat-Id': chat.id,
        'X-Chat-Path': `/chat/${chat.id}`,
      },
    })
  }
  console.log('Restoring message from database')
  const restoredStream = createDataStream({
    execute: buffer => {
      buffer.writeData({
        type: 'append-message',
        message: JSON.stringify(mostRecentMessage),
      })
    },
  })

  const totalTime = performance.now()
  console.log(`Database restore completed in ${(totalTime - startTime).toFixed(2)}ms total`)

  return new Response(restoredStream, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Chat-Id': chat.id,
      'X-Chat-Path': `/chat/${chat.id}`,
    },
  })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return new Response('Bad Request: id is required', { status: 400 })
  }

  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const chat = await getChat(id, session.user.id)

  if (!chat) {
    return new Response('Chat not found', { status: 404 })
  }

  try {
    await prisma.chat.delete({
      where: { id },
    })

    return Response.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error deleting chat:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
