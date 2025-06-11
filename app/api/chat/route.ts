import { streamText, generateObject } from "ai"
import { google } from "@ai-sdk/google"
import { createVITTools } from "@/lib/tools"
import { VIT_SYSTEM_PROMPT } from "@/lib/prompts"
import { VIT_COMPREHENSIVE_KNOWLEDGE } from "@/lib/knowledge-base"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getChat, createChat, saveMessage, updateChat } from "@/lib/db"
import { generateChatPath, extractTitleFromContent } from "@/lib/utils"
import { z } from "zod"

export const runtime = "nodejs"
export const maxDuration = 60


async function parseVTOPData(rawData: any, command: string, userContext: string = '') {
  try {
    const vtopParseSchema = z.object({
      success: z.boolean(),
      formatted_content: z.string(),
      // optional here to avoid schema `required` mismatch
      structured_data: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .optional(),
      summary: z.string(),
    })

    const result = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: vtopParseSchema,
      prompt: `
You are a helpful assistant that parses VTOP (VIT Online Portal) data and formats it in a clean, natural language format.

USER'S ORIGINAL REQUEST: ${userContext}
Command: ${command}
Raw Data: ${JSON.stringify(rawData)}

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

get rid of any mentions about the existence of an ICS file even if it has been provided to you in the prompt, you must not include any such information in your output.

FORMATTING GUIDELINES:
1. Use natural language sentences and paragraphs, not tables or lists
2. If you need to present tabular data, use HTML table tags: <table>, <tr>, <td>, <th>
3. Use HTML formatting tags like <strong>, <em>, <br>, <p> for better presentation
4. For profile data: Write in natural sentences about the person's details
5. For attendance: Describe attendance in conversational language
6. For marks/grades: Explain performance in narrative form
7. For receipts/financial data: Describe transactions naturally with HTML tables if needed
8. For timetable: Present schedule information conversationally
9. Make it engaging and easy to read, like explaining to a friend
10. Always relate back to what the user originally asked for

Example formats:
- Receipts: "Here are your recent payments to VIT: <table><tr><th>Date</th><th>Amount</th><th>Description</th></tr>..."
- Attendance: "Your attendance looks good overall. In Mathematics, you have 85% attendance which is above the required 75%..."
- Timetable for "Thursday classes": "Looking at your Thursday schedule specifically, you have..."

Make the formatted_content engaging and conversational while being informative and contextually relevant to the user's request.
`,
    })

    return result.object
  } catch (error) {
    console.error("Error parsing VTOP data with AI SDK:", error)
    return {
      success: false,
      error: "Failed to parse VTOP data",
      formatted_content: "Unable to parse the data at this time.",
      structured_data: {},
      summary: "Parsing failed",
    }
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 })
    }
    const { messages, id: chatId, directToolCall } = await req.json()

    // ---- Direct tool call handling ----
    if (directToolCall) {
      const tools = createVITTools()
      const tool = tools[directToolCall.toolName as keyof typeof tools]

      if (tool && typeof tool.execute === "function") {
        try {
          let chat = chatId
            ? await getChat(chatId, session.user.id)
            : null
          if (!chat) {
            const title = extractTitleFromContent(messages[0]?.content || "New Chat")
            const path = generateChatPath()
            chat = await createChat(session.user.id, title, path)
          }

          const userMessage = messages[messages.length - 1]
          if (userMessage?.role === "user") {
            await saveMessage(
              chat.id,
              "user",
              userMessage.content,
              undefined,
              userMessage.id
            )
          }

          const result = await tool.execute(directToolCall.args, {
            toolCallId: directToolCall.toolCallId || Date.now().toString(),
            messages: messages || [],
          })

          if (
            directToolCall.toolName === "queryVTOP" &&
            result.success &&
            "data" in result &&
            result.data
          ) {
            try {
              const command = ("command" in result
                ? result.command
                : directToolCall.args?.command) as string
              
              // Extract user context from the last 3 user messages for better context
              const userContext = messages && messages.length > 0 
                ? messages
                    .filter((m: any) => m.role === 'user')
                    .slice(-3)
                    .map((m: any) => m.content)
                    .join(' | ')
                : ''
              
              const parsedData = await parseVTOPData(result.data, command, userContext)

              Object.assign(result, {
                parsedData,
                formatted_content: parsedData.formatted_content,
                structured_data: parsedData.structured_data,
                summary: parsedData.summary,
              })
            } catch (parseError) {
              console.error("Failed to parse VTOP data:", parseError)
            }
          }

          // Save the assistant response with tool result to chat history
          const assistantMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: (result as any).formatted_content || result.message || `Tool ${directToolCall.toolName} executed successfully.`,
            toolInvocations: [{
              toolCallId: directToolCall.toolCallId,
              toolName: directToolCall.toolName,
              args: directToolCall.args,
              result: result
            }]
          }

          await saveMessage(
            chat.id,
            "assistant",
            assistantMessage.content,
            assistantMessage.toolInvocations,
            assistantMessage.id
          )

          return new Response(JSON.stringify({ 
            success: true, 
            result,
            chatId: chat.id // Include chatId so frontend can update URL if needed
          }), {
            headers: { "Content-Type": "application/json" },
          })
        } catch (error: any) {
          return new Response(
            JSON.stringify({
              success: false,
              error: error.message || "Tool execution failed",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          )
        }
      } else {
        return new Response(
          JSON.stringify({ success: false, error: "Tool not found" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      }
    }

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "API key not configured. Please add GOOGLE_GENERATIVE_AI_API_KEY to your environment variables.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    let chat = chatId
      ? await getChat(chatId, session.user.id)
      : null
    if (!chat) {
      const title = extractTitleFromContent(messages[0]?.content || "New Chat")
      const path = generateChatPath()
      chat = await createChat(session.user.id, title, path)
    }

    const userMessage = messages[messages.length - 1]
    if (userMessage.role === "user") {
      await saveMessage(
        chat.id,
        "user",
        userMessage.content,
        undefined,
        userMessage.id
      )
    }

    const tools = createVITTools()
    
    // Check if there's existing VTOP context data in the conversation
    let hasVTOPContext = false
    let contextSummary = ''
    
    for (const message of messages) {
      if (message.role === 'assistant' && message.toolInvocations) {
        for (const toolCall of message.toolInvocations) {
          if (toolCall.result && toolCall.toolName === 'queryVTOP' && 
              (toolCall.result.data || toolCall.result.output || toolCall.result.formatted_content)) {
            hasVTOPContext = true
            const command = toolCall.result.command || toolCall.args?.command || 'data'
            contextSummary += `[VTOP ${command.toUpperCase()} DATA AVAILABLE] `
            console.log(`🔍 Found VTOP context: ${command} data available`)
          }
        }
      }
    }
    
    console.log(`🚨 hasVTOPContext: ${hasVTOPContext}, contextSummary: "${contextSummary}"`)
    console.log(`🔧 toolChoice will be: ${hasVTOPContext ? "none" : "auto"}`)
    
    const contextWarning = hasVTOPContext ? 
      `🚨🚨🚨 STOP! VTOP DATA ALREADY EXISTS IN THIS CONVERSATION (${contextSummary})

YOU ARE FORBIDDEN FROM ASKING FOR CREDENTIALS OR CALLING TOOLS WHEN DATA EXISTS!

LOOK FOR [VTOP DATA CONTEXT] SECTIONS BELOW AND ANSWER FROM THAT DATA IMMEDIATELY.

If user asks about seat numbers, exams, attendance, timetable, or marks - CHECK THE CONTEXT SECTIONS FIRST!

TOOLS ARE DISABLED - YOU MUST USE EXISTING DATA ONLY!

🚨🚨🚨

` : ''
    
    const combinedSystemPrompt = `${contextWarning}${VIT_SYSTEM_PROMPT}

ADDITIONAL COMPREHENSIVE KNOWLEDGE:
${VIT_COMPREHENSIVE_KNOWLEDGE}`

    const enhancedMessages = messages.map((message: any) => {
      if (message.role === 'assistant' && message.toolInvocations && message.toolInvocations.length > 0) {
        let toolContext = ''
        
        for (const toolCall of message.toolInvocations) {
          if (toolCall.result) {
            console.log('Processing tool call for context:', {
              toolName: toolCall.toolName,
              hasData: !!(toolCall.result.data || toolCall.result.output || toolCall.result.formatted_content),
              resultKeys: Object.keys(toolCall.result)
            })
            
            if (toolCall.toolName === 'queryVTOP' && (toolCall.result.data || toolCall.result.output || toolCall.result.formatted_content)) {
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
                console.log(`Added context for ${command}:`, dataContext.substring(0, 100) + '...')
                
                // Add a more specific context injection for the current conversation
                if (command === 'exams' && dataContext.includes('seat')) {
                  toolContext += `\n\n🚨 EXAM DATA AVAILABLE: You can answer questions about seat numbers, exam dates, venues, and times from this data!`
                }
                if (command === 'attendance' && dataContext.includes('percentage')) {
                  toolContext += `\n\n🚨 ATTENDANCE DATA AVAILABLE: You can answer questions about attendance percentages and which subjects have low attendance from this data!`
                }
              }
            }
            else if (toolCall.result.papers && toolCall.result.papers.length > 0) {
              toolContext += `\n\n[PAPERS DATA CONTEXT]:\nFound ${toolCall.result.papers.length} past papers`
            }
            else if (toolCall.result.faculty && toolCall.result.faculty.length > 0) {
              toolContext += `\n\n[FACULTY DATA CONTEXT]:\nFound ${toolCall.result.faculty.length} faculty members`
            }
            else if (toolCall.result.companies && toolCall.result.companies.length > 0) {
              toolContext += `\n\n[COMPANIES DATA CONTEXT]:\nFound ${toolCall.result.companies.length} companies`
            }
            else if (toolCall.result.data && toolCall.result.data.todayMenu) {
              toolContext += `\n\n[MESS MENU DATA CONTEXT]:\nRetrieved mess menu for ${toolCall.result.data.messType}`
            }
          }
        }
        
        if (toolContext) {
          console.log('Final enhanced message with context:', {
            originalContent: message.content,
            contextAdded: toolContext.substring(0, 200) + '...',
            totalContextLength: toolContext.length
          })
          return {
            ...message,
            content: (message.content || '') + toolContext
          }
        }
      }
      return message
    })

    const resultStream = await streamText({
      model: google("gemini-2.0-flash"),
      messages: [{ role: "system", content: combinedSystemPrompt }, ...enhancedMessages],
      tools,
      temperature: 0.7,
      maxTokens: 4096,
      toolChoice: hasVTOPContext ? "none" : "auto", // Disable tool calling if we have context data
      onFinish: async (result) => {
        const toolResults = (result as any).toolResults ?? (result.toolCalls ?? [])
        for (const tr of toolResults) {
          if (
            tr.toolName === "queryVTOP" &&
            tr.result?.success &&
            tr.result.data &&
            !tr.result.parsedData
          ) {
            try {
              const userContext = messages && messages.length > 0 
                ? messages
                    .filter((m: any) => m.role === 'user')
                    .slice(-3)
                    .map((m: any) => m.content)
                    .join(' | ')
                : ''
              
              const parsed = await parseVTOPData(tr.result.data, tr.args.command, userContext)
              Object.assign(tr.result, {
                parsedData: parsed,
                formatted_content: parsed.formatted_content,
                structured_data: parsed.structured_data,
                summary: parsed.summary,
              })
            } catch (e) {
              console.error("Failed to parse VTOP data in stream:", e)
            }
          }
        }

        // Persist the assistant message + any tool invocations
        const safeInvocations = JSON.parse(JSON.stringify(toolResults))
        await saveMessage(chat.id, "assistant", result.text, safeInvocations, result.response.id)

        // If this was our first exchange, update the chat title
        if (messages.length <= 2) {
          const newTitle = extractTitleFromContent(userMessage.content)
          await updateChat(chat.id, newTitle)
        }
      },
    })

    return resultStream.toDataStreamResponse({
      headers: {
        "X-Chat-Id": chat.id,
        "X-Chat-Path": chat.path,
      },
    })
  } catch (error: any) {
    console.error("Chat API error:", error)
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
