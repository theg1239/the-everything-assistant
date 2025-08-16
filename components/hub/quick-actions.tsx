'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { hasVTOPCredentials } from '@/lib/vtop-credentials'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { vtopResultSchema } from '@/app/api/hub/vtop/schema'
import { useHubTool } from './use-hub-tool'
import { CalendarClock, ClipboardCheck, UtensilsCrossed, FileSearch, Briefcase, Loader2, Users, Flame } from 'lucide-react'

interface QuickActionsProps {
  onShowResult: (title: string, result: any) => void
  onShowStream?: (title: string, object: any, isLoading: boolean, stop: () => void) => void
  goTo: (page: 'vtop' | 'papers' | 'mess' | 'placements' | 'faculty' | 'reddit') => void
}

export default function QuickActions({ onShowResult, onShowStream, goTo }: QuickActionsProps) {
  const [linked] = useState<boolean>(hasVTOPCredentials())
  const attendance = useObject({ api: '/api/hub/vtop', schema: vtopResultSchema }) as any
  const timetable = useObject({ api: '/api/hub/vtop', schema: vtopResultSchema }) as any
  const placements = useHubTool<any>('getPlacementInfo')
  const [startedAttendance, setStartedAttendance] = useState(false)
  const [startedTimetable, setStartedTimetable] = useState(false)
  const [actions, setActions] = useState<any[]>([])

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

  // Build and randomize actions on mount and when link state changes
  useEffect(() => {
    const candidates = [
      linked
        ? {
            id: 'attendance',
            label: 'my attendance',
            icon: <ClipboardCheck className="h-3.5 w-3.5" />,
            onClick: runAttendance,
            loading: attendance.isLoading,
            requiresLinked: true,
          }
        : null,
      linked
        ? {
            id: 'timetable',
            label: 'my timetable',
            icon: <CalendarClock className="h-3.5 w-3.5" />,
            onClick: runTimetable,
            loading: timetable.isLoading,
            requiresLinked: true,
          }
        : null,
      {
        id: 'mess',
        label: "today's mess",
        icon: <UtensilsCrossed className="h-3.5 w-3.5" />,
        onClick: () => goTo('mess'),
      },
      {
        id: 'papers',
        label: 'find past papers',
        icon: <FileSearch className="h-3.5 w-3.5" />,
        onClick: () => goTo('papers'),
      },
      {
        id: 'placements',
        label: 'placements',
        icon: <Briefcase className="h-3.5 w-3.5" />,
        onClick: runPlacements,
        loading: placements.loading,
      },
      {
        id: 'faculty',
        label: 'browse faculty',
        icon: <Users className="h-3.5 w-3.5" />,
        onClick: () => goTo('faculty'),
      },
      {
        id: 'reddit',
        label: 'reddit trends',
        icon: <Flame className="h-3.5 w-3.5" />,
        onClick: () => goTo('reddit'),
      },
    ].filter(Boolean) as any[]

    // Shuffle
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = candidates[i]
      candidates[i] = candidates[j]
      candidates[j] = tmp
    }

    // Ensure exactly 4 actions; if fewer than 4 (should not happen), fill with safe defaults
    const safeDefaults = ['mess', 'papers', 'placements', 'faculty', 'reddit']
    const chosen: any[] = []
    const seen = new Set<string>()
    for (const c of candidates) {
      if (chosen.length >= 4) break
      if (seen.has(c.id)) continue
      seen.add(c.id)
      chosen.push(c)
    }
    if (chosen.length < 4) {
      for (const id of safeDefaults) {
        if (chosen.length >= 4) break
        if (seen.has(id)) continue
        const fallback = candidates.find(c => c.id === id)
        if (fallback) {
          seen.add(id)
          chosen.push(fallback)
        }
      }
    }

    setActions(chosen.slice(0, 4))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked])

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2 sm:overflow-x-auto no-scrollbar">
      {actions.map(a => (
        <ActionButton
          key={a.id}
          label={a.label}
          icon={a.icon}
          onClick={a.onClick}
          loading={!!a.loading}
          ariaLabel={a.label}
        />
      ))}
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
