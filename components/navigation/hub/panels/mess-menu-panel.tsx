'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useHubTool } from '../use-hub-tool'
import { Utensils, Search, X } from 'lucide-react'

export default function MessMenuPanel() {
  const { run, loading, error, result, reset } = useHubTool<any>('getMessMenu')
  const [hostelType, setHostelType] = useState<'mens' | 'ladies' | ''>('')
  const [messType, setMessType] = useState<'special' | 'veg' | 'nonveg' | ''>('')
  const [date, setDate] = useState('')
  const [mealType, setMealType] = useState('all')

  const onRun = async () => {
    await run({
      hostelType,
      messType,
      date: date || undefined,
      mealType: mealType === 'all' ? undefined : mealType,
    })
  }

  const meals = result?.data?.todayMenu || null

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {' '}
          <Utensils className="h-5 w-5" /> mess menu
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="hostel">hostel</Label>
            <Select value={hostelType} onValueChange={value => setHostelType(value as any)}>
              <SelectTrigger id="hostel">
                <SelectValue placeholder="select hostel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mens">men's hostel</SelectItem>
                <SelectItem value="ladies">ladies hostel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mess">mess</Label>
            <Select value={messType} onValueChange={value => setMessType(value as any)}>
              <SelectTrigger id="mess">
                <SelectValue placeholder="select mess" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="special">special</SelectItem>
                <SelectItem value="veg">veg</SelectItem>
                <SelectItem value="nonveg">non-veg</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">date</Label>
            <Input
              id="date"
              placeholder="optional (e.g., today)"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meal">meal</Label>
            <Select value={mealType} onValueChange={setMealType}>
              <SelectTrigger id="meal">
                <SelectValue placeholder="all meals" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all meals</SelectItem>
                <SelectItem value="breakfast">breakfast</SelectItem>
                <SelectItem value="lunch">lunch</SelectItem>
                <SelectItem value="snacks">snacks</SelectItem>
                <SelectItem value="dinner">dinner</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            disabled={!hostelType || !messType || loading}
            onClick={onRun}
            className="sm:w-auto w-full"
          >
            <Search className="mr-2 h-4 w-4" />
            {loading ? 'fetching...' : 'fetch menu'}
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

        {meals && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            {Object.entries(meals).map(([meal, items]) => (
              <Card key={meal} className="bg-muted/20 border-border/30">
                <CardHeader>
                  <CardTitle className="text-base capitalize">{meal}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1.5">
                    {Array.isArray(items)
                      ? (items as any[]).map((i: any, idx: number) => (
                          <li key={idx}>{typeof i === 'string' ? i : i.menu}</li>
                        ))
                      : null}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {result && !meals && (
          <div className="text-sm text-muted-foreground text-center py-8">
            {result?.message || 'no menu available for the selected criteria.'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
