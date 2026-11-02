'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useHubTool } from '../use-hub-tool'
import { asRecord, readRecords, readString, readText, type UnknownRecord } from '@/components/narrow'
import { useSidebar } from '@/contexts/sidebar-context'
import { FileText, Search, X } from 'lucide-react'
import PdfViewer from '@/components/pdf-viewer'

export default function SyllabiPanel() {
  const { run, loading, error, result, reset } = useHubTool('getSyllabus')
  const { setIsOpen: setSidebarOpen } = useSidebar()
  const [query, setQuery] = useState('')

  const onRun = async () => {
    await run({ query })
  }

  const data = asRecord(result)
  const syllabi = ((): UnknownRecord[] => {
    if (!data) return []
    if (Array.isArray(data.syllabi) && data.syllabi.length > 0) return readRecords(data.syllabi)
    if (data.ambiguous && Array.isArray(data.matches)) return readRecords(data.matches)
    if (data.filename || data.url || data.code || data.title) return [data]
    return []
  })().map(s => ({
    title: readText(s.title),
    filename: readText(s.filename),
    code: readText(s.code),
    type: readText(s.type),
    url: readString(s.url),
    link: readString(s.link),
  }))

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
          {(error || Boolean(result)) && (
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
            {syllabi.map((s, i) => (
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
                        setSidebarOpen(false)
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

        {Boolean(result) && syllabi.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            {readText(data?.message) || 'no syllabi found for the given query.'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
