import { auth } from "@/lib/auth"
import { getChat, getMessages, deleteChat } from "@/lib/db"
import type { NextRequest } from "next/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 })
    }

    const { id } = await params
    const chat = await getChat(id, session.user.id)
    if (!chat) {
      return new Response("Chat not found", { status: 404 })
    }

    const messages = await getMessages(id)

    return Response.json({
      chat,
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        toolInvocations: msg.toolInvocations,
        createdAt: msg.created_at,
      })),
    })
  } catch (error) {
    console.error("Error fetching chat:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 })
    }

    const { id } = await params
    await deleteChat(id, session.user.id)
    return new Response("OK", { status: 200 })
  } catch (error) {
    console.error("Error deleting chat:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}
