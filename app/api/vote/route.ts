import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { saveVote } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { chatId, messageId, isUpvoted } = await request.json()

    await saveVote(chatId, messageId, isUpvoted)

    return Response.json({ success: true })
  } catch (error) {
    console.error('Error saving vote:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
