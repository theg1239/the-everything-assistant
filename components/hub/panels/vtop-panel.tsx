'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { HubVTOPCommand, PersonalHubSnapshot } from '@/types/hub'
import { Card, CardContent } from '@/components/ui/card'

const COMMANDS: { id: HubVTOPCommand; label: string; description: string }[] = [
  { id: 'profile', label: 'profile', description: 'student profile snapshot' },
  { id: 'attendance', label: 'attendance', description: 'overall & course-wise attendance' },
  { id: 'timetable', label: 'timetable', description: 'today and weekly schedule' },
  { id: 'marks', label: 'marks', description: 'internal marks breakdown' },
  { id: 'grades', label: 'grades', description: 'final grades per course' },
  { id: 'cgpa', label: 'cgpa', description: 'cumulative performance' },
  { id: 'exams', label: 'exam schedule', description: 'upcoming exam slots' },
  { id: 'receipts', label: 'fee receipts', description: 'download fee or hostel receipts' },
  { id: 'library-dues', label: 'library dues', description: 'pending fines & borrowed books' },
  { id: 'hostel', label: 'hostel info', description: 'hostel room and night out status' },
  { id: 'da', label: 'digital assignments', description: 'assignment deadlines' },
  { id: 'course-page', label: 'course materials', description: 'download notes/materials' },
]

interface VTOPPanelProps {
  linked: boolean
  runCommand: (command: HubVTOPCommand, extras?: Record<string, any>) => Promise<PersonalHubSnapshot>
  onRequireLink?: () => void
  onLink?: () => void
  onResult: (snapshot: PersonalHubSnapshot) => void
}

export default function VTOPPanel({ linked, runCommand, onRequireLink, onLink, onResult }: VTOPPanelProps) {
  const [command, setCommand] = useState<HubVTOPCommand>('attendance')
  const [semesterQuery, setSemesterQuery] = useState('')
  const [courseQuery, setCourseQuery] = useState('')
  const [materialQuery, setMaterialQuery] = useState('')
  const [snapshot, setSnapshot] = useState<PersonalHubSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRun = async () => {
    if (!linked) {
      onRequireLink?.()
      onLink?.()
      return
    }
    setLoading(true)
    setError(null)
    try {
      const extras: Record<string, any> = {}
      if (semesterQuery) extras.semesterQuery = semesterQuery
      if (courseQuery) extras.courseQuery = courseQuery
      if (materialQuery) extras.materialQuery = materialQuery
      const result = await runCommand(command, extras)
      setSnapshot(result)
      onResult(result)
    } catch (err: any) {
      setError(err?.message || 'failed to fetch data from VTOP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="command">command</Label>
          <Select value={command} onValueChange={v => setCommand(v as HubVTOPCommand)}>
            <SelectTrigger id="command">
              <SelectValue placeholder="choose a command" />
            </SelectTrigger>
            <SelectContent>
              {COMMANDS.map(cmd => (
                <SelectItem key={cmd.id} value={cmd.id}>
                  <div>
                    <p className="text-sm font-medium capitalize">{cmd.label}</p>
                    <p className="text-xs text-muted-foreground">{cmd.description}</p>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="semesterQuery">semester filter (optional)</Label>
          <Input
            id="semesterQuery"
            value={semesterQuery}
            onChange={e => setSemesterQuery(e.target.value)}
            placeholder="e.g. fall 2025 / winter"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="courseQuery">course filter</Label>
          <Input
            id="courseQuery"
            value={courseQuery}
            onChange={e => setCourseQuery(e.target.value)}
            placeholder="course code or keyword"
          />
        </div>
        {command === 'course-page' && (
          <div className="space-y-1.5">
            <Label htmlFor="materialQuery">material filter</Label>
            <Input
              id="materialQuery"
              value={materialQuery}
              onChange={e => setMaterialQuery(e.target.value)}
              placeholder="e.g. week 5 notes"
            />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={handleRun} disabled={loading}>
          {loading ? 'running…' : 'run command'}
        </Button>
        {!linked && (
          <Button
            variant="outline"
            onClick={() => {
              onRequireLink?.()
              onLink?.()
            }}
          >
            link VTOP first
          </Button>
        )}
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>}

      {snapshot && (
        <Card className="border border-border/60">
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">latest</p>
              <p className="text-base font-semibold">{snapshot.title}</p>
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{snapshot.summary}</p>
            {snapshot.formatted_content && (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: snapshot.formatted_content }}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
