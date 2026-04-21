import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getChat, getMessages } from '@/lib/db'
import { createUIMessageStream, JsonToSseTransformStream } from 'ai'
import type { UIMessage } from 'ai'
import { legacyMessageToUiMessage, type AppUIMessage } from '@/lib/ai-message-conversion'

interface StreamRouteParams {
  id: string
}

const RESUME_WINDOW_SECONDS = 15

function emptyStream() {
  const stream = createUIMessageStream<UIMessage>({ execute: () => {} })
  return new Response(stream.pipeThrough(new JsonToSseTransformStream()), {
    status: 200,
  })
}

/**
 * Scira-inspired resume endpoint. Full pub/sub resumable streams (via
 * `ai-resumable-stream`) require a pub/sub-capable Redis client, which the
 * Upstash REST client doesn't provide. Instead we implement the "message
 * replay" fallback Scira uses when its resumable stream has already ended: if
 * the most recent assistant message was saved within the last
 * `RESUME_WINDOW_SECONDS`, re-emit it to the client as a `data-appendMessage`
 * part so the UI can pick up where it left off.
 */
export async function GET(_req: Request, { params }: { params: Promise<StreamRouteParams> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id: chatId } = await params
  if (!chatId) {
    return new Response('Bad Request', { status: 400 })
  }

  const chat = await getChat(chatId, session.user.id)
  if (!chat) {
    return emptyStream()
  }

  const legacyMessages = await getMessages(chatId).catch(() => [])
  const mostRecent = legacyMessages.at(-1)

  if (!mostRecent || mostRecent.role !== 'assistant') {
    return emptyStream()
  }

  const createdAt = new Date(mostRecent.createdAt ?? Date.now())
  const ageSeconds = (Date.now() - createdAt.getTime()) / 1000
  if (Number.isFinite(ageSeconds) && ageSeconds > RESUME_WINDOW_SECONDS) {
    return emptyStream()
  }

  const appended: AppUIMessage = legacyMessageToUiMessage(mostRecent)

  const stream = createUIMessageStream<UIMessage>({
    execute: ({ writer }) => {
      writer.write({
        type: 'data-appendMessage',
        data: JSON.stringify(appended),
        transient: true,
      })
    },
  })

  return new Response(stream.pipeThrough(new JsonToSseTransformStream()), { status: 200 })
}
