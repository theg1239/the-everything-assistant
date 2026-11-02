import { auth } from '@/lib/auth'
import { saveVote } from '@/lib/db'
import * as z from 'zod'

// `messageContent`/`messageRole` are still sent by older clients; they are ignored
// (votes never create messages).
const voteSchema = z.object({
  chatId: z.string().min(1).max(128),
  messageId: z.string().min(1).max(128),
  isUpvoted: z.boolean(),
})

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsedBody = voteSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return new Response('Invalid request body', { status: 400 })
    }
    const { chatId, messageId, isUpvoted } = parsedBody.data

    const saved = await saveVote({ userId: session.user.id, chatId, messageId, isUpvoted })
    if (!saved) {
      return new Response('Not found', { status: 404 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error saving vote:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
