'use client'

import { useState } from 'react'
import { OptimizedMarkdown } from '@/components/optimized-markdown'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { useHubTool } from '../use-hub-tool'
import { asRecord, readArray, readString, readText } from '@/components/narrow'
import { Flame, Search, Sparkles, X } from 'lucide-react'

type Mode = 'smart' | 'knowledge'

export default function RedditPanel() {
  const smart = useHubTool('searchRedditWithContext')
  const knowledge = useHubTool('searchRedditKnowledge')
  const [mode, setMode] = useState<Mode>('smart')
  const [query, setQuery] = useState('')

  const active = mode === 'smart' ? smart : knowledge

  const loading = active.loading
  const error = active.error
  const result = asRecord(active.result)
  const hasResult = Boolean(active.result)
  const trending = readArray(result?.trending)
  const sources = readArray(result?.sources)
  const markdownContent = readString(result?.response) || readString(result?.message)

  const placeholders: Record<Mode, string> = {
    smart: "try 'what's trending at vit', 'placements discussions', 'hostel complaints'",
    knowledge: 'ask a specific question: e.g. best way to prep CAT2 DS?',
  }

  const suggested: string[] = [
    "what's happening on reddit",
    'placements discussions at vit',
    'hostel facilities complaints',
    'tips for freshers',
    'exam prep tips',
    'clubs and events',
  ]

  const onSearch = async () => {
    const q = (query || '').trim()
    if (!q) {
      if (mode === 'smart') {
        await smart.run({ query: 'VIT', includeTrending: true })
      }
      return
    }
    if (mode === 'smart') {
      await smart.run({ query: q, includeTrending: true })
    } else {
      await knowledge.run({ query: q })
    }
  }

  const clear = () => {
    smart.reset()
    knowledge.reset()
    setQuery('')
  }

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5" /> reddit knowledge
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
          <div className="flex-1 flex items-center gap-2">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onSearch()
              }}
              placeholder={placeholders[mode]}
              className="h-9 text-sm"
            />
            <Button onClick={onSearch} disabled={loading} className="h-9 w-full md:w-auto">
              <Search className="h-4 w-4 mr-1" /> {loading ? 'searching...' : 'search'}
            </Button>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Select value={mode} onValueChange={(v: Mode) => setMode(v)}>
              <SelectTrigger className="h-9 w-full md:w-44">
                <SelectValue placeholder="mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smart">smart overview</SelectItem>
                <SelectItem value="knowledge">direct knowledge</SelectItem>
              </SelectContent>
            </Select>
            {(error || hasResult) && (
              <Button variant="ghost" onClick={clear} className="h-9 w-full md:w-auto">
                <X className="h-4 w-4 mr-1" /> clear
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {suggested.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuery(s)
              }}
              className="text-[11px] px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">
            {error}
          </div>
        )}


        {loading && (
          <div className="p-6 rounded-md border border-border/40 bg-muted/20 animate-pulse">
            <div className="h-4 w-2/3 bg-muted rounded" />
            <div className="h-3 w-full bg-muted/60 rounded mt-3" />
            <div className="h-3 w-5/6 bg-muted/50 rounded mt-2" />
          </div>
        )}

        {hasResult && (
          <div className="space-y-6">
            {trending.length > 0 && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  trending topics
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {trending.map((t, idx) => (
                    <div key={idx} className="p-3 rounded-md border border-border/40 bg-card/40">
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-4 w-4 mt-0.5 text-amber-500" />
                        <div className="text-sm break-words">
                          {typeof t === 'string'
                            ? t
                            : readText(asRecord(t)?.title) || JSON.stringify(t)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {markdownContent && (
              <div className="p-4 rounded-md border border-border/40 bg-card/40">
                <OptimizedMarkdown id="reddit-result" content={markdownContent} />
              </div>
            )}

            {sources.length > 0 && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  sources
                </div>
                <div className="space-y-2">
                  {sources.map((item, idx) => {
                    const s = asRecord(item)
                    const url = readString(s?.url)
                    const link = readString(s?.link)
                    return (
                      <a
                        key={idx}
                        href={url || link || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="block p-3 rounded-md border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-colors text-sm break-words"
                      >
                        {readText(s?.title) || url || link || 'source'}
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {Boolean(result?.totalResults || result?.searchAttempts || result?.note) && (
              <div className="text-xs text-muted-foreground">
                {result?.totalResults ? `results: ${String(result.totalResults)}` : ''}
                {result?.searchAttempts ? ` • attempts: ${String(result.searchAttempts)}` : ''}
                {result?.note ? ` • ${String(result.note)}` : ''}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
