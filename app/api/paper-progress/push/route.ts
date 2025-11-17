import { NextRequest } from 'next/server'
import { paperProgress } from '@/lib/progress/paper-progress'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as any)) as {
      user?: { id?: string }
    } | null
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    }
    const body = await req.json()
    const { runId, step, detail } = body || {}
    if (!runId || !step) {
      return new Response(JSON.stringify({ error: 'runId and step required' }), { status: 400 })
    }
    paperProgress.emitStep(runId, step, detail)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (error) {
    console.error('[paper-progress/push] failed:', error)
    return new Response(
      JSON.stringify({ error: 'failed', message: 'Unable to record paper progress at this time.' }),
      { status: 500 }
    )
  }
}
