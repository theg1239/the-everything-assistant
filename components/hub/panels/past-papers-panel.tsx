'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useHubTool } from '../use-hub-tool'

function Select({ value, onChange, children, className }: any) {
  return (
    <select
      value={value}
      onChange={e => onChange?.(e.target.value)}
      className={`bg-muted/30 border-0 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-border/60 ${className || ''}`}
    >
      {children}
    </select>
  )
}

export default function PastPapersPanel() {
  const { run, loading, error, result, reset } = useHubTool<any>('findPastPapers')
  const [courseCode, setCourseCode] = useState('')
  const [examType, setExamType] = useState('')
  const [year, setYear] = useState('')

  const onRun = async () => {
    await run({ courseCode, examType: examType || undefined, year: year || undefined })
  }

  const papers = Array.isArray(result?.papers) ? result.papers : []

  return (
    <Card className="border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">past papers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>course code or name</Label>
            <Input placeholder="e.g. BCSE302L or data structures" value={courseCode} onChange={e => setCourseCode(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>exam type</Label>
            <Select value={examType} onChange={setExamType}>
              <option value="">any</option>
              <option value="CAT-1">CAT-1</option>
              <option value="CAT-2">CAT-2</option>
              <option value="FAT">FAT</option>
              <option value="Quiz">Quiz</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>year</Label>
            <Input placeholder="e.g. 2023" value={year} onChange={e => setYear(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button disabled={!courseCode || loading} onClick={onRun} className="sm:w-auto w-full">{loading ? 'searching…' : 'search'}</Button>
          {error && <Button variant="ghost" onClick={reset} className="sm:w-auto w-full">clear</Button>}
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {papers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {papers.map((p: any, i: number) => (
              <div key={i} className="rounded-md p-3 bg-muted/20 hover:bg-muted/30 transition-colors">
                <div className="text-sm font-medium line-clamp-2">
                  {p.title || p.fileName || p.url}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.examType && <Badge variant="secondary" className="text-[10px]">{p.examType}</Badge>}
                  {p.year && <Badge variant="outline" className="text-[10px]">{p.year}</Badge>}
                  {p.slot && <Badge variant="outline" className="text-[10px]">{p.slot}</Badge>}
                  {p.source && <Badge variant="outline" className="text-[10px]">{p.source}</Badge>}
                </div>
                {p.url && (
                  <div className="mt-3">
                    <a className="text-xs text-blue-400 hover:underline" href={p.url} target="_blank" rel="noreferrer">
                      open link
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {result && papers.length === 0 && (
          <div className="text-sm text-muted-foreground">{result?.message || 'no papers found'}</div>
        )}
      </CardContent>
    </Card>
  )
}
