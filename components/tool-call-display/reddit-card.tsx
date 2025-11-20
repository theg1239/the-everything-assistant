import { memo } from 'react'
import { Globe2 } from 'lucide-react'

import { BaseProps } from './types'
import { Section } from './sections'

export const RedditCard = memo(function RedditCard({ toolCall }: BaseProps) {
  const result = toolCall.result || {}
  const trending: string[] = result.trending || []
  const sources: any[] = result.sources || []

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Globe2 className="h-4 w-4 text-orange-500" />
        <span>Reddit search</span>
      </div>
      {result.response ? <div className="text-sm leading-relaxed whitespace-pre-line">{result.response}</div> : null}

      <Section hidden={!trending.length} title="Trending">
        <ul className="list-disc pl-4 text-sm">
          {trending.slice(0, 5).map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>

      <Section hidden={!sources.length} title="Sources">
        <ul className="list-disc pl-4 text-xs text-muted-foreground">
          {sources.slice(0, 4).map((src, i) => (
            <li key={i}>{typeof src === 'string' ? src : JSON.stringify(src)}</li>
          ))}
        </ul>
      </Section>
    </div>
  )
})
