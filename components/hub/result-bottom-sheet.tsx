'use client'

import { useEffect, useMemo, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Share2 } from 'lucide-react'

interface ResultBottomSheetProps {
  open: boolean
  title?: string
  onClose: () => void
  result?: any | null
}

export function ResultBottomSheet({ open, onClose, result, title }: ResultBottomSheetProps) {
  const [tab, setTab] = useState<'insights' | 'details' | 'raw'>('insights')

  useEffect(() => {
    if (!open) return
    if (result?.formatted_content) setTab('insights')
    else if (result?.summary) setTab('details')
    else setTab('raw')
  }, [open, result])

  const renderContent = useMemo(() => {
    if (!result) return <div className="text-xs text-muted-foreground">no data</div>
    if (tab === 'insights' && result.formatted_content) {
      return (
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: result.formatted_content }}
        />
      )
    }
    if (tab === 'details' && result.summary) {
      return <div className="text-sm whitespace-pre-wrap leading-relaxed">{result.summary}</div>
    }
    return (
      <pre className="text-[11px] whitespace-pre-wrap break-words bg-muted/30 p-3 rounded-xl border border-border/50">
        {safeStringify(result)}
      </pre>
    )
  }, [tab, result])

  const handleShare = () => {
    const text = result?.summary || stripHtml(result?.formatted_content) || safeStringify(result)
    if (!text) return
    window.dispatchEvent(
      new CustomEvent('hubShareToChat', {
        detail: { text: `${title ? `${title} — ` : ''}${text}`.slice(0, 2000) },
      })
    )
  }

  return (
    <Sheet open={open} onOpenChange={open => (!open ? onClose() : null)}>
      <SheetContent side="bottom" className="h-[80vh] p-4 sm:p-6">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-2 text-base font-semibold">
            <span className="truncate">{title || 'result'}</span>
            <Button variant="ghost" size="sm" onClick={handleShare} className="h-8 px-2">
              <Share2 className="h-4 w-4" /> share
            </Button>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex items-center gap-2">
          {(
            [
              { id: 'insights', label: 'insights', enabled: Boolean(result?.formatted_content) },
              { id: 'details', label: 'details', enabled: Boolean(result?.summary) },
              { id: 'raw', label: 'raw', enabled: true },
            ] as { id: typeof tab; label: string; enabled: boolean }[]
          )
            .filter(t => t.enabled)
            .map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  tab === t.id
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'border-border/50 text-muted-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
        </div>
        <div className="mt-4 h-[calc(100%-120px)] overflow-auto" data-allow-touch-scroll>
          {renderContent}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function safeStringify(obj: any) {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

function stripHtml(html?: string) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}
