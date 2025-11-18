import { createCanvasDocument, updateCanvasDocument, getCanvasDocuments } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canvasCreateSchema, canvasUpdateSchema } from '@/types/api/canvas'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const chatId = searchParams.get('chatId')

    if (!chatId) {
      return new Response('Chat ID is required', { status: 400 })
    }

    const documents = await getCanvasDocuments(chatId)
    return Response.json(documents)
  } catch (error) {
    console.error('Error fetching canvas documents:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    if (!rawBody) {
      return new Response('Invalid request body', { status: 400 })
    }
    const parsedBody = canvasCreateSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return new Response('Invalid request body', { status: 400 })
    }
    const { chatId, title, content, type } = parsedBody.data

    const document = await createCanvasDocument(chatId, title, content, type)

    return Response.json(document)
  } catch (error) {
    console.error('Error creating canvas document:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    if (!rawBody) {
      return new Response('Invalid request body', { status: 400 })
    }
    const parsedBody = canvasUpdateSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return new Response('Invalid request body', { status: 400 })
    }
    const { id, title, content } = parsedBody.data

    await updateCanvasDocument(id, title, content)

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error updating canvas document:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
