import { getChats } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const chats = await getChats(session.user.id)

    return Response.json(
      chats.map(chat => ({
        id: chat.id,
        title: chat.title,
        path: chat.path,
        createdAt: chat.created_at,
        updatedAt: chat.updated_at,
      }))
    )
  } catch (error) {
    console.error('Error fetching chats:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
