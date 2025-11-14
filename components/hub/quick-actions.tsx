'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useHubTool } from './use-hub-tool'
import type { HubVTOPCommand, PersonalHubSnapshot } from '@/types/hub'
import {
  CalendarClock,
  ClipboardCheck,
  UtensilsCrossed,
  FileSearch,
  Briefcase,
  Loader2,
  Users,
  Flame,
} from 'lucide-react'

interface QuickActionsProps {
  linked: boolean
  onShowResult: (title: string, result: any) => void
  goTo: (page: 'briefing' | 'vtop' | 'papers' | 'mess' | 'placements' | 'faculty' | 'reddit' | 'syllabi') => void
  runVtop: (command: HubVTOPCommand, extras?: Record<string, any>) => Promise<PersonalHubSnapshot>
  onLink?: () => void
  disabled?: boolean
  syncingLabel?: string | null
}

export default function QuickActions({ linked, onShowResult, goTo, runVtop, onLink, disabled, syncingLabel }: QuickActionsProps) {
  const placements = useHubTool<any>('getPlacementInfo')
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actions, setActions] = useState<any[]>([])

  const runAttendance = async () => {
    if (!linked) {
      onLink?.()
      return goTo('briefing')
    }
    try {
      setPendingAction('attendance')
      const snapshot = await runVtop('attendance')
      onShowResult(snapshot.title || 'attendance', snapshot)
    } finally {
      setPendingAction(null)
    }
  }

  const runTimetable = async () => {
    if (!linked) {
      onLink?.()
      return goTo('briefing')
    }
    try {
      setPendingAction('timetable')
      const snapshot = await runVtop('timetable')
      onShowResult(snapshot.title || 'timetable', snapshot)
    } finally {
      setPendingAction(null)
    }
  }

  const runPlacements = async () => {
    const res = await placements.run({})
    onShowResult('placements overview', res)
  }

  useEffect(() => {
    const candidates = [
      linked
        ? {
            id: 'attendance',
            label: 'my attendance',
            icon: <ClipboardCheck className="h-3.5 w-3.5" />,
            onClick: runAttendance,
            loading: pendingAction === 'attendance',
          }
        : null,
      linked
        ? {
            id: 'timetable',
            label: 'my timetable',
            icon: <CalendarClock className="h-3.5 w-3.5" />,
            onClick: runTimetable,
            loading: pendingAction === 'timetable',
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

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }

    const chosen: any[] = []
    const seen = new Set<string>()
    for (const action of candidates) {
      if (chosen.length >= 4) break
      if (seen.has(action.id)) continue
      chosen.push(action)
      seen.add(action.id)
    }

    setActions(chosen)
  }, [linked, pendingAction, placements.loading, goTo, runVtop])

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2 sm:overflow-x-auto no-scrollbar">
      {actions.map(action => (
        <ActionButton
          key={action.id}
          label={action.label}
          icon={action.icon}
          onClick={action.onClick}
          loading={!!action.loading}
          disabled={disabled}
        />
      ))}
      {disabled && (
        <div className="col-span-full text-xs text-muted-foreground mt-1">
          {syncingLabel ? `syncing ${syncingLabel.replace('-', ' ')}…` : 'sync in progress'}
        </div>
      )}
    </div>
  )
}

function ActionButton({
  label,
  icon,
  onClick,
  loading,
  disabled,
}: {
  label: string
  icon?: ReactNode
  onClick: () => void
  loading?: boolean
  disabled?: boolean
}) {
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={onClick}
      aria-busy={loading || undefined}
      className="rounded-full px-3 whitespace-nowrap w-full sm:w-auto justify-center"
      disabled={loading || disabled}
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
