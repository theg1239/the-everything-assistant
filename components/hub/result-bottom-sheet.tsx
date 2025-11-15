'use client'

import { useEffect, useMemo, useState } from 'react'
import { Drawer } from 'vaul'
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
    <Drawer.Root open={open} onOpenChange={next => (!next ? onClose() : null)} modal>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[82vh] max-w-3xl flex-col rounded-t-3xl border border-border/40 bg-background/95 shadow-2xl">
          <Drawer.Title className="sr-only">{title || 'Result viewer'}</Drawer.Title>
          <div className="p-4 sm:p-6">
            <Drawer.Handle className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border/60" />
            <div className="flex items-center justify-between gap-2 text-base font-semibold">
              <span className="truncate">{title || 'result'}</span>
              <Button variant="ghost" size="sm" onClick={handleShare} className="h-8 px-2">
                <Share2 className="h-4 w-4" /> share
              </Button>
            </div>
          </div>
          <div className="px-4 sm:px-6 flex items-center gap-2">
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
          <div className="mt-4 flex-1 overflow-auto px-4 pb-6 sm:px-6" data-allow-touch-scroll>
            {renderContent}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
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
