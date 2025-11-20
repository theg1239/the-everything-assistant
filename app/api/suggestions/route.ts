import { NextRequest, NextResponse } from 'next/server'
import { generateFollowUpSuggestions } from '@/lib/follow-up-generator'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as z from 'zod'

const suggestionRequestSchema = z.object({
  assistantMessage: z.string().min(1),
  userMessage: z.string().optional(),
})

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsedBody = suggestionRequestSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'assistantMessage is required and must be a string' },
        { status: 400 }
      )
    }
    const { assistantMessage, userMessage } = parsedBody.data

    const suggestions = await generateFollowUpSuggestions(assistantMessage, userMessage)

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('Error in follow-up suggestions API:', error)
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
  }
}
