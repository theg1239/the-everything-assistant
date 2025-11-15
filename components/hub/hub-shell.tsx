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
  const nowTick = useNow(60000)

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

  const profileSnapshot = useMemo(
    () => hubState.snapshots.find(s => s.command === 'profile'),
    [hubState.snapshots]
  )
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
  const hostelSnapshot = useMemo(
    () => hubState.snapshots.find(s => s.command === 'hostel'),
    [hubState.snapshots]
  )
  const librarySnapshot = useMemo(
    () => hubState.snapshots.find(s => s.command === 'library-dues'),
    [hubState.snapshots]
  )
  const gradesSnapshot = useMemo(
    () => hubState.snapshots.find(s => s.command === 'grades'),
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

  const nextClassInsight = useMemo(
    () => deriveNextClassInsight(timetableSnapshot, nowTick),
    [timetableSnapshot, nowTick]
  )
  const assignmentsInsight = useMemo(
    () => deriveAssignmentInsight(assignmentsSnapshot, nowTick),
    [assignmentsSnapshot, nowTick]
  )
  const attendanceInsight = useMemo(() => deriveAttendanceInsight(attendanceSnapshot), [attendanceSnapshot])
  const leaveInsight = useMemo(() => deriveLeaveInsight(leaveSnapshot), [leaveSnapshot])
  const examInsight = useMemo(() => deriveExamInsight(examsSnapshot, nowTick), [examsSnapshot, nowTick])
  const attendanceRisks = useMemo(() => {
    const rows = ((attendanceSnapshot?.structured_data as any)?.rows || []) as any[]
    return rows
      .map(row => {
        const numeric = typeof row.percentage === 'string' ? parseFloat(row.percentage) : Number(row.percentage)
        return { ...row, numeric: Number.isFinite(numeric) ? numeric : null }
      })
      .filter(row => row.numeric !== null)
      .sort((a, b) => (a.numeric ?? 0) - (b.numeric ?? 0))
      .slice(0, 3)
  }, [attendanceSnapshot])
  const assignmentSubjects = useMemo(() => {
    const now = nowTick ? new Date(nowTick) : new Date()
    const subjects = normalizeAssignments(assignmentsSnapshot, now).sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime()
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return 0
    })
    return subjects.slice(0, 3).map(subject => ({
      ...subject,
      displayDue: subject.dueDate
        ? `${formatShortDate(subject.dueDate)} (${formatDistanceToNow(subject.dueDate, { addSuffix: true })})`
        : subject.nextDue,
    }))
  }, [assignmentsSnapshot, nowTick])

  const quickCaps = useMemo(
    () => capabilities.filter(cap => ['attendance', 'timetable', 'da', 'leave', 'exams'].includes(cap.command)),
    [capabilities]
  )
  const daCapability = useMemo(() => capabilities.find(cap => cap.command === 'da'), [capabilities])
  const notifications = useMemo(
    () =>
      deriveNotifications(
        {
          attendanceSnapshot,
          assignmentsSnapshot,
          leaveSnapshot,
          examsSnapshot,
          librarySnapshot,
          gradesSnapshot,
        },
        nowTick
      ),
    [attendanceSnapshot, assignmentsSnapshot, leaveSnapshot, examsSnapshot, librarySnapshot, gradesSnapshot, nowTick]
  )
  const persona = useMemo(() => derivePersona(profileSnapshot, hostelSnapshot), [profileSnapshot, hostelSnapshot])

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

      {persona && <PersonaStrip persona={persona} onLink={onLink} />}

      {linked && timetableSnapshot && (
        <TimetablePeek
          snapshot={timetableSnapshot}
          now={nowTick}
          onOpen={() => openSnapshot(timetableSnapshot)}
        />
      )}

      {linked && (attendanceRisks.length > 0 || assignmentSubjects.length > 0) && (
        <section className="grid gap-3 sm:grid-cols-2">
          {attendanceRisks.length > 0 && (
            <MiniListCard
              label="attendance watch"
              items={attendanceRisks.map(item => ({
                title: item.subject,
                meta: item.percentage,
                supporting: item.alert?.toLowerCase().includes('attend') ? item.alert : undefined,
              }))}
              fallback="all courses steady"
              onOpen={() => attendanceSnapshot && openSnapshot(attendanceSnapshot)}
            />
          )}
          {assignmentSubjects.length > 0 && (
            <MiniListCard
              label="due soon"
              items={assignmentSubjects.map(item => ({
                title: item.subject,
                meta: item.displayDue || item.nextDue,
                supporting: item.status,
              }))}
              fallback="no assignments found"
              onOpen={() => assignmentsSnapshot && openSnapshot(assignmentsSnapshot)}
            />
          )}
        </section>
      )}

      {linked && notifications.length > 0 && (
        <NotificationStrip
          notifications={notifications}
          capabilities={capabilities}
          onRun={handleCapabilityRun}
        />
      )}

      {linked && (
        <section className="rounded-3xl border border-border/40 bg-background/20 divide-y divide-border/40">
          <CompactInsightRow
            label="next class"
            headline={nextClassInsight?.headline || 'no class detected'}
            supporting={nextClassInsight?.supporting || 'sync timetable to hydrate'}
            meta={nextClassInsight?.meta}
            onOpen={() => timetableSnapshot && openSnapshot(timetableSnapshot)}
          />
          <CompactInsightRow
            label="assignments"
            headline={assignmentsInsight?.headline || 'all clear'}
            supporting={assignmentsInsight?.supporting || 'run digital assignments to update'}
            meta={assignmentsInsight?.meta}
            actionLabel={daCapability ? 'refresh' : undefined}
            onAction={daCapability ? () => handleCapabilityRun(daCapability) : undefined}
            onOpen={() => assignmentsSnapshot && openSnapshot(assignmentsSnapshot)}
          />
          <CompactInsightRow
            label="attendance"
            headline={attendanceInsight?.headline || 'run sync to load'}
            supporting={attendanceInsight?.supporting}
            meta={attendanceInsight?.meta}
            onOpen={() => attendanceSnapshot && openSnapshot(attendanceSnapshot)}
          />
          <CompactInsightRow
            label="leave status"
            headline={leaveInsight?.headline || 'no requests'}
            supporting={leaveInsight?.supporting}
            meta={leaveInsight?.meta}
            onOpen={() => leaveSnapshot && openSnapshot(leaveSnapshot)}
          />
          <CompactInsightRow
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

function CompactInsightRow({
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
    <div className="flex flex-col gap-1 px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/80">{label}</p>
        {onOpen && (
          <button
            onClick={onOpen}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            view
          </button>
        )}
      </div>
      <div className="text-lg font-medium text-foreground leading-tight">{headline}</div>
      {supporting && <div className="text-sm text-muted-foreground/90">{supporting}</div>}
      <div className="flex items-center justify-between text-xs text-muted-foreground/80">
        <span>{meta || ''}</span>
        {onAction && actionLabel && (
          <button
            onClick={onAction}
            disabled={disabled}
            className="text-[10px] uppercase tracking-[0.3em] text-primary hover:text-primary/80 disabled:opacity-60"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function NotificationStrip({
  notifications,
  capabilities,
  onRun,
}: {
  notifications: HubNotification[]
  capabilities: HubCapability[]
  onRun: (capability: HubCapability) => void
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border/50 bg-background/20 px-4 py-3 flex flex-wrap gap-2">
      {notifications.map(notification => {
        const capability = notification.command
          ? capabilities.find(cap => cap.command === notification.command)
          : null
        const clickable = Boolean(capability)
        return (
          <button
            key={notification.id}
            onClick={() => capability && onRun(capability)}
            disabled={!clickable}
            className={`rounded-full border border-border/40 px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/60 transition-colors ${
              !clickable ? 'opacity-60 cursor-default' : ''
            }`}
          >
            {notification.text}
          </button>
        )
      })}
    </div>
  )
}

function PersonaStrip({ persona, onLink }: { persona: Persona; onLink?: () => void }) {
  return (
    <div className="rounded-3xl border border-border/40 bg-background/20 px-4 py-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {persona.registerNumber && <span>{persona.registerNumber}</span>}
      {persona.program && <span>{persona.program}</span>}
      {persona.school && <span>{persona.school}</span>}
      {persona.hostelBlock && <span>{persona.hostelBlock}</span>}
      {persona.room && <span>Room {persona.room}</span>}
      {persona.mess && <span>Mess: {persona.mess}</span>}
      {!persona.hostelBlock && onLink && (
        <button className="text-primary" onClick={onLink}>
          link hostel data
        </button>
      )}
    </div>
  )
}

function TimetablePeek({
  snapshot,
  onOpen,
  now,
}: {
  snapshot: PersonalHubSnapshot
  onOpen?: () => void
  now?: number
}) {
  const data: any = snapshot.structured_data
  const classes: any[] = Array.isArray(data?.classes) ? data.classes : []
  if (!classes.length) return null
  const reference = now ? new Date(now) : new Date()
  const rolling = computeDynamicNextClass(data, reference)
  const highlight = rolling?.classInfo || data?.nextClass || classes[0]
  const rows = classes.slice(0, 4)

  const formatTime = (cls: any) => {
    if (cls?.startTime && cls?.endTime) return `${cls.startTime} – ${cls.endTime}`
    if (cls?.startTime) return cls.startTime
    if (cls?.slot) return cls.slot
    return '—'
  }

  return (
    <div className="rounded-3xl border border-border/40 bg-background/20 px-4 py-4 space-y-3">
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>coverage map</span>
        {onOpen && (
          <button className="text-muted-foreground hover:text-foreground" onClick={onOpen}>
            view timetable
          </button>
        )}
      </div>
      {highlight && (
        <div className="rounded-2xl border border-border/40 bg-background/40 p-3 text-sm leading-relaxed text-foreground">
          <div className="text-[10px] uppercase tracking-[0.3em] text-primary/80">next</div>
          <div className="text-base font-medium">{highlight.subject || highlight.slot || 'class'}</div>
          <div className="text-xs text-muted-foreground">
            {rolling?.startsAt
              ? new Intl.DateTimeFormat(undefined, {
                  weekday: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(rolling.startsAt)
              : formatTime(highlight)}
          </div>
          <div className="text-[11px] text-muted-foreground/80">
            {[
              highlight.day,
              rolling?.startsAt ? formatDistanceToNow(rolling.startsAt, { addSuffix: true }) : null,
              highlight.venue,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((cls, idx) => (
          <div key={`${cls.day}-${cls.slot}-${idx}`} className="rounded-2xl border border-border/30 bg-background/10 p-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/80">
              {cls.day || 'day'}
            </div>
            <div className="text-sm font-medium text-foreground line-clamp-1">
              {cls.subject || cls.slot || 'class'}
            </div>
            <div className="text-xs text-muted-foreground">{formatTime(cls)}</div>
            {cls.venue && <div className="text-[11px] text-muted-foreground/80">{cls.venue}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniListCard({
  label,
  items,
  fallback,
  onOpen,
}: {
  label: string
  items: { title?: string; supporting?: string; meta?: string }[]
  fallback: string
  onOpen?: () => void
}) {
  return (
    <div className="rounded-3xl border border-border/40 bg-background/20 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>{label}</span>
        {onOpen && (
          <button className="text-muted-foreground hover:text-foreground" onClick={onOpen}>
            view
          </button>
        )}
      </div>
      {items.length === 0 && <div className="text-sm text-muted-foreground/80">{fallback}</div>}
      {items.map((item, idx) => (
        <div key={`${label}-${idx}`} className="text-sm text-foreground">
          <div className="font-medium line-clamp-1">{item.title || fallback}</div>
          {item.supporting && <div className="text-xs text-muted-foreground">{item.supporting}</div>}
          {item.meta && <div className="text-xs text-muted-foreground/80">{item.meta}</div>}
        </div>
      ))}
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

type HubNotification = {
  id: string
  text: string
  command?: HubVTOPCommand
}

type Persona = {
  name?: string
  registerNumber?: string
  program?: string
  school?: string
  email?: string
  hostelBlock?: string
  room?: string
  mess?: string
}

function deriveNextClassInsight(
  snapshot?: PersonalHubSnapshot | null,
  nowTick?: number
): Insight | null {
  if (!snapshot?.structured_data) return null
  const reference = nowTick ? new Date(nowTick) : new Date()
  const rolling = computeDynamicNextClass(snapshot.structured_data, reference)
  const data: any = snapshot.structured_data
  const fallback =
    rolling?.classInfo ||
    data?.upcomingClass ||
    data?.upcoming ||
    data?.nextClass ||
    data?.next_session ||
    data?.next ||
    (Array.isArray(data?.classes) ? data.classes[0] : null)

  if (!fallback) return null

  const course = fallback.course || fallback.subject || fallback.title || snapshot.title
  const room = fallback.location || fallback.room || fallback.venue
  const timeStamp = rolling?.startsAt
    ? new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(
        rolling.startsAt
      )
    : fallback.startTime || fallback.start || fallback.slot || fallback.time

  const supportingParts = [
    fallback.day,
    rolling?.startsAt ? formatDistanceToNow(rolling.startsAt, { addSuffix: true }) : null,
    room ? `room ${room}` : null,
  ].filter(Boolean)

  return {
    headline: `${course || 'class'} @ ${timeStamp || 'unknown'}`.trim(),
    supporting: supportingParts.length ? supportingParts.join(' · ') : undefined,
    meta: fallback.faculty ? `with ${fallback.faculty}` : undefined,
  }
}

function deriveAssignmentInsight(
  snapshot?: PersonalHubSnapshot | null,
  nowTick?: number
): Insight | null {
  if (!snapshot?.structured_data) return null
  const now = nowTick ? new Date(nowTick) : new Date()
  const subjects = normalizeAssignments(snapshot, now)
  if (!subjects.length) return null
  const upcoming = pickUpcomingAssignment(subjects, now) || subjects[0]
  if (!upcoming) return null
  const absolute = upcoming.dueDate ? formatShortDate(upcoming.dueDate) : upcoming.nextDue
  const relative = upcoming.dueDate ? formatDistanceToNow(upcoming.dueDate, { addSuffix: true }) : undefined

  return {
    headline: upcoming.subject || 'assignment',
    supporting: absolute ? [absolute, relative].filter(Boolean).join(' · ') : undefined,
    meta: upcoming.status,
  }
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

function deriveExamInsight(snapshot?: PersonalHubSnapshot | null, nowTick?: number): Insight | null {
  if (!snapshot?.structured_data) return null
  const now = nowTick ? new Date(nowTick) : new Date()
  const schedule = normalizeExamSchedule(snapshot, now)
  if (!schedule.length) return null
  const upcoming = pickUpcomingExam(schedule, now) || schedule[0]
  if (!upcoming || !upcoming.examDateObj) return null

  const absolute = formatDateWithTime(upcoming.examDateObj)
  const relative = formatDistanceToNow(upcoming.examDateObj, { addSuffix: true })
  const headline = `${upcoming.title || upcoming.course || upcoming.code || 'exam'} on ${formatShortDate(
    upcoming.examDateObj
  )}`

  return {
    headline,
    supporting: [upcoming.examTime, relative].filter(Boolean).join(' · ') || undefined,
    meta: upcoming.venue || upcoming.hall || upcoming.slot,
  }
}

function derivePersona(profileSnapshot?: PersonalHubSnapshot | null, hostelSnapshot?: PersonalHubSnapshot | null): Persona | null {
  const persona: Persona = {}
  const profileData = (profileSnapshot?.structured_data as any)?.persona
  if (profileData) {
    persona.registerNumber = profileData.registerNumber
    persona.program = profileData.program
    persona.email = profileData.email
    persona.school = profileData.school
  }
  const hostelInfo = (hostelSnapshot?.structured_data as any)?.info
  if (hostelInfo) {
    persona.hostelBlock = hostelInfo['hostel name'] || hostelInfo['hostel block']
    persona.room = hostelInfo['room no'] || hostelInfo['room number']
    persona.mess = hostelInfo['mess type'] || hostelInfo['mess']
  }
  if (Object.values(persona).every(value => !value)) {
    return null
  }
  return persona
}

function deriveNotifications(
  {
    attendanceSnapshot,
    assignmentsSnapshot,
    leaveSnapshot,
    examsSnapshot,
    librarySnapshot,
    gradesSnapshot,
  }: {
    attendanceSnapshot?: PersonalHubSnapshot | null
    assignmentsSnapshot?: PersonalHubSnapshot | null
    leaveSnapshot?: PersonalHubSnapshot | null
    examsSnapshot?: PersonalHubSnapshot | null
    librarySnapshot?: PersonalHubSnapshot | null
    gradesSnapshot?: PersonalHubSnapshot | null
  },
  nowTick?: number
): HubNotification[] {
  const notifications: HubNotification[] = []
  const now = nowTick ? new Date(nowTick) : new Date()

  const attendanceStats = (attendanceSnapshot?.structured_data as any)?.stats
  if (attendanceStats?.needsAttention > 0) {
    notifications.push({
      id: 'attendance-risk',
      text: `${attendanceStats.needsAttention} course${attendanceStats.needsAttention === 1 ? '' : 's'} below 75%`,
      command: 'attendance',
    })
  }

  const assignmentList = normalizeAssignments(assignmentsSnapshot, now)
  const upcomingDA = pickUpcomingAssignment(assignmentList, now)
  if (upcomingDA?.subject) {
    const relative = upcomingDA.dueDate ? formatDistanceToNow(upcomingDA.dueDate, { addSuffix: true }) : upcomingDA.nextDue
    notifications.push({
      id: 'da-due',
      text: `${upcomingDA.subject} due ${relative}`,
      command: 'da',
    })
  }

  const pendingLeave = (leaveSnapshot?.structured_data as any)?.pending
  if (pendingLeave?.status && pendingLeave.status.toLowerCase().includes('pending')) {
    notifications.push({
      id: 'leave-pending',
      text: `Leave pending: ${pendingLeave.reason || pendingLeave.status}`,
      command: 'leave',
    })
  }

  const normalizedExams = normalizeExamSchedule(examsSnapshot, now)
  const upcomingExam = pickUpcomingExam(normalizedExams, now)
  if (upcomingExam?.examDateObj) {
    const relative = formatDistanceToNow(upcomingExam.examDateObj, { addSuffix: true })
    notifications.push({
      id: 'exam-soon',
      text: `${upcomingExam.title || upcomingExam.code} ${relative}`,
      command: 'exams',
    })
  }

  const libraryTotal = (librarySnapshot?.structured_data as any)?.total
  if (libraryTotal && libraryTotal > 0) {
    notifications.push({
      id: 'library-dues',
      text: `Library dues: ₹${libraryTotal.toFixed(2)}`,
      command: 'library-dues',
    })
  }

  const gradeRisk = ((gradesSnapshot?.structured_data as any)?.risk || []) as any[]
  if (gradeRisk.length > 0) {
    notifications.push({
      id: 'grade-risk',
      text: `${gradeRisk.length} grade${gradeRisk.length === 1 ? '' : 's'} need attention`,
      command: 'grades',
    })
  }

  return notifications.slice(0, 4)
}

type NormalizedAssignment = {
  subject?: string
  status?: string
  nextDue?: string
  dueDate?: Date | null
  [key: string]: any
}

function normalizeAssignments(snapshot: PersonalHubSnapshot | null | undefined, reference: Date): NormalizedAssignment[] {
  if (!snapshot?.structured_data) return []
  const payload: any = snapshot.structured_data
  const subjects =
    (Array.isArray(payload?.subjects) && payload.subjects) ||
    (Array.isArray(payload?.assignments) && payload.assignments) ||
    (Array.isArray(payload?.items) && payload.items) ||
    []

  return subjects.map((item: any) => {
    const subject = item.subject || item.title || item.course || item.assignment
    const status = item.status || item.state
    const dueLabel = item.nextDue || item.next_due || item.dueDate || item.deadline || item.due
    return {
      ...item,
      subject,
      status,
      nextDue: dueLabel,
      dueDate: parseDateString(dueLabel, reference),
    }
  })
}

function pickUpcomingAssignment(list: NormalizedAssignment[], now: Date): NormalizedAssignment | null {
  const dated = list
    .filter(item => item.dueDate && item.subject)
    .sort((a, b) => (a.dueDate!.getTime() || 0) - (b.dueDate!.getTime() || 0))

  const future = dated.find(item => item.dueDate && item.dueDate >= now)
  return future || dated[0] || null
}

type NormalizedExamEntry = {
  examDateObj?: Date | null
  examDate?: string
  examTime?: string
  session?: string
  title?: string
  code?: string
  course?: string
  venue?: string
  hall?: string
  [key: string]: any
}

function normalizeExamSchedule(
  snapshot: PersonalHubSnapshot | null | undefined,
  reference: Date
): NormalizedExamEntry[] {
  if (!snapshot?.structured_data) return []
  const payload: any = snapshot.structured_data
  const schedule: any[] =
    (Array.isArray(payload?.schedule) && payload.schedule) ||
    (Array.isArray(payload?.exams) && payload.exams) ||
    []

  return schedule.map(entry => {
    const date = parseDateString(entry.examDate || entry.date, reference)
    if (date) {
      const timeParts = parseStartTime(entry.examTime || entry.time || entry.session)
      if (timeParts) {
        date.setHours(timeParts.hour, timeParts.minute ?? 0, 0, 0)
      }
    }
    return {
      ...entry,
      examDateObj: date,
    }
  })
}

function pickUpcomingExam(list: NormalizedExamEntry[], now: Date): NormalizedExamEntry | null {
  const dated = list
    .filter(entry => entry.examDateObj)
    .sort((a, b) => (a.examDateObj!.getTime() || 0) - (b.examDateObj!.getTime() || 0))

  const future = dated.find(entry => entry.examDateObj && entry.examDateObj >= now)
  return future || dated[0] || null
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date)
}

function formatDateWithTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const MONTH_INDEX_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

function parseDateString(value?: string, referenceDate: Date = new Date()): Date | null {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()

  if (lower.includes('today')) {
    return new Date(referenceDate)
  }
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(referenceDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed)
  }

  let match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (match) {
    const day = parseInt(match[1], 10)
    const month = parseInt(match[2], 10) - 1
    const year = parseInt(match[3], 10)
    if (month >= 0 && month < 12) {
      return new Date(year < 100 ? 2000 + year : year, month, day)
    }
  }

  match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{2,4}))?$/)
  if (match) {
    const day = parseInt(match[1], 10)
    const monthKey = match[2].toLowerCase()
    const month = MONTH_INDEX_MAP[monthKey]
    if (month !== undefined) {
      let year = match[3] ? parseInt(match[3], 10) : referenceDate.getFullYear()
      if (year < 100) year += 2000
      const date = new Date(year, month, day)
      if (!match[3] && date < referenceDate) {
        date.setFullYear(date.getFullYear() + 1)
      }
      return date
    }
  }

  return null
}

type NextClassComputation = {
  classInfo: any
  startsAt?: Date
}

const DAY_INDEX_MAP: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
}

const DAY_ALIAS_MAP: Record<string, string> = {
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  weds: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
  sun: 'sunday',
  sunday: 'sunday',
}

function computeDynamicNextClass(
  structuredData: any,
  referenceDate: Date = new Date()
): NextClassComputation | null {
  const candidates = extractTimetableCandidates(structuredData)
  if (!candidates.length) return null

  const now = referenceDate
  const currentDayIndex = (now.getDay() + 6) % 7
  let winner: NextClassComputation | null = null
  let bestDelta = Infinity

  candidates.forEach(candidate => {
    const dayValue = candidate.day || candidate.dayName || candidate.weekday || candidate.Day
    const dayIndex = resolveDayIndex(dayValue)
    if (dayIndex === null) return

    const timeSource =
      candidate.startTime ||
      candidate.start ||
      candidate.start_time ||
      candidate.time ||
      candidate.slotTime ||
      candidate.slot
    const timeParts = parseStartTime(timeSource)
    if (!timeParts) return

    const start = new Date(now)
    start.setHours(timeParts.hour, timeParts.minute ?? 0, 0, 0)

    let diff = dayIndex - currentDayIndex
    if (diff < 0) diff += 7
    if (diff === 0 && start <= now) {
      diff = 7
    }
    start.setDate(start.getDate() + diff)

    const delta = start.getTime() - now.getTime()
    if (delta < bestDelta) {
      bestDelta = delta
      winner = { classInfo: candidate, startsAt: start }
    }
  })

  return winner
}

function extractTimetableCandidates(structuredData: any): any[] {
  if (!structuredData) return []
  const pools = ['classes', 'schedule', 'sessions']
  const result: any[] = []
  const push = (entry: any) => {
    if (entry && typeof entry === 'object') {
      result.push(entry)
    }
  }
  pools.forEach(key => {
    const collection = structuredData[key]
    if (Array.isArray(collection)) {
      collection.forEach(push)
    }
  })
  return result
}

function resolveDayIndex(dayValue?: string): number | null {
  if (!dayValue || typeof dayValue !== 'string') return null
  const normalized = dayValue.trim().toLowerCase().replace(/\./g, '')
  const alias =
    DAY_ALIAS_MAP[normalized] ||
    DAY_ALIAS_MAP[normalized.slice(0, 3)] ||
    normalized
  const index = DAY_INDEX_MAP[alias]
  return typeof index === 'number' ? index : null
}

function parseStartTime(value?: string): { hour: number; minute: number } | null {
  if (!value || typeof value !== 'string') return null
  const lower = value.toLowerCase()
  if (lower.includes('fn') || lower.includes('forenoon')) {
    return { hour: 9, minute: 0 }
  }
  if (lower.includes('an') || lower.includes('afternoon')) {
    return { hour: 13, minute: 30 }
  }
  const primary = value.split(/-|–|—|to/i)[0]?.trim() || ''
  if (!primary) return null
  const sanitized = primary.replace(/(hrs|hours)/gi, '').trim()
  const match = sanitized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (match) {
    let hour = parseInt(match[1], 10)
    const minute = match[2] ? parseInt(match[2], 10) : 0
    const suffix = match[3]?.toLowerCase()
    if (suffix === 'pm' && hour < 12) hour += 12
    if (suffix === 'am' && hour === 12) hour = 0
    if (hour >= 24 || minute >= 60) return null
    return { hour, minute }
  }

  const digitsOnly = sanitized.replace(/\D/g, '')
  if (digitsOnly.length === 4) {
    const hour = parseInt(digitsOnly.slice(0, 2), 10)
    const minute = parseInt(digitsOnly.slice(2), 10)
    if (hour >= 24 || minute >= 60) return null
    return { hour, minute }
  }

  return null
}

function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
