import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadPersonalHubState } from '@/app/actions/hub'
import { sendDailyBriefingEmail } from '@/lib/email/resend'
import { buildDailyBriefingContext, buildGreeting, deriveTerseName } from '@/lib/hub/daily-briefing'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const state = await loadPersonalHubState()
    const reference = new Date()
    const context = buildDailyBriefingContext(state.snapshots || [], reference)

    if (context.messages.length === 0) {
      context.messages.push({
        id: 'empty',
        primary: 'no snapshots found — link VTOP to start syncing.',
      })
    }

    const profileSnapshot = state.snapshots?.find(snapshot => snapshot.command === 'profile')
    const greeting = buildGreeting(reference, deriveTerseName(profileSnapshot))

    await sendDailyBriefingEmail({
      to: session.user.email,
      greeting,
      messages: context.messages,
      actions: context.actions,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[hub] failed to send test briefing email', error)
    return NextResponse.json({ error: 'Failed to send test briefing' }, { status: 500 })
  }
}
