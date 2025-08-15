import { NextRequest } from 'next/server'
import { paperProgress, type PaperProgressEvent } from '@/lib/progress/paper-progress'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'

type Params = { runId: string }

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<Params> } 
) {
  const session = await getServerSession(authOptions as any) as { user?: { id?: string } } | null;
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }
  const { runId } = await params

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (evt: PaperProgressEvent) => {
        if (evt.runId !== runId) return
        console.log('[paper-progress SSE] dispatching', evt.runId, evt.step)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`))
      }

      paperProgress.on('progress', send)

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ runId, step: 'connected', ts: Date.now() })}\n\n`)
      )

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
      } catch (e: any) {
        console.log('[paper-progress SSE] buffer flush error', e?.message)
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
