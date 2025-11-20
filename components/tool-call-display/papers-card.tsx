import { memo } from 'react'
import { FileText } from 'lucide-react'

import { BaseProps } from './types'
import { Section } from './sections'

export const PapersCard = memo(function PapersCard({ toolCall }: BaseProps) {
  const result = toolCall.result || {}
  const papers: any[] = result.papers || []

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="h-4 w-4 text-blue-500" />
        <span>Past papers</span>
      </div>

      <Section hidden={!papers.length}>
        <ul className="space-y-1 text-sm">
          {papers.slice(0, 8).map((p, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="truncate">{p.title || p.filename || 'Paper'}</span>
              {p.url ? (
                <a className="text-xs text-primary hover:underline" href={p.url} target="_blank" rel="noreferrer">
                  Download
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      {!papers.length ? <div className="text-sm text-muted-foreground">No papers found.</div> : null}
    </div>
  )
})
