'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
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

export default function PlacementPanel() {
  const { run, loading, error, result, reset } = useHubTool<any>('getPlacementInfo')
  const [year, setYear] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [campus, setCampus] = useState('')
  const [combineWitch, setCombineWitch] = useState(false)

  const onRun = async () => {
    await run({ year: year || undefined, companyFilter: companyFilter || undefined, combineWitch, campus: campus || undefined })
  }

  return (
    <Card className="border-0">
      <CardHeader>
        <CardTitle>placements</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>year (e.g. 2024-25)</Label>
            <Input value={year} onChange={e => setYear(e.target.value)} placeholder="optional" />
          </div>
          <div className="space-y-1">
            <Label>company filter</Label>
            <Input value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} placeholder="optional" />
          </div>
          <div className="space-y-1">
            <Label>campus</Label>
            <Select value={campus} onChange={setCampus}>
              <option value="">any</option>
              <option value="Vellore">Vellore</option>
              <option value="Chennai">Chennai</option>
              <option value="Amaravati">Amaravati</option>
              <option value="Bhopal">Bhopal</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="block">include WITCH offers</Label>
            <div className="flex items-center gap-2 text-sm">
              <input id="witch" type="checkbox" checked={combineWitch} onChange={e => setCombineWitch(e.target.checked)} />
              <label htmlFor="witch" className="text-sm text-muted-foreground">combine TCS/Cognizant etc.</label>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={onRun} disabled={loading} className="sm:w-auto w-full">{loading ? 'loading…' : 'fetch'}</Button>
          {error && <Button variant="ghost" onClick={reset} className="sm:w-auto w-full">clear</Button>}
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {result && (
          <div className="mt-2 rounded-md p-0 overflow-hidden bg-muted/5 ring-1 ring-border/10">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border/60">
              result
            </div>
            <div className="p-3">
              {result?.formatted_content ? (
                <div className="prose prose-slate dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: result.formatted_content }} />
              ) : (
                <pre className="text-xs overflow-auto max-h-96">{JSON.stringify(result, null, 2)}</pre>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
