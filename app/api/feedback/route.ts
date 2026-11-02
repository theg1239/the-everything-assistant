import { NextResponse } from 'next/server'
import { createFeedbackIssue } from '@/lib/feedback'
import { auth } from '@/lib/auth'
import { getRedis } from '@/lib/redis'
import * as z from 'zod'

/** Each submission opens a GitHub issue; cap per user per hour. */
const FEEDBACK_LIMIT_PER_HOUR = 5
const WINDOW_SECONDS = 60 * 60

const counterSchema = z.tuple([z.coerce.number(), z.unknown()])

/** Consumes one submission; null when the limit cannot be checked (no Redis). */
async function consumeFeedbackQuota(userId: string): Promise<boolean | null> {
  const redis = getRedis()
  if (!redis) return null
  const key = `feedback_rate:${userId}`
  const raw: unknown = await redis.multi().incr(key).expire(key, WINDOW_SECONDS, 'NX').exec()
  return counterSchema.parse(raw)[0] <= FEEDBACK_LIMIT_PER_HOUR
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in to send feedback.' }, { status: 401 })
  }

  const rawBody = await req.json().catch(() => null)
  if (!rawBody) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const allowed = await consumeFeedbackQuota(session.user.id)
  if (allowed === null && process.env.NODE_ENV !== 'development') {
    console.error('[feedback] Upstash Redis is not configured; refusing unthrottled submissions')
    return NextResponse.json({ error: 'Feedback is temporarily unavailable.' }, { status: 503 })
  }
  if (allowed === false) {
    return NextResponse.json(
      { error: 'Too many submissions. Please try again later.' },
      { status: 429 }
    )
  }

  const result = await createFeedbackIssue(rawBody, { id: session.user.id })

  if (result.success) {
    return NextResponse.json({ success: true, issueUrl: result.issueUrl })
  }

  return NextResponse.json(
    { error: result.error, details: result.details },
    { status: result.status || 500 }
  )
}
