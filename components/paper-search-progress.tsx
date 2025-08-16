'use client'
import React, { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

interface ProgressEvent {
  runId: string
  step: string
  detail?: any
  ts: number
}

const LABELS: Record<string, string> = {
  connected: 'Connected',
  start: 'Starting search',
  resolveCourse: 'Resolving course',
  fetchedMetadata: 'Fetched metadata',
  selectedSubset: 'Selected subset',
  processPaperStart: 'Processing paper',
  paperDownloadFailed: 'Download failed',
  paperTextInsufficient: 'Insufficient text',
  extractedQuestions: 'Extracted questions',
  chunked: 'Chunked',
  chunkEmbeddings: 'Chunk embeddings',
  questionEmbeddings: 'Question embeddings',
  questionEmbedded: 'Question embedded',
  rankingComplete: 'Ranking complete',
  indexBuilt: 'Index built',
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
  })
}

export function PaperSearchProgress({ runId }: { runId: string }) {
  const [events, setEvents] = useState<ProgressEvent[]>([])
  useEffect(() => {
    if (!runId) return
    const ev = new EventSource(`/api/paper-progress/${runId}`)
    ev.onmessage = m => {
      try {
        const data = JSON.parse(m.data)
        setEvents(prev => [...prev, data])
      } catch {}
    }
    ev.onerror = () => {
      ev.close()
    }
    return () => ev.close()
  }, [runId])

  const done = events.some(e => e.step === 'rankingComplete')

  return (
    <Card className="w-full border-border/60 bg-muted/20">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          Paper Search Progress {done && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {!done && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="max-h-64 pr-2">
          <ul className="space-y-2 text-xs">
            {events.map((e, i) => {
              const label = LABELS[e.step] || e.step
              const isError = [
                'paperDownloadFailed',
                'paperTextInsufficient',
                'questionEmbeddingsFailed',
              ].includes(e.step)
              return (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground mt-0.5 w-14 shrink-0 tabular-nums">
                    {formatTime(e.ts)}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={isError ? 'destructive' : 'secondary'}
                        className="h-4 px-1.5 text-[10px] capitalize"
                      >
                        {label}
                      </Badge>
                      {e.detail?.title && (
                        <span className="text-muted-foreground line-clamp-1">{e.detail.title}</span>
                      )}
                      {e.detail?.selected !== undefined && (
                        <span className="text-muted-foreground">{e.detail.selected} papers</span>
                      )}
                      {e.detail?.questions !== undefined && (
                        <span className="text-muted-foreground">{e.detail.questions} qs</span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
            {events.length === 0 && (
              <li className="text-muted-foreground text-xs">Waiting for progress...</li>
            )}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
