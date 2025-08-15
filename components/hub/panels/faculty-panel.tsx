'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useHubTool } from '../use-hub-tool'
import { Search, X, BookOpen } from 'lucide-react'

export default function FacultyPanel() {
  const { run, loading, error, result, reset } = useHubTool<any>('getFacultyInfo')
  const [department, setDepartment] = useState('')
  const [facultyName, setFacultyName] = useState('')
  const [courseQuery, setCourseQuery] = useState('')
  const [includeCourses, setIncludeCourses] = useState(false)

  const onRun = async () => {
    await run({
      department: department || undefined,
      facultyName: facultyName || undefined,
      includeCourses,
      courseQuery: courseQuery || undefined,
    })
  }

  const list = Array.isArray(result?.faculty) ? result.faculty : []

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader>
        <CardTitle>Faculty Directory</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="department">Department</Label>
            <Input id="department" value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. CSE, SMEC" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="facultyName">Faculty Name</Label>
            <Input id="facultyName" value={facultyName} onChange={e => setFacultyName(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="courseQuery">Course Filter</Label>
            <Input id="courseQuery" value={courseQuery} onChange={e => setCourseQuery(e.target.value)} placeholder="Optional" />
          </div>
          <div className="flex items-center space-x-2 pt-4">
            <Switch id="includeCourses" checked={includeCourses} onCheckedChange={setIncludeCourses} />
            <Label htmlFor="includeCourses" className="text-sm text-muted-foreground">
              Include courses taught by faculty
            </Label>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button disabled={loading} onClick={onRun} className="sm:w-auto w-full">
            <Search className="mr-2 h-4 w-4" />
            {loading ? 'Searching...' : 'Search'}
          </Button>
          {(error || result) && (
            <Button variant="ghost" onClick={reset} className="sm:w-auto w-full">
              <X className="mr-2 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>

        {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}

        {list.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {list.map((f: any, i: number) => (
              <Card key={i} className="bg-muted/20 border-border/30 hover:bg-muted/40 transition-colors">
                <CardHeader>
                  <CardTitle className="text-base">{f.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {f.department && <Badge variant="secondary">{f.department}</Badge>}
                    {f.school && <Badge variant="outline">{f.school}</Badge>}
                  </div>
                  {f.email && <Badge variant="outline" className="text-xs">{f.email}</Badge>}
                </CardContent>
                {Array.isArray(f.courses) && f.courses.length > 0 && (
                  <CardFooter className="flex-col items-start gap-2 pt-4">
                    <div className="text-xs text-muted-foreground font-medium flex items-center">
                      <BookOpen className="mr-2 h-4 w-4" />
                      Courses Taught
                    </div>
                    <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
                      {f.courses.map((c: any, idx: number) => (
                        <li key={idx}>{c.code}: {c.title}</li>
                      ))}
                    </ul>
                  </CardFooter>
                )}
              </Card>
            ))}
          </div>
        )}

        {result && list.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            {result?.message || 'No faculty found matching your criteria.'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}