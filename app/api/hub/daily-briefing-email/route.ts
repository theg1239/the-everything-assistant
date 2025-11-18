import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendDailyBriefingEmail } from '@/lib/email/resend'
import { dailyBriefingEmailSchema } from '@/types/hub'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const parsedBody = dailyBriefingEmailSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsedBody.error.flatten() },
        { status: 400 }
      )
    }
    const { messages, actions, greeting, scheduledAt } = parsedBody.data

    await sendDailyBriefingEmail({
      to: session.user.email,
      greeting: greeting || 'good morning',
      messages,
      actions,
      scheduledAt,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[hub] failed to send briefing email', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
