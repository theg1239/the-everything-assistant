'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useHubTool } from '../use-hub-tool'
import { Flame, Search, Sparkles, X } from 'lucide-react'

type Mode = 'smart' | 'knowledge'

export default function RedditPanel() {
  const smart = useHubTool<any>('searchRedditWithContext')
  const knowledge = useHubTool<any>('searchRedditKnowledge')
  const [mode, setMode] = useState<Mode>('smart')
  const [query, setQuery] = useState('')

  const active = mode === 'smart' ? smart : knowledge

  const loading = active.loading
  const error = active.error
  const result = active.result

  const placeholders: Record<Mode, string> = {
    smart: "try 'what's trending at vit', 'placements discussions', 'hostel complaints'",
    knowledge: 'ask a specific question: e.g. best way to prep CAT2 DS?'
  }

  const suggested: string[] = [
    "what's happening on reddit",
    'placements discussions at vit',
    'hostel facilities complaints',
    'course advice BCSE2001',
    'exam prep tips',
    'clubs and events',
  ]

  const onSearch = async () => {
    const q = (query || '').trim()
    if (!q) {
      if (mode === 'smart') {
        await smart.run({ query: 'reddit overview for vit' })
      }
      return
    }
    if (mode === 'smart') {
      await smart.run({ query: q })
    } else {
      await knowledge.run({ query: q })
    }
  }

  const clear = () => {
    smart.reset(); knowledge.reset(); setQuery('')
  }

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Flame className="h-5 w-5" /> reddit knowledge</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
          <div className="flex-1 flex items-center gap-2">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholders[mode]}
              className="h-9 text-sm"
            />
            <Button onClick={onSearch} disabled={loading} className="h-9">
              <Search className="h-4 w-4 mr-1" /> {loading ? 'searching...' : 'search'}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={mode} onValueChange={(v: Mode) => setMode(v)}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smart">smart overview</SelectItem>
                <SelectItem value="knowledge">direct knowledge</SelectItem>
              </SelectContent>
            </Select>
            {(error || result) && (
              <Button variant="ghost" onClick={clear} className="h-9">
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
              onClick={() => { setQuery(s); }}
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

        {/* Results */}
        {loading && (
          <div className="p-6 rounded-md border border-border/40 bg-muted/20 animate-pulse">
            <div className="h-4 w-2/3 bg-muted rounded" />
            <div className="h-3 w-full bg-muted/60 rounded mt-3" />
            <div className="h-3 w-5/6 bg-muted/50 rounded mt-2" />
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {result.trending && Array.isArray(result.trending) && result.trending.length > 0 && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">trending topics</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {result.trending.map((t: any, idx: number) => (
                    <div key={idx} className="p-3 rounded-md border border-border/40 bg-card/40">
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-4 w-4 mt-0.5 text-amber-500" />
                        <div className="text-sm">{typeof t === 'string' ? t : (t?.title || JSON.stringify(t))}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(result.response || result.message) && (
              <div className="p-4 rounded-md border border-border/40 bg-card/40">
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                  {result.response || result.message}
                </div>
              </div>
            )}

            {result.sources && Array.isArray(result.sources) && result.sources.length > 0 && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">sources</div>
                <div className="space-y-2">
                  {result.sources.map((s: any, idx: number) => (
                    <a
                      key={idx}
                      href={s?.url || s?.link || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="block p-3 rounded-md border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-colors text-sm"
                    >
                      {s?.title || s?.url || s?.link || 'source'}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {(result.totalResults || result.searchAttempts || result.note) && (
              <div className="text-xs text-muted-foreground">
                {result.totalResults ? `results: ${result.totalResults}` : ''}
                {result.searchAttempts ? ` • attempts: ${result.searchAttempts}` : ''}
                {result.note ? ` • ${result.note}` : ''}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

