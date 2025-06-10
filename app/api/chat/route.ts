import { streamText } from "ai"
import { google } from "@ai-sdk/google"
import { createVITTools } from "@/lib/tools"
import { VIT_SYSTEM_PROMPT } from "@/lib/prompts"
import { VIT_COMPREHENSIVE_KNOWLEDGE } from "@/lib/knowledge-base"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getChat, createChat, saveMessage, updateChat } from "@/lib/db"
import { generateChatPath, extractTitleFromContent } from "@/lib/utils"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 })
    }

    const { messages, id: chatId } = await req.json()

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "API key not configured. Please add GOOGLE_GENERATIVE_AI_API_KEY to your environment variables.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      )
    }

    let chat
    if (chatId) {
      chat = await getChat(chatId, session.user.id)
      if (!chat) {
        const title = extractTitleFromContent(messages[0]?.content || "New Chat")
        const path = generateChatPath()
        chat = await createChat(session.user.id, title, path)
      }
    } else {
      const title = extractTitleFromContent(messages[0]?.content || "New Chat")
      const path = generateChatPath()
      chat = await createChat(session.user.id, title, path)
    }

    const userMessage = messages[messages.length - 1]
    let userMessageId: string | undefined
    if (userMessage?.role === "user") {
      const savedUserMessage = await saveMessage(chat.id, "user", userMessage.content, undefined, userMessage.id)
      userMessageId = savedUserMessage.id
    }

    const tools = createVITTools()

    const combinedSystemPrompt = `${VIT_SYSTEM_PROMPT}\n\nADDITIONAL COMPREHENSIVE KNOWLEDGE:\n${VIT_COMPREHENSIVE_KNOWLEDGE}`
    
    const result = await streamText({
      model: google("gemini-2.0-flash"),
      messages: [{ role: "system", content: combinedSystemPrompt }, ...messages],
      tools,
      temperature: 0.7,
      maxTokens: 4096,
      toolChoice: "auto",
      onFinish: async (result) => {
        let safeToolInvocations = undefined
        
        if ((result as any).toolResults?.length > 0) {
          try {
            safeToolInvocations = JSON.parse(JSON.stringify((result as any).toolResults))
            console.log("Saving toolResults with complete data:", safeToolInvocations.length, "tool results")
          } catch (e) {
            console.error("Failed to serialize toolResults for DB:", e)
            safeToolInvocations = undefined
          }
        }
        else if (result.toolCalls?.length > 0) {
          try {
            safeToolInvocations = JSON.parse(JSON.stringify(result.toolCalls))
            console.log("Falling back to toolCalls (no results available)")
          } catch (e) {
            console.error("Failed to serialize toolCalls for DB:", e)
            safeToolInvocations = undefined
          }
        }
        
        await saveMessage(chat.id, "assistant", result.text, safeToolInvocations, result.response.id)

        if (messages.length <= 2) {
          const newTitle = extractTitleFromContent(userMessage?.content || "")
          await updateChat(chat.id, newTitle)
        }
      },
    })

    return result.toDataStreamResponse({
      headers: {
        "X-Chat-Id": chat.id,
        "X-Chat-Path": chat.path,
      },
    })
  } catch (error) {
    console.error("Chat API error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
}
