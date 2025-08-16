'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ResultViewerProps {
  open: boolean
  title?: string
  onClose: () => void
  result?: any | null
  mode?: 'static' | 'stream'
  isLoading?: boolean
  onStop?: () => void
}

export default function ResultViewer({
  open,
  onClose,
  result,
  title,
  mode = 'static',
  isLoading,
  onStop,
}: ResultViewerProps) {
  if (!open) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] p-2 sm:p-4">
      <div className="mx-auto max-w-3xl rounded-xl bg-background/95 backdrop-blur shadow-xl overflow-hidden ring-1 ring-border/40">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sm font-medium truncate">{title || 'result'}</div>
            {mode === 'stream' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                live
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {mode === 'stream' && isLoading && (
              <Button variant="ghost" size="sm" onClick={onStop} className="h-8 px-2">
                stop
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div
          className="p-3 max-h-[60vh] overflow-auto [-webkit-overflow-scrolling:touch]"
          data-allow-touch-scroll
        >
          {mode === 'stream' && isLoading && <StreamingSkeleton />}
          {renderResult(result)}
        </div>
      </div>
    </div>
  )
}

function renderResult(data: any) {
  if (!data) return <div className="text-xs text-muted-foreground">no data</div>
  if (data.formatted_content && typeof data.formatted_content === 'string') {
    return (
      <div
        className="prose prose-slate dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: data.formatted_content }}
      />
    )
  }
  if (data.summary && typeof data.summary === 'string') {
    return <div className="text-sm whitespace-pre-wrap">{data.summary}</div>
  }
  return <pre className="text-xs whitespace-pre-wrap break-words">{safeStringify(data)}</pre>
}

function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

function StreamingSkeleton() {
  return (
    <div className="animate-pulse space-y-2 mb-3">
      <div className="h-3 bg-muted/40 rounded w-2/3" />
      <div className="h-3 bg-muted/40 rounded w-5/6" />
      <div className="h-3 bg-muted/40 rounded w-1/2" />
      <div className="h-3 bg-muted/40 rounded w-3/4" />
    </div>
  )
}
