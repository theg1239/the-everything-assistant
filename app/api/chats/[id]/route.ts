import { getChat, getMessages, restoreChat } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

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

    const messages = await getMessages(id)

    return Response.json({
      id: chat.id,
      title: chat.title,
      path: chat.path,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        toolInvocations: msg.toolInvocations,
        parts: msg.toolInvocations && msg.toolInvocations.length > 0 
          ? [
              ...(msg.content ? [{ type: 'text', text: msg.content }] : []),
              ...msg.toolInvocations.map(toolInvocation => ({
                type: 'tool-invocation',
                toolInvocation
              }))
            ]
          : msg.content 
            ? [{ type: 'text', text: msg.content }]
            : [],
        createdAt: msg.created_at,
      })),
    })
  } catch (error) {
    console.error('Error fetching chat:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'restore') {
      await restoreChat(id, session.user.id)
      return Response.json({
        success: true,
        message: 'Chat restored successfully',
      })
    }

    return new Response('Invalid action', { status: 400 })
  } catch (error) {
    console.error('Error updating chat:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
