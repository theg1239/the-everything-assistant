import { NextResponse } from 'next/server'
import { createFeedbackIssue } from '@/lib/feedback'
import { auth } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await auth()
  const rawBody = await req.json().catch(() => null)
  if (!rawBody) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const result = await createFeedbackIssue(rawBody, {
    name: session?.user?.name,
    email: session?.user?.email,
  })

  if (result.success) {
    return NextResponse.json({ success: true, issueUrl: result.issueUrl })
  }

  return NextResponse.json(
    { error: result.error, details: result.details },
    { status: result.status || 500 }
  )
}
