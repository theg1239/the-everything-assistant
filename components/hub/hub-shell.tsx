'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  RefreshCcw,
  Sparkles,
  Clock3,
  ClipboardCheck,
  CalendarClock,
  Award,
  GraduationCap,
  FileSearch,
  UtensilsCrossed,
  Briefcase,
  Users,
  Flame,
  LockKeyhole,
  ArrowRight,
} from 'lucide-react'

import VTOPPanel from './panels/vtop-panel'
import PastPapersPanel from './panels/past-papers-panel'
import MessMenuPanel from './panels/mess-menu-panel'
import PlacementPanel from './panels/placement-panel'
import FacultyPanel from './panels/faculty-panel'
import RedditPanel from './panels/reddit-panel'
import SyllabiPanel from './panels/syllabi-panel'
import { ResultBottomSheet } from './result-bottom-sheet'
import { HubToolProvider } from './hub-tools-context'
import type { PersonalHubState, PersonalHubSnapshot, HubVTOPCommand } from '@/types/hub'
import type { HubActionHandlers } from './hub'
import { listHubCapabilities, type HubCapability } from '@/lib/hub/capabilities'

const PINNED_COMMANDS: HubVTOPCommand[] = ['timetable', 'attendance', 'marks', 'cgpa', 'profile']
const SNAPSHOT_ICONS: Partial<Record<HubVTOPCommand, ReactNode>> = {
  attendance: <ClipboardCheck className="h-4 w-4" />,
  timetable: <CalendarClock className="h-4 w-4" />,
  marks: <Award className="h-4 w-4" />,
  cgpa: <Award className="h-4 w-4" />,
}
const SYNC_SEQUENCE: HubVTOPCommand[] = ['profile', 'attendance', 'timetable', 'marks', 'cgpa', 'exams']

type Page =
  | 'briefing'
  | 'vtop'
  | 'papers'
  | 'mess'
  | 'placements'
  | 'faculty'
  | 'reddit'
  | 'syllabi'

type HubShellProps = {
  initialState: PersonalHubState
  actions: HubActionHandlers
  syncing?: boolean
  onLink?: () => void
}

