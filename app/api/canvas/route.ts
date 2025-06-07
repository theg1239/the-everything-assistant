import { auth } from "@/lib/auth"
import { createCanvasDocument, updateCanvasDocument } from "@/lib/db"

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 })
    }

    const { chatId, title, content, type = "document" } = await request.json()

    const document = await createCanvasDocument(chatId, title, content, type)

    return Response.json(document)
  } catch (error) {
    console.error("Error creating canvas document:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 })
    }

    const { id, title, content } = await request.json()

    await updateCanvasDocument(id, title, content)

    return Response.json({ success: true })
  } catch (error) {
    console.error("Error updating canvas document:", error)
    return new Response("Internal Server Error", { status: 500 })
  }
}
