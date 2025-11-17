'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useHubTool } from '../use-hub-tool'
import { FileText, Search, X } from 'lucide-react'
import PdfViewer from '@/components/pdf-viewer'

export default function SyllabiPanel() {
  const { run, loading, error, result, reset } = useHubTool<any>('getSyllabus')
  const [query, setQuery] = useState('')

  const onRun = async () => {
    await run({ query })
  }

  const syllabi = (() => {
    if (!result) return []
    if (Array.isArray(result.syllabi) && result.syllabi.length > 0) return result.syllabi
    if (result.ambiguous && Array.isArray(result.matches)) return result.matches
    if (result.filename || result.url || result.code || result.title) return [result]
    return []
  })()

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" /> syllabi
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="query">course code or name</Label>
            <Input
              id="query"
              placeholder="e.g. complex variables or BMAT201L"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button disabled={!query || loading} onClick={onRun} className="sm:w-auto w-full">
            <Search className="mr-2 h-4 w-4" />
            {loading ? 'searching...' : 'search'}
          </Button>
          {(error || result) && (
            <Button variant="ghost" onClick={reset} className="sm:w-auto w-full">
              <X className="mr-2 h-4 w-4" />
              clear
            </Button>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
        )}

        {syllabi.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-4">
            {syllabi.map((s: any, i: number) => (
              <Card
                key={i}
                className="bg-muted/20 border-border/30 hover:bg-muted/40 transition-colors flex flex-col"
              >
                <CardContent className="p-4 flex-grow">
                  <div className="text-sm font-medium line-clamp-2 mb-3">
                    {s.title || s.filename || s.code}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.code && (
                      <div className="text-xs px-2 py-1 rounded bg-muted/50">{s.code}</div>
                    )}
                    {s.type && (
                      <div className="text-xs px-2 py-1 rounded bg-muted/50">{s.type}</div>
                    )}
                  </div>
                </CardContent>
                {(s.url || s.link || s.filename) && (
                  <div className="p-4 pt-0 mt-auto">
                    <button
                      className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                      onClick={() => {
                        const url =
                          s.url ||
                          s.link ||
                          (s.filename
                            ? `https://storage.googleapis.com/examcooker/syllabi/${s.filename}`
                            : null)
                        const title = s.title || s.filename || s.code
                        window.dispatchEvent(
                          new CustomEvent('pdfViewerOpen', { detail: { url, title } })
                        )
                      }}
                    >
                      open
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
        <PdfViewer />

        {result && syllabi.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            {result?.message || 'no syllabi found for the given query.'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
