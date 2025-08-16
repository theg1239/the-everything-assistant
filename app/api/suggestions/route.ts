import { NextRequest, NextResponse } from 'next/server'
import { generateFollowUpSuggestions } from '@/lib/follow-up-generator'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { assistantMessage, userMessage } = await request.json()

    if (!assistantMessage || typeof assistantMessage !== 'string') {
      return NextResponse.json(
        { error: 'assistantMessage is required and must be a string' },
        { status: 400 }
      )
    }

    const suggestions = await generateFollowUpSuggestions(assistantMessage, userMessage)

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('Error in follow-up suggestions API:', error)
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
  }
}
