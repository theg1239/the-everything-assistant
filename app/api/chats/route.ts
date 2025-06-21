import { getChats, deleteAllChats, deleteAllArchivedChats, archiveAllChats, getArchivedChats } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '15')
    const offset = parseInt(searchParams.get('offset') || '0')
    const archived = searchParams.get('archived') === 'true'

    const chats = archived
      ? await getArchivedChats(session.user.id, limit, offset)
      : await getChats(session.user.id, limit, offset)

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

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'delete-all') {
      const deletedCount = await deleteAllChats(session.user.id)
      return Response.json({
        success: true,
        message: `${deletedCount} chats deleted successfully`,
        count: deletedCount,
      })
    } else if (action === 'delete-archived') {
      const deletedCount = await deleteAllArchivedChats(session.user.id)
      return Response.json({
        success: true,
        message: `${deletedCount} archived chats deleted successfully`,
        count: deletedCount,
      })
    }

    return new Response('Invalid action', { status: 400 })
  } catch (error) {
    console.error('Error deleting chats:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'archive-all') {
      const archivedCount = await archiveAllChats(session.user.id)
      return Response.json({
        success: true,
        message: `${archivedCount} chats archived successfully`,
        count: archivedCount,
      })
    }

    return new Response('Invalid action', { status: 400 })
  } catch (error) {
    console.error('Error archiving chats:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
