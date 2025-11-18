import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { saveVote } from '@/lib/db'
import { z } from 'zod'

const voteSchema = z.object({
  chatId: z.string().min(1),
  messageId: z.string().min(1),
  isUpvoted: z.boolean(),
})

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsedBody = voteSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return new Response('Invalid request body', { status: 400 })
    }
    const { chatId, messageId, isUpvoted } = parsedBody.data

    await saveVote(chatId, messageId, isUpvoted)

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error saving vote:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
