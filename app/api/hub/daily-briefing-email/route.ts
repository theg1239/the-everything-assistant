import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendDailyBriefingEmail } from '@/lib/email/resend'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const messages = Array.isArray(body.messages) ? body.messages : []
    if (messages.length === 0) {
      return NextResponse.json({ error: 'Missing messages' }, { status: 400 })
    }

    await sendDailyBriefingEmail({
      to: session.user.email,
      greeting: body.greeting || 'good morning',
      messages,
      actions: Array.isArray(body.actions)
        ? body.actions.map((action: any) => ({ label: action.label || 'open hub' }))
        : [],
      scheduledAt: typeof body.scheduledAt === 'string' ? body.scheduledAt : undefined,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[hub] failed to send briefing email', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
