'use client'

import { memo } from 'react'
import { ExternalLink } from 'lucide-react'

interface SourceUrlPartProps {
  url: string
  title?: string
  providerMetadata?: Record<string, unknown>
}

/**
 * Small citation chip rendered inline for `source-url` parts. Scira groups
 * these at the bottom of a message; we keep them inline for simplicity and
 * let the containing `<Message>` stack them if it needs to.
 */
export const SourceUrlPart = memo(function SourceUrlPart({ url, title }: SourceUrlPartProps) {
  let display = title
  if (!display) {
    try {
      display = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      display = url
    }
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground transition hover:border-border hover:bg-muted/70 hover:text-foreground"
    >
      <ExternalLink className="h-3 w-3" aria-hidden />
      <span className="max-w-[220px] truncate">{display}</span>
    </a>
  )
})
