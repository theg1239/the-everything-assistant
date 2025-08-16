'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useHubTool } from '../use-hub-tool'
import { Briefcase, Search, X } from 'lucide-react'

export default function PlacementPanel() {
  const { run, loading, error, result, reset } = useHubTool<any>('getPlacementInfo')
  const [year, setYear] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [campus, setCampus] = useState('any')
  const [combineWitch, setCombineWitch] = useState(false)

  const onRun = async () => {
    await run({
      year: year || undefined,
      companyFilter: companyFilter || undefined,
      combineWitch,
      campus: campus === 'any' ? undefined : campus,
    })
  }

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" /> placements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="year">year</Label>
            <Input
              id="year"
              value={year}
              onChange={e => setYear(e.target.value)}
              placeholder="e.g. 2024-25"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="companyFilter">company filter</Label>
            <Input
              id="companyFilter"
              value={companyFilter}
              onChange={e => setCompanyFilter(e.target.value)}
              placeholder="optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campus">campus</Label>
            <Select value={campus} onValueChange={setCampus}>
              <SelectTrigger id="campus">
                <SelectValue placeholder="any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">any</SelectItem>
                <SelectItem value="Vellore">vellore</SelectItem>
                <SelectItem value="Chennai">chennai</SelectItem>
                <SelectItem value="Amaravati">amaravati</SelectItem>
                <SelectItem value="Bhopal">bhopal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2 pt-4">
            <Switch id="witch" checked={combineWitch} onCheckedChange={setCombineWitch} />
            <Label htmlFor="witch" className="text-sm text-muted-foreground">
              combine witch offers
            </Label>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={onRun} disabled={loading} className="sm:w-auto w-full">
            <Search className="mr-2 h-4 w-4" />
            {loading ? 'loading...' : 'fetch'}
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

        {result && (
          <Card className="mt-4 bg-muted/20 border-border/30">
            <CardHeader>
              <CardTitle className="text-base">placement results</CardTitle>
            </CardHeader>
            <CardContent>
              {result?.formatted_content ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: result.formatted_content }}
                />
              ) : (
                <pre className="text-xs overflow-auto max-h-96 bg-background/50 p-3 rounded-md">
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  )
}