export default function HubShell({
  initialState,
  actions,
  syncing: externalSyncing = false,
  onLink,
}: HubShellProps) {
  const [page, setPage] = useState<Page>('briefing')
  const [hubState, setHubState] = useState(initialState)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerTitle, setViewerTitle] = useState('result')
  const [viewerData, setViewerData] = useState<any>(null)
  const [viewerMode, setViewerMode] = useState<'static' | 'stream'>('static')
  const [viewerLoading, setViewerLoading] = useState(false)
  const [syncing, setSyncing] = useState(externalSyncing)
  const [syncCommand, setSyncCommand] = useState<HubVTOPCommand | null>(null)
  const [capabilityLoading, setCapabilityLoading] = useState<HubVTOPCommand | null>(null)
  const capabilities = useMemo(() => listHubCapabilities(), [])

  useEffect(() => {
    setSyncing(externalSyncing)
  }, [externalSyncing])

  useEffect(() => {
    setHubState(initialState)
  }, [initialState])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return
      const target = e.target as HTMLElement | null
      if (target && target.closest('input, textarea, [contenteditable="true"], select')) return
      const map: Record<string, Page> = {
        '1': 'briefing',
        '2': 'vtop',
        '3': 'papers',
        '4': 'mess',
        '5': 'placements',
        '6': 'faculty',
        '7': 'reddit',
      }
      const next = map[e.key]
      if (next) {
        e.preventDefault()
        setPage(next)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const linked = hubState.isLinked

  const updateSnapshot = useCallback((snapshot: PersonalHubSnapshot) => {
    setHubState(prev => ({
      ...prev,
      lastSyncedAt: snapshot.fetchedAt,
      snapshots: [snapshot, ...prev.snapshots.filter(s => s.command !== snapshot.command)],
      isLinked: true,
    }))
  }, [])

  const runVtopCommand = useCallback(
    async (command: HubVTOPCommand, extras?: Record<string, any>) => {
      const snapshot = await actions.refreshVTOP(command, extras)
      updateSnapshot(snapshot)
      return snapshot
    },
    [actions, updateSnapshot]
  )

  const toolExecutor = useCallback(
    (toolName: string, args?: Record<string, any>) => {
      return actions.runTool(toolName, args || {})
    },
    [actions]
  )

  const handleSync = useCallback(async () => {
    if (!linked) {
      onLink?.()
      setPage('briefing')
      return
    }
    setSyncing(true)
    try {
      for (const command of SYNC_SEQUENCE) {
        setSyncCommand(command)
        try {
          await runVtopCommand(command)
        } catch (err) {
          console.error('[hub] failed to sync command', command, err)
        }
      }
      const finalState = await actions.refreshState()
      setHubState(finalState)
    } finally {
      setSyncCommand(null)
      setSyncing(false)
    }
  }, [actions, linked, onLink, runVtopCommand])

  const handleRefreshState = useCallback(async () => {
    setSyncing(true)
    try {
      const next = await actions.refreshState()
      setHubState(next)
    } finally {
      setSyncing(false)
    }
  }, [actions])

  const latestSnapshots = useMemo(() => {
    const priority = ['attendance', 'timetable', 'marks', 'cgpa', 'profile']
    const picked: PersonalHubSnapshot[] = []
    for (const cmd of priority) {
      const snap = hubState.snapshots.find(s => s.command === cmd)
      if (snap) picked.push(snap)
      if (picked.length >= 4) break
    }
    if (picked.length < 4) {
      for (const snap of hubState.snapshots) {
        if (!picked.includes(snap) && picked.length < 4) picked.push(snap)
      }
    }
    return picked
  }, [hubState.snapshots])

  const lastSyncedLabel = hubState.lastSyncedAt
    ? formatDistanceToNow(new Date(hubState.lastSyncedAt), { addSuffix: true })
    : 'never'

  const profileSnapshot = hubState.snapshots.find(s => s.command === 'profile')
  const terseName = useMemo(() => {
    const structuredName =
      (profileSnapshot?.structured_data as any)?.student?.name || profileSnapshot?.title
    if (!structuredName) return 'there'
    const parts = structuredName.trim().split(' ')
    return parts[0]?.toLowerCase() === 'hey' ? parts.slice(1).join(' ') : parts[0]
  }, [profileSnapshot])

  const openSnapshot = useCallback((snapshot: PersonalHubSnapshot) => {
    setViewerTitle(snapshot.title || snapshot.command)
    setViewerData(snapshot)
    setViewerMode('static')
    setViewerLoading(false)
    setViewerOpen(true)
  }, [])

  const Panel = useMemo(() => {
    switch (page) {
      case 'vtop':
        return (
          <VTOPPanel
            linked={linked}
            runCommand={runVtopCommand}
            onRequireLink={() => setPage('briefing')}
            onLink={onLink}
            onResult={openSnapshot}
          />
        )
      case 'papers':
        return <PastPapersPanel />
      case 'mess':
        return <MessMenuPanel />
      case 'placements':
        return <PlacementPanel />
      case 'faculty':
        return <FacultyPanel />
      case 'reddit':
        return <RedditPanel />
      case 'syllabi':
        return <SyllabiPanel />
      default:
        return null
    }
  }, [linked, openSnapshot, page, runVtopCommand])

  const handleCapabilityRun = useCallback(
    async (capability: HubCapability) => {
      if (!linked) {
        onLink?.()
        return
      }
      setCapabilityLoading(capability.command)
      try {
        const snapshot = await runVtopCommand(capability.command)
        openSnapshot(snapshot)
      } catch (error) {
        console.error('[hub] failed to execute capability', capability.command, error)
      } finally {
        setCapabilityLoading(null)
      }
    },
    [linked, onLink, runVtopCommand, openSnapshot]
  )

  const timetableSnapshot = useMemo(
    () => hubState.snapshots.find(s => s.command === 'timetable'),
    [hubState.snapshots]
  )
  const assignmentsSnapshot = useMemo(
    () => hubState.snapshots.find(s => s.command === 'da'),
    [hubState.snapshots]
  )
  const attendanceSnapshot = useMemo(
    () => hubState.snapshots.find(s => s.command === 'attendance'),
    [hubState.snapshots]
  )
  const leaveSnapshot = useMemo(
    () => hubState.snapshots.find(s => s.command === 'leave' || s.command === 'leave-status'),
    [hubState.snapshots]
  )
  const examsSnapshot = useMemo(
    () => hubState.snapshots.find(s => s.command === 'exams' || s.command === 'exam-schedule'),
    [hubState.snapshots]
  )

  const nextClassInsight = useMemo(() => deriveNextClassInsight(timetableSnapshot), [timetableSnapshot])
  const assignmentsInsight = useMemo(() => deriveAssignmentInsight(assignmentsSnapshot), [assignmentsSnapshot])
  const attendanceInsight = useMemo(() => deriveAttendanceInsight(attendanceSnapshot), [attendanceSnapshot])
  const leaveInsight = useMemo(() => deriveLeaveInsight(leaveSnapshot), [leaveSnapshot])
  const examInsight = useMemo(() => deriveExamInsight(examsSnapshot), [examsSnapshot])

  const quickCaps = useMemo(
    () => capabilities.filter(cap => ['attendance', 'timetable', 'da', 'leave', 'exams'].includes(cap.command)),
    [capabilities]
  )
  const daCapability = useMemo(() => capabilities.find(cap => cap.command === 'da'), [capabilities])

  const renderBriefing = () => (
    <div className="space-y-4 mt-2">
      {linked ? (
        <MinimalStatusCard
          terseName={terseName}
          syncing={syncing}
          syncCommand={syncCommand}
          lastSyncedLabel={lastSyncedLabel}
          onSync={handleSync}
          onRefresh={handleRefreshState}
          quickCaps={quickCaps}
          onCapability={handleCapabilityRun}
          loadingCommand={capabilityLoading}
          disabled={syncing}
        />
      ) : (
        <HubOnboarding onLink={onLink} />
      )}

      {linked && (
        <section className="grid gap-2 sm:grid-cols-2">
          <InsightCard
            label="next class"
            headline={nextClassInsight?.headline || 'no class detected'}
            supporting={nextClassInsight?.supporting}
            meta={nextClassInsight?.meta || 'sync timetable to hydrate'}
            onOpen={() => timetableSnapshot && openSnapshot(timetableSnapshot)}
          />
          <InsightCard
            label="assignments"
            headline={assignmentsInsight?.headline || 'all clear'}
            supporting={assignmentsInsight?.supporting}
            meta={assignmentsInsight?.meta || 'run digital assignments to update'}
            onOpen={() => assignmentsSnapshot && openSnapshot(assignmentsSnapshot)}
            onAction={daCapability ? () => handleCapabilityRun(daCapability) : undefined}
            actionLabel={daCapability ? 'refresh' : undefined}
            disabled={!daCapability}
          />
          <InsightCard
            label="attendance"
            headline={attendanceInsight?.headline || 'run sync to load'}
            supporting={attendanceInsight?.supporting}
            meta={attendanceInsight?.meta}
            onOpen={() => attendanceSnapshot && openSnapshot(attendanceSnapshot)}
          />
          <InsightCard
            label="leave status"
            headline={leaveInsight?.headline || 'no requests'}
            supporting={leaveInsight?.supporting}
            meta={leaveInsight?.meta}
            onOpen={() => leaveSnapshot && openSnapshot(leaveSnapshot)}
          />
          <InsightCard
            label="exam schedule"
            headline={examInsight?.headline || 'no upcoming exams'}
            supporting={examInsight?.supporting}
            meta={examInsight?.meta}
            onOpen={() => examsSnapshot && openSnapshot(examsSnapshot)}
          />
        </section>
      )}

      {linked && latestSnapshots.length > 0 && (
        <section className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">latest pulls</div>
          <div className="space-y-1">
            {latestSnapshots.map(snapshot => (
              <SnapshotGlance key={snapshot.command} snapshot={snapshot} onOpen={openSnapshot} minimal />
            ))}
          </div>
        </section>
      )}
    </div>
  )

  return (
    <HubToolProvider value={toolExecutor}>
      <div className="h-full flex flex-col">
        <div className="p-3 sm:p-4 border-b border-border/60 bg-card/60 sticky top-0">
          <div className="max-w-6xl mx-auto">
            <div
              className="mt-2 overflow-x-auto no-scrollbar [-ms-overflow-style:none] [scrollbar-width:none]"
              data-allow-touch-scroll
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
            >
              <div className="flex gap-1.5 min-w-max">
                {(
                  [
                    { id: 'briefing', label: 'briefing', icon: <Sparkles className="h-3.5 w-3.5" /> },
                    { id: 'vtop', label: 'vtop', icon: <GraduationCap className="h-3.5 w-3.5" /> },
                    { id: 'papers', label: 'past papers', icon: <FileSearch className="h-3.5 w-3.5" /> },
                    { id: 'mess', label: 'mess menu', icon: <UtensilsCrossed className="h-3.5 w-3.5" /> },
                    { id: 'placements', label: 'placements', icon: <Briefcase className="h-3.5 w-3.5" /> },
                    { id: 'faculty', label: 'faculty', icon: <Users className="h-3.5 w-3.5" /> },
                    { id: 'reddit', label: 'reddit', icon: <Flame className="h-3.5 w-3.5" /> },
                    { id: 'syllabi', label: 'syllabi', icon: <FileSearch className="h-3.5 w-3.5" /> },
                ] as { id: Page; label: string; icon: ReactNode }[]
                ).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setPage(tab.id)}
                    aria-pressed={page === tab.id}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      page === tab.id
                        ? 'bg-primary/10 border-primary/30 text-primary shadow-sm'
                        : 'bg-muted/30 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {tab.icon}
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-5 [-webkit-overflow-scrolling:touch]" data-allow-touch-scroll>
          <div className="max-w-6xl mx-auto">
            {page === 'briefing' ? renderBriefing() : Panel}
            <div className="h-2" />
          </div>
        </div>

        <ResultBottomSheet
          open={viewerOpen}
          title={viewerTitle}
          result={viewerData}
          onClose={() => setViewerOpen(false)}
        />
     </div>
   </HubToolProvider>
 )
}

