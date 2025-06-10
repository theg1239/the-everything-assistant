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


async function parseVTOPData(rawData: any, command: string) {
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

Command: ${command}
Raw Data: ${JSON.stringify(rawData)}

Please parse this VTOP data and return a structured response with:
- success: true if parsing was successful
- formatted_content: A natural language description with proper formatting
- structured_data: Key-value pairs extracted from the data (optional)
- summary: A brief summary of what this data shows

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

Example formats:
- Receipts: "Here are your recent payments to VIT: <table><tr><th>Date</th><th>Amount</th><th>Description</th></tr>..."
- Attendance: "Your attendance looks good overall. In Mathematics, you have 85% attendance which is above the required 75%..."

Make the formatted_content engaging and conversational while being informative.
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
              const parsedData = await parseVTOPData(result.data, command)

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

          return new Response(JSON.stringify({ success: true, result }), {
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
    const combinedSystemPrompt = `${VIT_SYSTEM_PROMPT}

ADDITIONAL COMPREHENSIVE KNOWLEDGE:
${VIT_COMPREHENSIVE_KNOWLEDGE}`

    const resultStream = await streamText({
      model: google("gemini-2.0-flash"),
      messages: [{ role: "system", content: combinedSystemPrompt }, ...messages],
      tools,
      temperature: 0.7,
      maxTokens: 4096,
      toolChoice: "auto",
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
              const parsed = await parseVTOPData(tr.result.data, tr.args.command)
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
