import { EventEmitter } from 'events'

export interface PaperProgressEvent {
  runId: string
  step: string
  detail?: any
  ts: number
}

class PaperProgress extends EventEmitter {
  private buffer: Map<string, PaperProgressEvent[]> = new Map()
  private MAX_BUFFER = 150

  emitStep(runId: string, step: string, detail?: any) {
    const event: PaperProgressEvent = { runId, step, detail, ts: Date.now() }
    const list = this.buffer.get(runId) || []
    list.push(event)
    if (list.length > this.MAX_BUFFER) list.splice(0, list.length - this.MAX_BUFFER)
    this.buffer.set(runId, list)

    this.emit('progress', event)

    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('paper-progress', { detail: event })) } catch {}
    }

    try {
      const rt = (process as any).env?.NEXT_RUNTIME
      if (rt && rt !== 'nodejs' && typeof fetch !== 'undefined') {
        fetch('/api/paper-progress/push', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(event),
          // @ts-ignore keepalive hint (OK if ignored in some runtimes)
          keepalive: true,
        }).catch(() => {})
      }
    } catch {}
  }

  getBuffered(runId: string): PaperProgressEvent[] {
    return [...(this.buffer.get(runId) || [])]
  }
}

const g = globalThis as any
export const paperProgress: PaperProgress = g.__paperProgress || (g.__paperProgress = new PaperProgress())

export interface PaperProgressEvent {
  runId: string
  step: string
  detail?: any
  ts: number
}