function MinimalStatusCard({
  terseName,
  syncing,
  syncCommand,
  lastSyncedLabel,
  onSync,
  onRefresh,
  quickCaps,
  onCapability,
  loadingCommand,
  disabled,
}: {
  terseName: string
  syncing: boolean
  syncCommand: HubVTOPCommand | null
  lastSyncedLabel: string
  onSync: () => void
  onRefresh: () => void
  quickCaps: HubCapability[]
  onCapability: (capability: HubCapability) => void
  loadingCommand: HubVTOPCommand | null
  disabled: boolean
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-[#06070b] p-4 sm:p-5 space-y-4">
      <div className="text-xs font-semibold text-muted-foreground">hub status</div>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">hey {terseName},</p>
        <div className="text-2xl font-light text-foreground">
          {syncing && syncCommand ? `syncing ${syncCommand.replace('-', ' ')}` : 'standing by'}
        </div>
        <div className="text-xs text-muted-foreground">
          {syncing ? 'streaming live' : `last synced ${lastSyncedLabel}`}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onSync} disabled={syncing} className="rounded-full px-5">
          <RefreshCcw className="h-4 w-4 mr-2" />
          {syncing ? 'syncing…' : 'sync now'}
        </Button>
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={syncing}
          className="rounded-full px-5 border-border/60"
        >
          <Clock3 className="h-4 w-4 mr-2" />
          reload cache
        </Button>
      </div>
      {quickCaps.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {quickCaps.map(cap => (
            <button
              key={cap.command}
              onClick={() => onCapability(cap)}
              disabled={disabled || loadingCommand === cap.command}
              className="text-xs text-muted-foreground border border-border/40 rounded-full px-3 py-1 hover:text-foreground disabled:opacity-60"
            >
              {loadingCommand === cap.command ? 'running…' : cap.command}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function InsightCard({
  label,
  headline,
  supporting,
  meta,
  onOpen,
  onAction,
  actionLabel,
  disabled,
}: {
  label: string
  headline: string
  supporting?: string
  meta?: string
  onOpen?: () => void
  onAction?: () => void
  actionLabel?: string
  disabled?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/30 px-4 py-3 space-y-2">
      <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
        <span>{label}</span>
        {onOpen && (
          <button className="text-muted-foreground hover:text-foreground" onClick={onOpen}>
            view
          </button>
        )}
      </div>
      <div className="text-xl font-light tracking-tight text-foreground">{headline}</div>
      {supporting && <p className="text-sm text-muted-foreground leading-relaxed">{supporting}</p>}
      {meta && <div className="text-xs text-muted-foreground/80">{meta}</div>}
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          disabled={disabled}
          className="text-[10px] uppercase tracking-[0.35em] text-primary hover:text-primary/80"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function SnapshotCard({
  snapshot,
  onOpen,
}: {
  snapshot: PersonalHubSnapshot
  onOpen: (snapshot: PersonalHubSnapshot) => void
}) {
  return (
    <Card className="border border-border/50 bg-card/80">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{snapshot.command}</p>
            <p className="text-base font-semibold">{snapshot.title}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onOpen(snapshot)}>
            view
          </Button>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-3">{snapshot.summary}</p>
      </CardContent>
    </Card>
  )
}

function SnapshotGlance({
  snapshot,
  onOpen,
  minimal = false,
}: {
  snapshot: PersonalHubSnapshot
  onOpen: (snapshot: PersonalHubSnapshot) => void
  minimal?: boolean
}) {
  const icon = SNAPSHOT_ICONS[snapshot.command as HubVTOPCommand]
  const summary = snapshot.summary?.split('\n').filter(Boolean).slice(0, 2).join(' ') || 'view details'
  const updatedLabel = formatDistanceToNow(new Date(snapshot.fetchedAt), { addSuffix: true })

  return (
    <Card className={minimal ? 'border border-border/40 bg-background/30' : 'border border-border/50 bg-card/80'}>
      <CardContent className={minimal ? 'p-3 space-y-1.5' : 'p-4 space-y-2'}>
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          {icon && <span className="text-primary">{icon}</span>}
          <span>{snapshot.title}</span>
        </div>
        <p className="text-sm text-foreground line-clamp-2">{summary}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground/80">
          <span>updated {updatedLabel}</span>
          <button onClick={() => onOpen(snapshot)} className="text-primary hover:text-primary/80">
            open
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

function HubOnboarding({ onLink }: { onLink?: () => void }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-[#06070b] p-5 space-y-4">
      <div className="text-sm font-semibold text-muted-foreground">hub requires VTOP linking</div>
      <p className="text-2xl font-light text-foreground">
        connect once to pull timetable, assignments, attendance, leave status and exams without leaving chat.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => onLink?.()} className="rounded-full px-6">
          <span>link VTOP</span>
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LockKeyhole className="h-4 w-4" />
          credentials stay on-device
        </div>
      </div>
    </div>
  )
}

type Insight = {
  headline: string
  supporting?: string
  meta?: string
}

function deriveNextClassInsight(snapshot?: PersonalHubSnapshot | null): Insight | null {
  if (!snapshot?.structured_data) return null
  const data: any = snapshot.structured_data
  const candidates =
    data?.upcomingClass || data?.upcoming || data?.nextClass || data?.next_session || data?.next
  const pick = Array.isArray(data?.classes)
    ? data.classes.find((cls: any) => cls?.startTime || cls?.start)
    : Array.isArray(data?.schedule)
      ? data.schedule.find((cls: any) => cls?.startTime || cls?.start)
      : candidates
  if (!pick) return null
  const course = pick.course || pick.subject || pick.title || snapshot.title
  const time = pick.startTime || pick.start || pick.slot || pick.time
  const room = pick.location || pick.room || pick.venue
  return {
    headline: `${course || 'class'} @ ${time || 'unknown'}`.trim(),
    supporting: room ? `room ${room}` : undefined,
    meta: pick.faculty ? `with ${pick.faculty}` : undefined,
  }
}

function deriveAssignmentInsight(snapshot?: PersonalHubSnapshot | null): Insight | null {
  if (!snapshot?.structured_data) return null
  const data: any = snapshot.structured_data
  const list: any[] = data?.assignments || data?.due || data?.items || data?.upcoming
  if (Array.isArray(list) && list.length > 0) {
    const upcoming = list
      .map(item => ({
        title: item.title || item.course || item.assignment,
        due: item.dueDate || item.deadline || item.due,
      }))
      .filter(item => item.title)
    if (!upcoming.length) return null
    const first = upcoming[0]
    return {
      headline: first.title,
      supporting: first.due ? `due ${first.due}` : undefined,
      meta: upcoming.length > 1 ? `${upcoming.length - 1} more` : undefined,
    }
  }
  return null
}

function deriveAttendanceInsight(snapshot?: PersonalHubSnapshot | null): Insight | null {
  if (!snapshot?.structured_data) return null
  const stats = (snapshot.structured_data as any)?.stats
  if (stats?.healthy !== undefined) {
    return {
      headline: `${stats.healthy} steady / ${stats.needsAttention} at risk`,
      supporting: snapshot.summary,
      meta: 'auto synced',
    }
  }
  return snapshot.summary
    ? {
        headline: snapshot.summary,
      }
    : null
}

function deriveLeaveInsight(snapshot?: PersonalHubSnapshot | null): Insight | null {
  if (!snapshot?.structured_data) return null
  const data: any = snapshot.structured_data
  const pending = (data.requests || data.leaves || []).find(
    (req: any) => (req.status || req.state || '').toLowerCase().includes('pending')
  )
  if (pending) {
    return {
      headline: pending.title || pending.purpose || 'pending request',
      supporting: pending.status,
      meta: pending.from && pending.to ? `${pending.from} → ${pending.to}` : undefined,
    }
  }
  return {
    headline: 'no pending leave',
  }
}

function deriveExamInsight(snapshot?: PersonalHubSnapshot | null): Insight | null {
  if (!snapshot?.structured_data) return null
  const data: any = snapshot.structured_data
  const upcoming = (data.schedule || data.exams || []).find((exam: any) => exam.date || exam.day)
  if (upcoming) {
    return {
      headline: `${upcoming.course || upcoming.title || 'exam'} on ${upcoming.date || upcoming.day}`,
      supporting: upcoming.session ? `${upcoming.session} session` : undefined,
      meta: upcoming.venue || upcoming.hall,
    }
  }
  return null
}
