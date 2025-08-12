import { NextRequest } from 'next/server'
import { paperProgress, PaperProgressEvent } from '@/lib/progress/paper-progress'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, ctx: { params: { runId: string } } | { params: Promise<{ runId: string }> }) {
  const rawParams: any = (ctx as any).params
  const resolved = typeof rawParams?.then === 'function' ? await rawParams : rawParams
  const { runId } = resolved || {}
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const send = (evt: PaperProgressEvent) => {
        if (evt.runId !== runId) return
        console.log('[paper-progress SSE] dispatching', evt.runId, evt.step)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`))
      }
      paperProgress.on('progress', send)
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ runId, step: 'connected', ts: Date.now() })}\n\n`))
      try {
        const buffered = paperProgress.getBuffered(runId)
        if (buffered.length) {
          console.log('[paper-progress SSE] flushing buffered events', runId, buffered.length)
          for (const evt of buffered) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`))
          }
        } else {
          console.log('[paper-progress SSE] no buffered events to flush', runId)
        }
      } catch (e) {
        console.log('[paper-progress SSE] buffer flush error', (e as any)?.message)
      }
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n`))
      }, 15000)
      const close = () => {
        paperProgress.off('progress', send)
        clearInterval(heartbeat)
        try { controller.close() } catch {}
      }
      ;(req.signal as any).addEventListener('abort', close)
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
