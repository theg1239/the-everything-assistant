import { streamText } from "ai"
import { google } from "@ai-sdk/google"
import { createVITTools } from "@/lib/tools"
import { VIT_SYSTEM_PROMPT } from "@/lib/prompts"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "API key not configured. Please add GOOGLE_GENERATIVE_AI_API_KEY to your environment variables.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      )
    }

    const tools = createVITTools()

    const result = await streamText({
      model: google("gemini-2.0-flash"),
      messages: [{ role: "system", content: VIT_SYSTEM_PROMPT }, ...messages],
      tools,
      temperature: 0.7,
      maxTokens: 4096,
      toolChoice: "auto",
    })

    return result.toDataStreamResponse()
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
