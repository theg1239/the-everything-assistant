'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useHubTool } from '../use-hub-tool'

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
    <Card className="border-0">
      <CardHeader>
        <CardTitle>faculty</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>department</Label>
            <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="e.g. CSE, SMEC" />
          </div>
          <div className="space-y-1">
            <Label>faculty name</Label>
            <Input value={facultyName} onChange={e => setFacultyName(e.target.value)} placeholder="optional" />
          </div>
          <div className="space-y-1">
            <Label>course filter</Label>
            <Input value={courseQuery} onChange={e => setCourseQuery(e.target.value)} placeholder="optional" />
          </div>
          <div className="space-y-1">
            <Label className="block">include courses</Label>
            <div className="flex items-center gap-2 text-sm">
              <input id="includeCourses" type="checkbox" checked={includeCourses} onChange={e => setIncludeCourses(e.target.checked)} />
              <label htmlFor="includeCourses" className="text-sm text-muted-foreground">lists courses taught</label>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button disabled={loading} onClick={onRun} className="sm:w-auto w-full">{loading ? 'loading…' : 'search'}</Button>
          {error && <Button variant="ghost" onClick={reset} className="sm:w-auto w-full">clear</Button>}
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {list.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map((f: any, i: number) => (
              <div key={i} className="rounded-md p-3 bg-muted/20">
                <div className="text-sm font-medium">{f.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {f.department && <Badge variant="secondary" className="text-[10px]">{f.department}</Badge>}
                  {f.school && <Badge variant="outline" className="text-[10px]">{f.school}</Badge>}
                  {f.email && <Badge variant="outline" className="text-[10px]">{f.email}</Badge>}
                </div>
                {Array.isArray(f.courses) && f.courses.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[11px] text-muted-foreground mb-1">courses</div>
                    <ul className="text-xs grid grid-cols-1 gap-1">
                      {f.courses.map((c: any, idx: number) => (
                        <li key={idx} className="text-muted-foreground">{c.code}: {c.title}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {result && list.length === 0 && (
          <div className="text-sm text-muted-foreground">{result?.message || 'no faculty found'}</div>
        )}
      </CardContent>
    </Card>
  )
}
