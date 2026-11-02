import { auth } from '@/lib/auth'
import { getChat, getMessagesPage } from '@/lib/db'
import { CHAT_HISTORY_PAGE_SIZE, toClientMessage } from '@/lib/chat-history'

/**
 * `GET /api/chat/[id]/messages?before=<messageId>&limit=<n>`: a page of the chat's history for
 * "show earlier messages" — the newest `limit` (default and max {@link CHAT_HISTORY_PAGE_SIZE})
 * messages older than `before` (or the newest overall without it), oldest first, plus `hasMore`.
 * Only the chat's owner may read it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [session, { id }] = await Promise.all([auth(), params])
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const searchParams = new URL(request.url).searchParams
    const before = searchParams.get('before') || undefined
    const requestedLimit = Number(searchParams.get('limit') ?? CHAT_HISTORY_PAGE_SIZE)
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), CHAT_HISTORY_PAGE_SIZE)
      : CHAT_HISTORY_PAGE_SIZE

    // Ownership check and the page are independent reads; the page is only returned once
    // `getChat` confirms the chat belongs to the user.
    const [chat, page] = await Promise.all([
      getChat(id, session.user.id),
      getMessagesPage(id, { limit, before }),
    ])
    if (!chat) {
      return new Response('Chat not found', { status: 404 })
    }

    return Response.json(
      { messages: page.messages.map(toClientMessage), hasMore: page.hasMore },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching chat messages:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
