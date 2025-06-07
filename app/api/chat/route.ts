import { streamText } from "ai"
import { google } from "@ai-sdk/google"
import { createVITTools } from "@/lib/tools"
import { VIT_SYSTEM_PROMPT } from "@/lib/prompts"
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
        // If chat not found, create a new chat with the provided chatId
        const title = extractTitleFromContent(messages[0]?.content || "New Chat")
        const path = generateChatPath()
        chat = await createChat(session.user.id, title, path)
      }
    } else {
      // Create new chat
      const title = extractTitleFromContent(messages[0]?.content || "New Chat")
      const path = generateChatPath()
      chat = await createChat(session.user.id, title, path)
    }

    // Save user message
    const userMessage = messages[messages.length - 1]
    if (userMessage?.role === "user") {
      await saveMessage(chat.id, "user", userMessage.content)
    }

    const tools = createVITTools()

    const result = await streamText({
      model: google("gemini-2.0-flash"),
      messages: [{ role: "system", content: VIT_SYSTEM_PROMPT }, ...messages],
      tools,
      temperature: 0.7,
      maxTokens: 4096,
      toolChoice: "auto",
      onFinish: async (result) => {
        // Save assistant message
        let safeToolCalls = undefined
        if (result.toolCalls?.length > 0) {
          try {
            // Ensure toolCalls is JSON-serializable
            safeToolCalls = JSON.parse(JSON.stringify(result.toolCalls))
          } catch (e) {
            console.error("Failed to serialize toolCalls for DB:", e)
            safeToolCalls = undefined
          }
        }
        await saveMessage(chat.id, "assistant", result.text, safeToolCalls)

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
