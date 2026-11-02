import { auth } from '@/lib/auth'
import { getChat, getMessages, deleteChat } from '@/lib/db'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    return Response.json({
      chat,
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        toolInvocations: msg.toolInvocations,
        parts:
          msg.toolInvocations && msg.toolInvocations.length > 0
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
    })
  } catch (error) {
    console.error('Error fetching chat:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { id } = await params
    await deleteChat(id, session.user.id)
    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Error deleting chat:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
