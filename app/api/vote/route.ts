import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { saveVote } from '@/lib/db'
import * as z from 'zod/v3';

const voteSchema = z.object({
  chatId: z.string().min(1),
  messageId: z.string().min(1),
  isUpvoted: z.boolean(),
  messageContent: z.string().optional(),
  messageRole: z.enum(['system', 'user', 'assistant']).optional(),
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
    const { chatId, messageId, isUpvoted, messageContent, messageRole } = parsedBody.data

    await saveVote(chatId, messageId, isUpvoted, {
      content: messageContent,
      role: messageRole,
    })

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error saving vote:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
