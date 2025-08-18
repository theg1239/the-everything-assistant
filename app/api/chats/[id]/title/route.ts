import { getChat } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { id } = await params
    const chat = await getChat(id, session.user.id)

    if (!chat) {
      return new Response('Chat not found', { status: 404 })
    }

    return Response.json({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updated_at,
    })
  } catch (error) {
    console.error('Error fetching chat title:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
