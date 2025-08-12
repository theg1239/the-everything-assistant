import { NextRequest } from 'next/server'
import { paperProgress } from '@/lib/progress/paper-progress'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { runId, step, detail } = body || {}
    if (!runId || !step) {
      return new Response(JSON.stringify({ error: 'runId and step required' }), { status: 400 })
    }
    paperProgress.emitStep(runId, step, detail)
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'failed' }), { status: 500 })
  }
}
