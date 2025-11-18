import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listVTOPSnapshots } from '@/lib/vtop-snapshots'
import { buildDailyBriefingContext, buildGreeting, deriveTerseName } from '@/lib/hub/daily-briefing'
import { sendDailyBriefingEmail } from '@/lib/email/resend'
import { sendBriefingRequestSchema } from '@/types/hub'
import type { PersonalHubSnapshot } from '@/types/hub'

export const runtime = 'nodejs'

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 403 })
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const adminEmail = process.env.RATE_LIMIT_ADMIN_EMAIL
    if (!adminEmail) {
      return NextResponse.json({ error: 'RATE_LIMIT_ADMIN_EMAIL not configured' }, { status: 503 })
    }
    if (!session?.user?.email || session.user.email !== adminEmail) {
      return unauthorized('admin access required')
    }

    const rawBody = await request.json().catch(() => null)
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const parsedBody = sendBriefingRequestSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsedBody.error.flatten() },
        { status: 400 }
      )
    }

    const { userId, email, scheduledAt, referenceTime } = parsedBody.data
    if (!userId && !email) {
      return NextResponse.json({ error: 'Provide either userId or email' }, { status: 400 })
    }

    const user = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true },
        })
      : await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true },
        })

    if (!user || !user.email) {
      return NextResponse.json({ error: 'User not found or missing email' }, { status: 404 })
    }

    const snapshots = await listVTOPSnapshots(user.id)
    if (!snapshots.length) {
      return NextResponse.json({ error: 'User has no stored hub snapshots' }, { status: 409 })
    }

    const normalized: PersonalHubSnapshot[] = snapshots.map(row => {
      const data = (row.data as any) || {}
      return {
        command: row.command,
        title: data.title || row.command,
        summary: data.summary || 'no summary available',
        formatted_content: data.formatted_content,
        structured_data: data.structured_data,
        meta: data.meta || null,
        fetchedAt: row.fetchedAt.toISOString(),
      }
    })

    const reference = referenceTime ? new Date(referenceTime) : new Date()
    const context = buildDailyBriefingContext(normalized, reference)
    if (!context.messages.length) {
      context.messages.push({
        id: 'empty',
        primary: 'no actionable snapshots yet — trigger a hub sync first.',
      })
    }

    const profileSnapshot = normalized.find(snapshot => snapshot.command === 'profile')
    const greeting = buildGreeting(reference, deriveTerseName(profileSnapshot))

    const scheduleToken =
      typeof scheduledAt === 'string' && scheduledAt.trim().length ? scheduledAt : undefined

    await sendDailyBriefingEmail({
      to: user.email,
      greeting,
      messages: context.messages,
      actions: context.actions,
      scheduledAt: scheduleToken,
    })

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
      briefing: {
        greeting,
        messages: context.messages.length,
        actions: context.actions.length,
        scheduledAt: scheduleToken || null,
        referenceTime: reference.toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[mgmt] failed to send briefing email', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to send briefing' },
      { status: 500 }
    )
  }
}
