import { NextRequest } from 'next/server'
import { paperProgress, type PaperProgressEvent } from '@/lib/progress/paper-progress'
import { auth } from '@/lib/auth'
import { scopedRunId } from '../scope'

export const runtime = 'nodejs'

type Params = { runId: string }

export async function GET(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }
  const { runId } = await params
  const scopedId = scopedRunId(session.user.id, runId)

  const encoder = new TextEncoder()
  // Clients only ever see their own run id, never the scoped key.
  const encode = (evt: PaperProgressEvent) =>
    encoder.encode(`data: ${JSON.stringify({ ...evt, runId })}\n\n`)

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (evt: PaperProgressEvent) => {
        if (evt.runId !== scopedId) return
        console.log('[paper-progress SSE] dispatching', runId, evt.step)
        controller.enqueue(encode(evt))
      }

      paperProgress.on('progress', send)

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ runId, step: 'connected', ts: Date.now() })}\n\n`)
      )

      try {
        const buffered = paperProgress.getBuffered(scopedId)
        if (buffered.length) {
          console.log('[paper-progress SSE] flushing buffered events', runId, buffered.length)
          for (const evt of buffered) {
            controller.enqueue(encode(evt))
          }
        } else {
          console.log('[paper-progress SSE] no buffered events to flush', runId)
        }
      } catch (e) {
        console.log('[paper-progress SSE] buffer flush error', e instanceof Error ? e.message : e)
      }

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`))
      }, 15_000)

      const close = () => {
        paperProgress.off('progress', send)
        clearInterval(heartbeat)
        try {
          controller.close()
        } catch {}
      }

      req.signal.addEventListener('abort', close)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
