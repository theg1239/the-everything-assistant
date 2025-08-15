'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { hasVTOPCredentials } from '@/lib/vtop-credentials'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { vtopResultSchema } from '@/app/api/hub/vtop/schema'
import { useHubTool } from './use-hub-tool'

interface QuickActionsProps {
  onShowResult: (title: string, result: any) => void
  onShowStream?: (title: string, object: any, isLoading: boolean, stop: () => void) => void
  goTo: (page: 'vtop' | 'papers' | 'mess' | 'placements' | 'faculty') => void
}

export default function QuickActions({ onShowResult, onShowStream, goTo }: QuickActionsProps) {
  const [linked] = useState<boolean>(hasVTOPCredentials())
  const attendance = useObject({ api: '/api/hub/vtop', schema: vtopResultSchema }) as any
  const timetable = useObject({ api: '/api/hub/vtop', schema: vtopResultSchema }) as any
  const placements = useHubTool<any>('getPlacementInfo')
  const [startedAttendance, setStartedAttendance] = useState(false)
  const [startedTimetable, setStartedTimetable] = useState(false)

  const runAttendance = async () => {
    if (!linked) return goTo('vtop')
    await attendance.submit({ command: 'attendance', extras: {} })
    if (onShowStream) onShowStream('attendance', attendance.object, attendance.isLoading, attendance.stop)
    setStartedAttendance(true)
  }

  const runTimetable = async () => {
    if (!linked) return goTo('vtop')
    await timetable.submit({ command: 'timetable', extras: {} })
    if (onShowStream) onShowStream('timetable', timetable.object, timetable.isLoading, timetable.stop)
    setStartedTimetable(true)
  }

  useEffect(() => {
    if (startedAttendance && onShowStream) {
      onShowStream('attendance', attendance.object, attendance.isLoading, attendance.stop)
    }
  }, [startedAttendance, attendance.object, attendance.isLoading])

  useEffect(() => {
    if (startedTimetable && onShowStream) {
      onShowStream('timetable', timetable.object, timetable.isLoading, timetable.stop)
    }
  }, [startedTimetable, timetable.object, timetable.isLoading])

  const runPlacements = async () => {
    const res = await placements.run({})
    onShowResult('placements overview', res)
  }

  return (
    <div className="flex items-center gap-2 overflow-auto no-scrollbar">
      <ActionButton label="my attendance" onClick={runAttendance} loading={attendance.isLoading} disabled={!linked} />
      <ActionButton label="my timetable" onClick={runTimetable} loading={timetable.isLoading} disabled={!linked} />
      <ActionButton label="today's mess" onClick={() => goTo('mess')} />
      <ActionButton label="find past papers" onClick={() => goTo('papers')} />
      <ActionButton label="placements" onClick={runPlacements} loading={placements.loading} />
    </div>
  )
}

function ActionButton({ label, onClick, loading, disabled }: { label: string; onClick: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={disabled || loading}
      onClick={onClick}
      className="rounded-full px-3 whitespace-nowrap"
    >
      {loading ? 'running…' : label}
    </Button>
  )
}
