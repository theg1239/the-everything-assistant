import { NextRequest, NextResponse } from 'next/server'
import { generateFollowUpSuggestions } from '@/lib/follow-up-generator'
import { auth } from '@/lib/auth'
import * as z from 'zod'

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const suggestionRequestSchema = z.object({
  assistantMessage: z.string().min(1),
  userMessage: z.string().optional(),
  conversationHistory: z.array(messageSchema).optional(),
})

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    // The body is read while the session is looked up (local, no round trip of its own).
    const bodyPromise: Promise<unknown> = request.json().catch(() => null)
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await bodyPromise
    const parsedBody = suggestionRequestSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'assistantMessage is required and must be a string' },
        { status: 400 }
      )
    }
    const { assistantMessage, userMessage, conversationHistory } = parsedBody.data

    const suggestions = await generateFollowUpSuggestions(
      session.user.id,
      assistantMessage,
      userMessage,
      conversationHistory
    )

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('Error in follow-up suggestions API:', error)
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
  }
}
