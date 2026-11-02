import { getChat, getMessages, restoreChat } from '@/lib/db'
import { auth } from '@/lib/auth'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, { id }] = await Promise.all([auth(), params])
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Ownership check and the history are independent reads: run them together. The messages
    // are only returned once `getChat` confirms the chat belongs to the user.
    const [chat, messages] = await Promise.all([getChat(id, session.user.id), getMessages(id)])

    if (!chat) {
      return new Response('Chat not found', { status: 404 })
    }

    return Response.json(
      {
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
          attachments: msg.attachments,
          parts:
            Array.isArray(msg.toolInvocations) && msg.toolInvocations.length > 0
              ? [
                  ...(msg.content ? [{ type: 'text', text: msg.content }] : []),
                  ...msg.toolInvocations.map((toolInvocation: unknown) => ({
                    type: 'tool-invocation',
                    toolInvocation,
                  })),
                ]
              : msg.content
                ? [{ type: 'text', text: msg.content }]
                : [],
          createdAt: msg.created_at,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching chat:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
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
