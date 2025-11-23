'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useHubTool } from '../use-hub-tool'
import { useSidebar } from '@/contexts/sidebar-context'
import { FileText, Search, X } from 'lucide-react'
import PdfViewer from '@/components/pdf-viewer'

export default function PastPapersPanel() {
  const { run, loading, error, result, reset } = useHubTool<any>('findPastPapers')
  const { setIsOpen: setSidebarOpen } = useSidebar()
  const [courseCode, setCourseCode] = useState('')
  const [examType, setExamType] = useState('')
  const [year, setYear] = useState('')

  const onRun = async () => {
    await run({ courseCode, examType: examType || undefined, year: year || undefined })
  }

  const papers = Array.isArray(result?.papers) ? result.papers : []

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" /> past papers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="courseCode">course code or name</Label>
            <Input
              id="courseCode"
              placeholder="e.g. bcse302l"
              value={courseCode}
              onChange={e => setCourseCode(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="examType">exam type</Label>
            <Select value={examType} onValueChange={setExamType}>
              <SelectTrigger id="examType">
                <SelectValue placeholder="any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">any</SelectItem>
                <SelectItem value="CAT-1">cat-1</SelectItem>
                <SelectItem value="CAT-2">cat-2</SelectItem>
                <SelectItem value="FAT">fat</SelectItem>
                <SelectItem value="Quiz">quiz</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="year">year</Label>
            <Input
              id="year"
              placeholder="optional (e.g. 2023)"
              value={year}
              onChange={e => setYear(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button disabled={!courseCode || loading} onClick={onRun} className="sm:w-auto w-full">
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

        {papers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-4">
            {papers.map((p: any, i: number) => (
              <Card
                key={i}
                className="bg-muted/20 border-border/30 hover:bg-muted/40 transition-colors flex flex-col"
              >
                <CardContent className="p-4 flex-grow">
                  <div className="text-sm font-medium line-clamp-2 mb-3">
                    {p.title || p.fileName || p.url}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.examType && <Badge variant="secondary">{p.examType.toLowerCase()}</Badge>}
                    {p.year && <Badge variant="outline">{p.year}</Badge>}
                    {p.slot && <Badge variant="outline">{p.slot}</Badge>}
                    {p.source && <Badge variant="outline">{p.source}</Badge>}
                  </div>
                </CardContent>
                {p.url && (
                  <div className="p-4 pt-0 mt-auto">
                    <button
                      className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                      onClick={() => {
                        const url = p.url
                        const title = p.title || p.fileName || p.year
                        setSidebarOpen(false)
                        window.dispatchEvent(
                          new CustomEvent('pdfViewerOpen', { detail: { url, title, source: 'papers' } })
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

        {result && papers.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            {result?.message || 'no papers found for the given criteria.'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
