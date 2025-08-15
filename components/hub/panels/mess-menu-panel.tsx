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

export default function MessMenuPanel() {
  const { run, loading, error, result, reset } = useHubTool<any>('getMessMenu')
  const [hostelType, setHostelType] = useState<'mens' | 'ladies' | ''>('')
  const [messType, setMessType] = useState<'special' | 'veg' | 'nonveg' | ''>('')
  const [date, setDate] = useState('')
  const [mealType, setMealType] = useState('')

  const onRun = async () => {
    await run({ hostelType, messType, date: date || undefined, mealType: mealType || undefined })
  }

  const meals = result?.data?.todayMenu || null

  return (
    <Card className="border-0">
      <CardHeader>
        <CardTitle>mess menu</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>hostel</Label>
            <Select value={hostelType} onChange={setHostelType}>
              <option value="">select</option>
              <option value="mens">men's hostel</option>
              <option value="ladies">ladies hostel</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>mess</Label>
            <Select value={messType} onChange={setMessType}>
              <option value="">select</option>
              <option value="special">special</option>
              <option value="veg">veg</option>
              <option value="nonveg">non-veg</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>date</Label>
            <Input placeholder="YYYY-MM-DD or today/tomorrow" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>meal (optional)</Label>
            <Select value={mealType} onChange={setMealType}>
              <option value="">all meals</option>
              <option value="breakfast">breakfast</option>
              <option value="lunch">lunch</option>
              <option value="snacks">snacks</option>
              <option value="dinner">dinner</option>
            </Select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button disabled={!hostelType || !messType || loading} onClick={onRun} className="sm:w-auto w-full">{loading ? 'fetching…' : 'fetch'}</Button>
          {error && <Button variant="ghost" onClick={reset} className="sm:w-auto w-full">clear</Button>}
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {meals && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(meals).map(([meal, items]) => (
              <div key={meal} className="rounded-md p-0 overflow-hidden bg-muted/10 ring-1 ring-border/10">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                  {meal}
                </div>
                <div className="p-3">
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                    {Array.isArray(items)
                      ? (items as any[]).map((i: any, idx: number) => (
                          <li key={idx}>{typeof i === 'string' ? i : i.menu}</li>
                        ))
                      : null}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}

        {result && !meals && (
          <div className="text-sm text-muted-foreground">{result?.message || 'no menu available'}</div>
        )}
      </CardContent>
    </Card>
  )
}
