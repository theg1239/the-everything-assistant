'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { hasVTOPCredentials } from '@/lib/vtop-credentials'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { vtopResultSchema } from '@/app/api/hub/vtop/schema'
import { useHubTool } from './use-hub-tool'
import { CalendarClock, ClipboardCheck, UtensilsCrossed, FileSearch, Briefcase, Loader2 } from 'lucide-react'

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
    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2 sm:overflow-x-auto no-scrollbar">
      <ActionButton
        label={linked ? 'my attendance' : 'link vtop to use'}
        icon={<ClipboardCheck className="h-3.5 w-3.5" />}
        onClick={runAttendance}
        loading={attendance.isLoading}
        ariaLabel={linked ? 'Fetch my attendance' : 'Link VTOP to use attendance'}
      />
      <ActionButton
        label={linked ? 'my timetable' : 'link vtop to use'}
        icon={<CalendarClock className="h-3.5 w-3.5" />}
        onClick={runTimetable}
        loading={timetable.isLoading}
        ariaLabel={linked ? 'Fetch my timetable' : 'Link VTOP to use timetable'}
      />
      <ActionButton label="today's mess" icon={<UtensilsCrossed className="h-3.5 w-3.5" />} onClick={() => goTo('mess')} ariaLabel="Open today's mess menu" />
      <ActionButton label="find past papers" icon={<FileSearch className="h-3.5 w-3.5" />} onClick={() => goTo('papers')} ariaLabel="Find past papers" />
      <ActionButton label="placements" icon={<Briefcase className="h-3.5 w-3.5" />} onClick={runPlacements} loading={placements.loading} ariaLabel="View placements overview" />
    </div>
  )
}

function ActionButton({ label, icon, onClick, loading, disabled, ariaLabel }: { label: string; icon?: React.ReactNode; onClick: () => void; loading?: boolean; disabled?: boolean; ariaLabel?: string }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={disabled}
      onClick={onClick}
      aria-busy={loading || undefined}
      aria-label={ariaLabel || label}
      className="rounded-full px-3 whitespace-nowrap w-full sm:w-auto justify-center"
    >
      {loading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>running…</span>
        </>
      ) : (
        <>
          {icon}
          <span>{label}</span>
        </>
      )}
    </Button>
  )
}
