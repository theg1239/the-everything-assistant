import { EventEmitter } from 'events'
import { isRecord } from '../json'

export interface PaperProgressEvent {
  runId: string
  step: string
  detail?: unknown
  ts: number
  userMessage?: string
  status?: 'info' | 'progress' | 'success' | 'warning' | 'error'
  stage?: number
  totalStages?: number
  progressPercent?: number
}

class PaperProgress extends EventEmitter {
  private buffer: Map<string, PaperProgressEvent[]> = new Map()
  private MAX_BUFFER = 150

  emitStep(runId: string, step: string, detail?: unknown) {
    const { userMessage, status, stage, totalStages, progressPercent } = this.format(step, detail)
    const event: PaperProgressEvent = {
      runId,
      step,
      detail,
      ts: Date.now(),
      userMessage,
      status,
      stage,
      totalStages,
      progressPercent,
    }
    const list = this.buffer.get(runId) || []
    list.push(event)
    if (list.length > this.MAX_BUFFER) list.splice(0, list.length - this.MAX_BUFFER)
    this.buffer.set(runId, list)

    this.emit('progress', event)

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('paper-progress', { detail: event }))
      } catch {}
    }

    try {
      const rt = process.env.NEXT_RUNTIME
      if (rt && rt !== 'nodejs' && typeof fetch !== 'undefined') {
        fetch('/api/paper-progress/push', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(event),
          // keepalive hint (OK if ignored in some runtimes)
          keepalive: true,
        }).catch(() => {})
      }
    } catch {}
  }

  getBuffered(runId: string): PaperProgressEvent[] {
    return [...(this.buffer.get(runId) || [])]
  }

  private format(
    step: string,
    detail: unknown
  ): {
    userMessage: string
    status: PaperProgressEvent['status']
    stage: number
    totalStages: number
    progressPercent: number
  } {
    const ordered = [
      'start',
      'resolveCourse',
      'fetchedMetadata',
      'selectedSubset',
      'processPaperStart',
      'paperDownloadSuccess',
      'driveFallbackStart',
      'driveFallbackSuccess',
      'ocrExtractStart',
      'ocrParseSuccess',
      'ocrImageFallbackStart',
      'ocrOcrFallbackSuccess',
      'extractedQuestions',
      'chunked',
      'chunkEmbeddings',
      'questionEmbeddings',
      'rankingComplete',
      'done',
    ]
    const totalStages = ordered.length
    const baseStage = Math.max(0, ordered.indexOf(step))

    const field = (key: string): unknown => (isRecord(detail) ? detail[key] : undefined)
    const num = (n: unknown) =>
      typeof n === 'number' ? n : typeof n === 'string' && !isNaN(Number(n)) ? Number(n) : undefined
    const bytesFmt = (b: unknown) =>
      typeof b === 'number'
        ? b > 1_000_000
          ? (b / 1_000_000).toFixed(2) + ' MB'
          : b > 1000
            ? (b / 1000).toFixed(1) + ' KB'
            : b + ' B'
        : ''

    let userMessage = ''
    let status: PaperProgressEvent['status'] = 'progress'

    switch (step) {
      case 'start':
        userMessage = 'starting search for relevant past exam papers…'
        break
      case 'resolveCourse':
        userMessage = `course identified: ${field('courseCode') || 'detecting…'}`
        break
      case 'fetchedMetadata':
        userMessage = `found ${field('count') ?? field('total') ?? 0} candidate paper(s)`
        break
      case 'selectedSubset':
        userMessage = `analyzing ${field('selected') ?? 0} paper(s)`
        break
      case 'processPaperStart':
        userMessage = `analyzing paper: ${field('title') || 'Untitled paper'}`
        break
      case 'paperDownloadSuccess':
        userMessage = `downloaded paper (${bytesFmt(field('bytes'))})`
        status = 'success'
        break
      case 'paperDownloadFailed':
        userMessage = 'could not download paper (invalid)'
        status = 'warning'
        break
      case 'duplicateContent':
        userMessage = 'skipped duplicate paper'
        status = 'info'
        break
      case 'driveFallbackStart':
        userMessage = 'agent is downloading'
        break
      case 'driveFallbackDevRetry':
        userMessage = 'trying again'
        status = 'info'
        break
      case 'driveFallbackDevRetrySuccess':
        userMessage = 'agent browser opened successfully'
        status = 'success'
        break
      case 'driveFallbackDevRetryFailed':
        userMessage = 'agent launch failed'
        status = 'warning'
        break
      case 'driveFallbackPagesDetected':
        userMessage = `captured ${field('pages') ?? '?'} page image(s)`
        break
      case 'driveFallbackScreenshotsFailed':
        userMessage = 'could not capture page images'
        status = 'warning'
        break
      case 'driveFallbackSuccess':
        userMessage = `rebuilt PDF from ${field('pages') ?? '?'} page image(s)`
        status = 'success'
        break
      case 'ocrExtractStart':
        userMessage = 'extracting text…'
        break
      case 'ocrParseStart':
        userMessage = 'reading embedded PDF text…'
        break
      case 'ocrParseSuccess':
        userMessage = `read text directly (${num(field('pages')) || '?'} page(s))`
        status = 'success'
        break
      case 'ocrParseFailed':
        userMessage = 'trying OCR'
        status = 'warning'
        break
      case 'ocrParseSkipped':
        userMessage = 'running extraction'
        status = 'info'
        break
      case 'ocrImageFallbackStart':
        userMessage = `running extraction on ${field('pages') ?? '?'} pages…`
        break
      case 'ocrOcrFallbackSuccess':
        userMessage = `extraction complete (${num(field('chars')) || 0} characters)`
        status = 'success'
        break
      case 'ocrFailed':
        userMessage = 'invalid paper'
        status = 'error'
        break
      case 'paperTextInsufficient':
        userMessage = 'invalid paper'
        status = 'warning'
        break
      case 'extractedQuestions':
        userMessage = `detected ${field('questions') ?? 0} possible question(s)`
        break
      case 'chunked':
        userMessage = `segmented paper into ${field('chunks') ?? 0} parts`
        break
      case 'chunkEmbeddings':
        userMessage = 'indexing paper content…'
        break
      case 'questionEmbeddings':
        userMessage = 'indexing extracted questions…'
        break
      case 'questionEmbeddingsFailed':
        userMessage = 'question indexing failed (continuing)'
        status = 'warning'
        break
      case 'indexBuilt':
        userMessage = `search index ready (${field('papers') ?? 0} paper(s))`
        status = 'success'
        break
      case 'questionEmbedded':
        userMessage = 'understanding your question…'
        break
      case 'rankingComplete':
        userMessage = 'ranking best matching papers…'
        status = 'success'
        break
      case 'done':
        userMessage = 'all done!'
        status = 'success'
        break
      default:
        userMessage = step
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/^[a-z]/, c => c.toUpperCase())
        status = 'info'
    }
    const progressPercent = Math.min(
      100,
      Math.max(0, Math.round((baseStage / (totalStages - 1)) * 100))
    )
    return {
      userMessage,
      status,
      stage: baseStage === -1 ? ordered.length - 1 : baseStage,
      totalStages,
      progressPercent,
    }
  }
}

declare global {
  // Shared across module instances (dev HMR / multiple route bundles in one process).
  var __paperProgress: PaperProgress | undefined
}

export const paperProgress: PaperProgress = (globalThis.__paperProgress ??= new PaperProgress())
