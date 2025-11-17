'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
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
import { DailyBriefingOverlay } from './daily-briefing-overlay'
import { MinimalStatusCard } from './minimal-status-card'
import { HUB_COMMANDS } from '@/types/hub'
import type { PersonalHubSnapshot, HubVTOPCommand, VTOPCredentialPayload } from '@/types/hub'
import type { HubActionHandlers } from './hub'
import { listHubCapabilities, type HubCapability } from '@/lib/hub/capabilities'
import {
  hasVTOPCredentials as clientHasVTOPCredentials,
  getFormattedVTOPCredentials as clientGetFormattedVTOPCredentials,
} from '@/lib/vtop-credentials'
import { useHubStore, type HubPage, type DailyHydrationState } from './hub-store'
import { shallow } from 'zustand/shallow'
import {
  DailyBriefingMessage,
  DailyBriefingAction,
  ExamPrompt,
  Persona,
  NextClassComputation,
  buildDailyBriefingContext,
  deriveNextClassInsight,
  deriveAssignmentInsight,
  deriveAttendanceInsight,
  deriveLeaveInsight,
  deriveExamInsight,
  derivePersona,
  deriveNotifications,
  normalizeAssignments,
  buildGreeting,
  deriveTerseName,
  computeDynamicNextClass,
  formatLocalDateKey,
  parsePreferenceTime,
  formatPreferenceTimeLabel,
  formatShortDate,
} from '@/lib/hub/daily-briefing'
import { toast } from 'sonner'
import { HUB_BRIEFING_ACTION_EVENT } from '@/lib/hub/constants'

const PINNED_COMMANDS: HubVTOPCommand[] = ['timetable', 'attendance', 'marks', 'cgpa', 'profile']
const SNAPSHOT_ICONS: Partial<Record<HubVTOPCommand, ReactNode>> = {
  attendance: <ClipboardCheck className="h-4 w-4" />,
  timetable: <CalendarClock className="h-4 w-4" />,
  marks: <Award className="h-4 w-4" />,
  cgpa: <Award className="h-4 w-4" />,
}
const SYNC_SEQUENCE: HubVTOPCommand[] = ['profile', 'attendance', 'timetable', 'marks', 'cgpa', 'exams', 'da']
const DAILY_BRIEFING_COMMANDS: HubVTOPCommand[] = Array.from(
  new Set<HubVTOPCommand>([
    ...SYNC_SEQUENCE,
    'da',
    'library-dues',
    'leave',
    'hostel',
    'grades',
    'msg',
  ])
)
const DAILY_BRIEFING_STORAGE_KEY = 'ea.hub.daily-briefing-date'
const DAILY_REVEAL_DELAY_MS = 2000
const HUB_SURFACE_CLASS =
  'rounded-3xl sm:rounded-[32px] border border-white/10 bg-[rgba(7,8,18,0.78)] backdrop-blur-xl shadow-[0_15px_50px_rgba(0,0,0,0.45)] sm:shadow-[0_25px_80px_rgba(0,0,0,0.55)]'
const HUB_LABEL_CLASS =
  'text-[10px] uppercase tracking-[0.2em] text-white/60 sm:text-[11px] sm:tracking-[0.3em]'

type Page = HubPage

const NAV_ITEMS: { id: Page; label: string; icon: ReactNode }[] = [
  { id: 'briefing', label: 'hub', icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'vtop', label: 'vtop', icon: <GraduationCap className="h-3.5 w-3.5" /> },
  { id: 'papers', label: 'past papers', icon: <FileSearch className="h-3.5 w-3.5" /> },
  { id: 'mess', label: 'mess menu', icon: <UtensilsCrossed className="h-3.5 w-3.5" /> },
  { id: 'placements', label: 'placements', icon: <Briefcase className="h-3.5 w-3.5" /> },
  { id: 'faculty', label: 'faculty', icon: <Users className="h-3.5 w-3.5" /> },
  { id: 'reddit', label: 'reddit', icon: <Flame className="h-3.5 w-3.5" /> },
  { id: 'syllabi', label: 'syllabi', icon: <FileSearch className="h-3.5 w-3.5" /> },
]

type HubShellProps = {
  actions: HubActionHandlers
  syncing?: boolean
  onLink?: () => void
  preferences?: Record<string, any>
  visible?: boolean
}

type DailyExamAction = 'syllabus' | 'papers' | 'materials' | 'skip'

export default function HubShell({
  actions,
  syncing: externalSyncing = false,
  onLink,
  preferences,
  visible = true,
}: HubShellProps) {
  const store = useHubStore(state => state, shallow)
  const {
    page,
    hubState,
    viewerOpen,
    viewerTitle,
    viewerData,
    viewerMode,
    viewerLoading,
    syncing,
    syncCommand,
    capabilityLoading,
    dailyBriefingActive,
    dailyBriefingTriggered,
    dailyBriefingReady,
    dailyGreeting,
    dailyMessages,
    dailyMessagesPrepared,
    dailyRevealedCount,
    dailyExamPrompt,
    dailyBriefingActions,
    hydrationCurrentCommand,
    dailyHydration,
    hydrationQueue,
    overlayMode,
    unlinkedOverlayDismissed,
    sendingBriefingEmail,
    setState,
    setHubState,
  } = store
  const emailSentRef = useRef(false)
  const emailPlanRef = useRef<string | null>(null)
  const pendingBriefingResetRef = useRef(false)
  const manualBriefingRef = useRef(false)
  const capabilities = useMemo(() => listHubCapabilities(), [])
  const nowTick = useNow(60000)
  const snapshotMap = useMemo(() => {
    const map = new Map<HubVTOPCommand, PersonalHubSnapshot>()
    hubState.snapshots.forEach(snapshot => {
      const cmd = snapshot.command as HubVTOPCommand
      map.set(cmd, snapshot)
    })
    return map
  }, [hubState.snapshots])

  const needsHydration = useCallback(
    (command: HubVTOPCommand) => !snapshotMap.has(command),
    [snapshotMap]
  )
  const briefingPrefs = useMemo(() => {
    const base = preferences?.dailyBriefing || {}
    return {
      dismissTime: base.dismissTime || '07:30',
      emailEnabled: base.emailEnabled ?? false,
      emailTime: base.emailTime || base.dismissTime || '07:30',
    }
  }, [preferences])

  useEffect(() => {
    setState({ syncing: externalSyncing })
  }, [externalSyncing, setState])

  useEffect(() => {
    if (dailyBriefingActive) {
      emailSentRef.current = false
      emailPlanRef.current = null
      setState({ hydrationCurrentCommand: null })
    }
  }, [dailyBriefingActive, setState])

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
        setState({ page: next })
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (hubState.isLinked) return
    if (clientHasVTOPCredentials()) {
      setHubState(prev => ({ ...prev, isLinked: true }))
    }
  }, [hubState.isLinked, setHubState])

  const runVtopCommand = useCallback(
    async (command: HubVTOPCommand, extras?: Record<string, any>) => {
      let credentials: VTOPCredentialPayload | undefined
      try {
        const formatted = clientGetFormattedVTOPCredentials()
        if (formatted) {
          credentials = formatted
        }
      } catch (error) {
        console.warn('[hub] failed to read cached VTOP credentials', error)
      }
      const snapshot = await actions.refreshVTOP(command, extras, credentials)
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

  const handleRefreshState = useCallback(async () => {
    setState({ syncing: true })
    try {
      const next = await actions.refreshState()
      setHubState(next)
    } finally {
      setState({ syncing: false })
    }
  }, [actions, setHubState, setState])

  const persistDailyBriefingSeen = useCallback(() => {
    if (typeof window === 'undefined') return
    const reference = nowTick ? new Date(nowTick) : new Date()
    try {
      window.localStorage.setItem(DAILY_BRIEFING_STORAGE_KEY, formatLocalDateKey(reference))
      window.dispatchEvent(
        new CustomEvent('ea.dailyBriefingSeen', {
          detail: { date: formatLocalDateKey(reference) },
        })
      )
    } catch (error) {
      console.warn('[hub] failed to persist briefing seen flag', error)
    }
  }, [nowTick])

  const dismissDailyBriefing = useCallback(
    (options?: { persist?: boolean }) => {
      manualBriefingRef.current = false
      setState(current => ({
        dailyBriefingActive: false,
        overlayMode: null,
        unlinkedOverlayDismissed:
          current.overlayMode === 'onboarding'
            ? true
            : current.unlinkedOverlayDismissed,
      }))
      if (options?.persist ?? overlayMode === 'briefing') {
        persistDailyBriefingSeen()
      }
    },
    [overlayMode, persistDailyBriefingSeen, setState]
  )

  const handleLinkIntent = useCallback(() => {
    dismissDailyBriefing({ persist: false })
    onLink?.()
  }, [dismissDailyBriefing, onLink])

  const handleSync = useCallback(async () => {
    if (!linked) {
      handleLinkIntent()
      setState({ page: 'briefing' })
      return
    }

    setState({ syncing: true, syncCommand: null })
    try {
      const nextState = await actions.syncCore()
      setHubState(nextState)
    } catch (error) {
      console.error('[hub] failed to run sync batch', error)
    } finally {
      setState({ syncCommand: null, syncing: false })
    }
  }, [actions, linked, handleLinkIntent, setHubState, setState])

  const handleExamAction = useCallback(
    (action: DailyExamAction) => {
      switch (action) {
        case 'syllabus':
          setState({ page: 'syllabi' })
          break
        case 'papers':
          setState({ page: 'papers' })
          break
        case 'materials':
          setState({ page: 'vtop' })
          break
        default:
          break
      }
      dismissDailyBriefing()
    },
    [dismissDailyBriefing]
  )

  const openSnapshot = useCallback(
    (snapshot: PersonalHubSnapshot) => {
      setState({
        viewerTitle: snapshot.title || snapshot.command,
        viewerData: snapshot,
        viewerMode: 'static',
        viewerLoading: false,
        viewerOpen: true,
      })
    },
    [setState]
  )

  const handleBriefingAction = useCallback(
    async (command: HubVTOPCommand) => {
      if (!linked) {
        handleLinkIntent()
        return
      }
      dismissDailyBriefing()
      try {
        const snapshot = await runVtopCommand(command)
        openSnapshot(snapshot)
      } catch (error) {
        console.error('[hub] failed to execute briefing action', command, error)
        if (isCredentialError(error)) {
          handleLinkIntent()
        }
      }
    },
    [dismissDailyBriefing, handleLinkIntent, linked, runVtopCommand, openSnapshot]
  )

  useEffect(() => {
    const handleExternalBriefingAction = (event: Event) => {
      const detail = (event as CustomEvent<{ command?: string }>).detail
      if (!detail?.command) return
      const inbound = detail.command as HubVTOPCommand
      if (!HUB_COMMANDS.includes(inbound)) return
      handleBriefingAction(inbound)
    }
    window.addEventListener(
      HUB_BRIEFING_ACTION_EVENT,
      handleExternalBriefingAction as EventListener
    )
    return () =>
      window.removeEventListener(
        HUB_BRIEFING_ACTION_EVENT,
        handleExternalBriefingAction as EventListener
      )
  }, [handleBriefingAction])

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
  const terseName = useMemo(() => deriveTerseName(profileSnapshot), [profileSnapshot])

  type BriefingEmailPayload = {
    greeting: string
    messages: DailyBriefingMessage[]
    actions: DailyBriefingAction[]
  }

  type BriefingEmailRequest = BriefingEmailPayload & {
    scheduledAt?: string
  }

  const buildEmailPayload = useCallback((): BriefingEmailPayload => {
    const reference = nowTick ? new Date(nowTick) : new Date()
    if (dailyMessages.length) {
      return {
        greeting: dailyGreeting || buildGreeting(reference, terseName),
        messages: dailyMessages,
        actions: dailyBriefingActions,
      }
    }
    const fallback = buildDailyBriefingContext(hubState.snapshots, reference)
    return {
      greeting: dailyGreeting || buildGreeting(reference, terseName),
      messages: fallback.messages,
      actions: fallback.actions,
    }
  }, [dailyMessages, dailyBriefingActions, dailyGreeting, hubState.snapshots, nowTick, terseName])

  const sendBriefingEmail = useCallback(
    async ({
      force = false,
      silent = false,
      scheduledAt,
    }: {
      force?: boolean
      silent?: boolean
      scheduledAt?: string | Date
    } = {}) => {
      const scheduleToken =
        scheduledAt instanceof Date
          ? scheduledAt.toISOString()
          : typeof scheduledAt === 'string' && scheduledAt.trim().length
          ? scheduledAt
          : undefined

      if (scheduleToken && emailPlanRef.current === scheduleToken && !force) {
        if (!silent) toast.message('briefing email already scheduled')
        return false
      }

      if (emailSentRef.current && !force && !scheduleToken) {
        if (!silent) toast.message('briefing already sent')
        return false
      }

      const emailPayload = buildEmailPayload()
      if (!emailPayload.messages.length) {
        if (!silent) toast.error('briefing not ready — wait for sync to finish')
        return false
      }

      const payload: BriefingEmailRequest = scheduleToken
        ? { ...emailPayload, scheduledAt: scheduleToken }
        : emailPayload

      try {
        const response: Response = await fetch('/api/hub/daily-briefing-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
        const responseBody = await response
          .json()
          .catch(() => ({ error: `status ${response.status}` }))
        if (!response.ok) {
          throw new Error(responseBody?.error || `status ${response.status}`)
        }
        if (scheduleToken) {
          emailPlanRef.current = scheduleToken
          emailSentRef.current = true
        } else {
          emailSentRef.current = true
          emailPlanRef.current = null
        }
        if (!silent) toast.success('briefing emailed to your inbox')
        return true
      } catch (error) {
        console.error('[hub/daily-briefing] email dispatch failed', error)
        if (!silent) toast.error('failed to send briefing email')
        return false
      }
    },
    [buildEmailPayload]
  )

  const handleSendEmailNow = useCallback(async () => {
    if (sendingBriefingEmail) return
    setState({ sendingBriefingEmail: true })
    try {
      await sendBriefingEmail({ force: true })
    } finally {
      setState({ sendingBriefingEmail: false })
    }
  }, [sendBriefingEmail, sendingBriefingEmail, setState])

  const launchDailyBriefing = useCallback(
    (options?: { force?: boolean }) => {
      if (!linked) return
      if (typeof window === 'undefined') return
      const reference = nowTick ? new Date(nowTick) : new Date()
      const todayKey = formatLocalDateKey(reference)
      const lastSeen = window.localStorage.getItem(DAILY_BRIEFING_STORAGE_KEY)
      const alreadySeen = lastSeen === todayKey
      manualBriefingRef.current = Boolean(options?.force)
      if (!options?.force && alreadySeen) {
        if (!dailyBriefingTriggered) {
          setState({ dailyBriefingTriggered: true })
        }
        return
      }
      if (!options?.force && dailyBriefingTriggered && alreadySeen) {
        return
      }
      try {
        window.localStorage.removeItem(DAILY_BRIEFING_STORAGE_KEY)
      } catch (error) {
        console.warn('[hub] failed to reset briefing storage', error)
      }
      const queue = DAILY_BRIEFING_COMMANDS.filter(cmd => needsHydration(cmd))
      setState({
        dailyGreeting: buildGreeting(reference, terseName),
        dailyBriefingTriggered: true,
        dailyBriefingActive: true,
        dailyBriefingReady: false,
        dailyMessagesPrepared: false,
        dailyMessages: [],
        dailyExamPrompt: null,
        dailyBriefingActions: [],
        dailyRevealedCount: 0,
        hydrationQueue: queue,
        dailyHydration: { running: queue.length > 0, completed: 0, total: queue.length },
        page: 'briefing',
        overlayMode: 'briefing',
      })
    },
    [linked, dailyBriefingTriggered, nowTick, terseName, snapshotMap, needsHydration, setState]
  )

  const forceDailyBriefing = useCallback(() => {
    setState({ dailyBriefingTriggered: false })
    launchDailyBriefing({ force: true })
  }, [launchDailyBriefing, setState])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reference = nowTick ? new Date(nowTick) : new Date()
    const todayKey = formatLocalDateKey(reference)
    const lastSeen = window.localStorage.getItem(DAILY_BRIEFING_STORAGE_KEY)
    if (lastSeen !== todayKey && dailyBriefingTriggered) {
      setState({ dailyBriefingTriggered: false })
    }
  }, [nowTick, dailyBriefingTriggered, setState])

  useEffect(() => {
    if (!visible) return
    if (pendingBriefingResetRef.current) {
      pendingBriefingResetRef.current = false
      forceDailyBriefing()
      return
    }
    launchDailyBriefing()
  }, [visible, launchDailyBriefing, forceDailyBriefing])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleReset = () => {
      if (!visible) {
        pendingBriefingResetRef.current = true
        setState({ dailyBriefingTriggered: false })
        return
      }
      forceDailyBriefing()
    }
    window.addEventListener('ea.dailyBriefingReset', handleReset as EventListener)
    return () => window.removeEventListener('ea.dailyBriefingReset', handleReset as EventListener)
  }, [forceDailyBriefing, visible, setState])

  useEffect(() => {
    if (linked) {
      if (overlayMode === 'onboarding' && dailyBriefingActive) {
        setState({ dailyBriefingActive: false, overlayMode: null })
      }
      if (unlinkedOverlayDismissed) {
        setState({ unlinkedOverlayDismissed: false })
      }
      return
    }
    if (overlayMode === 'briefing' || dailyBriefingActive || unlinkedOverlayDismissed) return
    const reference = nowTick ? new Date(nowTick) : new Date()
    const greeting = buildGreeting(reference, deriveTerseName(profileSnapshot))
    setState({
      dailyGreeting: greeting,
      dailyMessages: [
        {
          id: 'link-vtop',
          primary: 'link VTOP to let us pull your briefing.',
          supporting: 'we will pull attendance, timetable, assignments, and exam snapshots in seconds.',
        },
      ],
      dailyMessagesPrepared: true,
      dailyBriefingReady: true,
      dailyExamPrompt: null,
      dailyBriefingActions: [],
      dailyRevealedCount: 1,
      dailyHydration: { running: false, completed: 0, total: 1 },
      dailyBriefingActive: true,
      overlayMode: 'onboarding',
    })
  }, [
    linked,
    overlayMode,
    dailyBriefingActive,
    unlinkedOverlayDismissed,
    nowTick,
    profileSnapshot,
    setState,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleLinked = () => {
      try {
        window.localStorage.removeItem(DAILY_BRIEFING_STORAGE_KEY)
      } catch (error) {
        console.warn('[hub] failed to reset daily briefing storage', error)
      }
      setState({ dailyBriefingTriggered: false })
      if (!visible) {
        pendingBriefingResetRef.current = true
      } else {
        launchDailyBriefing({ force: true })
      }
      handleRefreshState()
    }
    window.addEventListener('vtopCredentialsLinked', handleLinked as EventListener)
    return () => window.removeEventListener('vtopCredentialsLinked', handleLinked as EventListener)
  }, [handleRefreshState, launchDailyBriefing, setState, visible])

  useEffect(() => {
    if (!dailyBriefingActive || !linked || overlayMode !== 'briefing') return
    if (!hydrationQueue.length) {
      setState({ dailyBriefingReady: true })
      return
    }
    let cancelled = false
    setState({ dailyHydration: { running: true, completed: 0, total: hydrationQueue.length } })
    setState({ hydrationCurrentCommand: null })
    ;(async () => {
      for (let idx = 0; idx < hydrationQueue.length; idx++) {
        if (cancelled) break
        const command = hydrationQueue[idx]
        setState({ hydrationCurrentCommand: command })
        try {
          await runVtopCommand(command)
        } catch (error) {
          console.error('[hub/daily-briefing] auto hydration failed', command, error)
          if (isCredentialError(error)) {
            console.warn('[hub/daily-briefing] credentials required, prompting relink')
            cancelled = true
            handleLinkIntent()
            break
          }
        }
        if (cancelled) break
        setState(state => ({
          dailyHydration: { ...state.dailyHydration, completed: idx + 1 },
        }))
      }
      if (!cancelled) {
        setState(state => ({
          dailyHydration: { ...state.dailyHydration, running: false, completed: state.dailyHydration.total },
          hydrationCurrentCommand: null,
          dailyBriefingReady: true,
        }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    dailyBriefingActive,
    linked,
    overlayMode,
    hydrationQueue,
    runVtopCommand,
    handleLinkIntent,
    setState,
  ])

  useEffect(() => {
    if (!dailyBriefingActive || overlayMode !== 'briefing' || !dailyBriefingReady || dailyMessagesPrepared) return
    const reference = nowTick ? new Date(nowTick) : new Date()
    const context = buildDailyBriefingContext(hubState.snapshots, reference)
    setState({
      dailyMessages: context.messages,
      dailyExamPrompt: context.examPrompt || null,
      dailyBriefingActions: context.actions,
      dailyMessagesPrepared: true,
      dailyRevealedCount: 0,
    })
  }, [
    dailyBriefingActive,
    overlayMode,
    dailyBriefingReady,
    dailyMessagesPrepared,
    hubState.snapshots,
    nowTick,
    setState,
  ])

  useEffect(() => {
    if (!dailyBriefingActive || overlayMode !== 'briefing' || !dailyMessagesPrepared) return
    if (!dailyMessages.length) return
    if (dailyRevealedCount >= dailyMessages.length) return
    const timeout = window.setTimeout(() => {
      setState(current => ({
        dailyRevealedCount: Math.min(current.dailyRevealedCount + 1, dailyMessages.length),
      }))
    }, dailyRevealedCount === 0 ? DAILY_REVEAL_DELAY_MS : 1600)
    return () => window.clearTimeout(timeout)
  }, [dailyBriefingActive, overlayMode, dailyMessagesPrepared, dailyMessages.length, dailyRevealedCount])

  useEffect(() => {
    if (!dailyBriefingActive || overlayMode !== 'briefing') return
    const dismissTime = briefingPrefs.dismissTime
    if (!dismissTime) return
    const reference = nowTick ? new Date(nowTick) : new Date()
    const target = parsePreferenceTime(dismissTime, reference)
    if (!target) return
    const diff = target.getTime() - reference.getTime()
    if (diff <= 0) {
      if (manualBriefingRef.current) {
        return
      }
      dismissDailyBriefing()
      return
    }
    const timeout = window.setTimeout(() => dismissDailyBriefing(), diff)
    return () => window.clearTimeout(timeout)
  }, [
    dailyBriefingActive,
    overlayMode,
    briefingPrefs.dismissTime,
    nowTick,
    dismissDailyBriefing,
  ])

  useEffect(() => {
    if (!dailyBriefingActive || overlayMode !== 'briefing') return
    if (!briefingPrefs.emailEnabled) return
    const payload = buildEmailPayload()
    if (!payload.messages.length) return
    const timeValue = briefingPrefs.emailTime || briefingPrefs.dismissTime
    if (!timeValue) return
    const reference = nowTick ? new Date(nowTick) : new Date()
    const target = parsePreferenceTime(timeValue, reference)
    if (!target) return
    if (target.getTime() <= reference.getTime()) {
      void sendBriefingEmail({ silent: true })
      return
    }
    const iso = target.toISOString()
    if (emailPlanRef.current === iso) return
    void sendBriefingEmail({ silent: true, scheduledAt: iso })
  }, [
    dailyBriefingActive,
    overlayMode,
    briefingPrefs.emailEnabled,
    briefingPrefs.emailTime,
    briefingPrefs.dismissTime,
    buildEmailPayload,
    sendBriefingEmail,
    nowTick,
  ])

  

  const Panel = useMemo(() => {
    switch (page) {
      case 'vtop':
        return (
            <VTOPPanel
              linked={linked}
              runCommand={runVtopCommand}
              onRequireLink={() => setState({ page: 'briefing' })}
              onLink={handleLinkIntent}
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
        handleLinkIntent()
        return
      }
      setState({ capabilityLoading: capability.command })
      try {
        const snapshot = await runVtopCommand(capability.command)
        openSnapshot(snapshot)
      } catch (error) {
        console.error('[hub] failed to execute capability', capability.command, error)
        if (isCredentialError(error)) {
          handleLinkIntent()
        }
      } finally {
        setState({ capabilityLoading: null })
      }
    },
    [linked, handleLinkIntent, runVtopCommand, openSnapshot, setState]
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
  const emailSummaryLabel = briefingPrefs.emailEnabled
    ? `email briefing scheduled ${formatPreferenceTimeLabel(
        briefingPrefs.emailTime || briefingPrefs.dismissTime
      )}`
    : undefined

  const handleAdvanceBriefing = useCallback(() => {
    setState(state => {
      if (!state.dailyMessagesPrepared) return {}
      const total = state.dailyMessages.length
      if (!total) return {}
      const next = Math.min(total, state.dailyRevealedCount + 1)
      if (next === state.dailyRevealedCount) return {}
      return { dailyRevealedCount: next }
    })
  }, [setState])

  const renderBriefing = () => (
    <div className="space-y-5 text-white">
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
          linked={linked}
          onLink={onLink}
          emailEnabled={briefingPrefs.emailEnabled}
          emailLabel={emailSummaryLabel}
          onSendEmail={briefingPrefs.emailEnabled ? handleSendEmailNow : undefined}
          sendingEmail={sendingBriefingEmail}
        />
      ) : (
        <HubOnboarding onLink={handleLinkIntent} />
      )}

      {persona && linked && <PersonaStrip persona={persona} onLink={handleLinkIntent} />}

      {linked && (
        <div className="flex justify-start sm:justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              forceDailyBriefing()
            }}
          >
            rerun daily briefing
          </Button>
        </div>
      )}

      {linked && (
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          {timetableSnapshot && (
            <TimetablePeek snapshot={timetableSnapshot} now={nowTick} onOpen={() => openSnapshot(timetableSnapshot)} />
          )}
          {(attendanceRisks.length > 0 || assignmentSubjects.length > 0) && (
            <HubSurface className="space-y-4">
              <div className={HUB_LABEL_CLASS}>focus zones</div>
              <div className="space-y-4">
                {attendanceRisks.length > 0 && (
                  <MiniListCard
                    label="attendance"
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
                    label="assignments"
                    items={assignmentSubjects.map(item => ({
                      title: item.subject,
                      meta: item.displayDue || item.nextDue,
                      supporting: item.status,
                    }))}
                    fallback="no assignments found"
                    onOpen={() => assignmentsSnapshot && openSnapshot(assignmentsSnapshot)}
                  />
                )}
              </div>
            </HubSurface>
          )}
        </div>
      )}

      {linked && notifications.length > 0 && (
        <NotificationStrip notifications={notifications} capabilities={capabilities} onRun={handleCapabilityRun} />
      )}

      {linked && (
        <HubSurface className="divide-y divide-white/5 p-0">
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
        </HubSurface>
      )}

      {linked && latestSnapshots.length > 0 && (
        <div className="space-y-3">
          <div className={HUB_LABEL_CLASS}>latest pulls</div>
          <div className="space-y-2">
            {latestSnapshots.map(snapshot => (
              <SnapshotGlance key={snapshot.command} snapshot={snapshot} onOpen={openSnapshot} minimal />
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <HubToolProvider value={toolExecutor}>
      <div className="h-full relative overflow-hidden bg-[#05060c] text-foreground">
        <div className="pointer-events-none absolute inset-0 opacity-[0.8]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_60%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,12,0.85),rgba(3,4,8,0.92))]" />
        </div>
        <div className="relative h-full flex flex-col">
          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6" data-allow-touch-scroll>
            <div className="max-w-5xl w-full mx-auto space-y-5">
              {page === 'briefing' ? renderBriefing() : <HubSurface>{Panel}</HubSurface>}
            </div>
          </div>
          <div
            className="relative border-t border-white/10 px-2 sm:px-4 py-2 sm:py-3 bg-[#05060c]/90 backdrop-blur supports-[backdrop-filter]:backdrop-blur-lg"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
          >
            <div className="max-w-5xl w-full mx-auto">
              <div
                className="flex flex-nowrap md:flex-wrap justify-start md:justify-center items-center gap-1.5 overflow-x-auto md:overflow-visible scrollbar-hide touch-pan-x"
                data-allow-touch-scroll
                role="tablist"
                aria-label="hub navigation"
              >
                {NAV_ITEMS.filter(item => linked || item.id === 'briefing').map(item => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-pressed={page === item.id}
                    aria-selected={page === item.id}
                    onClick={() => setState({ page: item.id })}
                    className={`flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] sm:px-3.5 sm:text-[11px] sm:tracking-[0.25em] transition-all border ${
                      page === item.id
                        ? 'bg-white/15 border-white/40 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)]'
                        : 'bg-transparent border-white/15 text-white/60 hover:text-white hover:border-white/35'
                    }`}
                    disabled={!linked && item.id !== 'briefing'}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {dailyBriefingActive && (
          <DailyBriefingOverlay
            mode={overlayMode || (linked ? 'briefing' : 'onboarding')}
            greeting={dailyGreeting || buildGreeting(nowTick ? new Date(nowTick) : new Date(), terseName)}
            messages={dailyMessages}
            revealedCount={dailyRevealedCount}
            hydration={dailyHydration}
            hydrationCommand={hydrationCurrentCommand}
            messagesReady={dailyMessagesPrepared}
            onDismiss={() => dismissDailyBriefing()}
            onLinkRequest={handleLinkIntent}
            actions={dailyBriefingActions}
            onAction={handleBriefingAction}
            emailScheduleLabel={
              briefingPrefs.emailEnabled
                ? `emailing summary at ${formatPreferenceTimeLabel(
                    briefingPrefs.emailTime || briefingPrefs.dismissTime
                  )}`
                : undefined
            }
            emailEnabled={briefingPrefs.emailEnabled}
            onEmailNow={briefingPrefs.emailEnabled ? handleSendEmailNow : undefined}
            sendingEmail={sendingBriefingEmail}
            examPrompt={dailyExamPrompt}
            onExamAction={handleExamAction}
            onAdvance={handleAdvanceBriefing}
            onContinue={() => dismissDailyBriefing()}
          />
        )}

        <ResultBottomSheet
          open={viewerOpen}
          title={viewerTitle}
          result={viewerData}
          loading={viewerLoading}
          mode={viewerMode}
          onClose={() => setState({ viewerOpen: false })}
        />
      </div>
    </HubToolProvider>
  )
}

function HubSurface({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${HUB_SURFACE_CLASS} p-4 sm:p-6 ${className}`}>{children}</div>
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
        <p className={HUB_LABEL_CLASS}>{label}</p>
        {onOpen && (
          <button onClick={onOpen} className="text-[11px] text-white/70 hover:text-white">
            view
          </button>
        )}
      </div>
      <div className="text-lg font-medium text-white leading-tight">{headline}</div>
      {supporting && <div className="text-sm text-white/70">{supporting}</div>}
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>{meta || ''}</span>
        {onAction && actionLabel && (
          <button
            onClick={onAction}
            disabled={disabled}
            className="text-[10px] uppercase tracking-[0.3em] text-white/70 hover:text-white disabled:opacity-60"
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
    <HubSurface className="flex flex-wrap gap-2">
      <div className={`${HUB_LABEL_CLASS} w-full`}>alerts</div>
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
            className={`rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 hover:text-white hover:border-white/40 transition-colors ${
              !clickable ? 'opacity-60 cursor-default' : ''
            }`}
          >
            {notification.text}
          </button>
        )
      })}
    </HubSurface>
  )
}

function PersonaStrip({ persona, onLink }: { persona: Persona; onLink?: () => void }) {
  return (
    <HubSurface className="flex flex-wrap gap-3 text-xs text-white/70">
      {persona.registerNumber && <span>{persona.registerNumber}</span>}
      {persona.program && <span>{persona.program}</span>}
      {persona.school && <span>{persona.school}</span>}
      {persona.hostelBlock && <span>{persona.hostelBlock}</span>}
      {persona.room && <span>Room {persona.room}</span>}
      {persona.mess && <span>Mess: {persona.mess}</span>}
      {!persona.hostelBlock && onLink && (
        <button className="text-white hover:text-white/80" onClick={onLink}>
          link hostel data
        </button>
      )}
    </HubSurface>
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
  const rolling: NextClassComputation = computeDynamicNextClass(data, reference)
  const highlight = rolling?.classInfo || data?.nextClass || classes[0]
  const rows = classes.slice(0, 4)

  const formatTime = (cls: any) => {
    if (cls?.startTime && cls?.endTime) return `${cls.startTime} – ${cls.endTime}`
    if (cls?.startTime) return cls.startTime
    if (cls?.slot) return cls.slot
    return '—'
  }

  return (
    <HubSurface className="space-y-4">
      <div className="flex items-center justify-between">
        <span className={HUB_LABEL_CLASS}>coverage map</span>
        {onOpen && (
          <button className="text-white/70 hover:text-white" onClick={onOpen}>
            open timetable
          </button>
        )}
      </div>
      {highlight && (
        <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-white/90">
          <div className={`${HUB_LABEL_CLASS} text-white/70`}>next</div>
          <div className="text-lg font-medium text-white">{highlight.subject || highlight.slot || 'class'}</div>
          <div className="text-xs text-white/70">
            {rolling?.startsAt
              ? new Intl.DateTimeFormat(undefined, {
                  weekday: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(rolling.startsAt)
              : formatTime(highlight)}
          </div>
          <div className="text-[11px] text-white/60">
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
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((cls, idx) => (
          <div key={`${cls.day}-${cls.slot}-${idx}`} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <div className={HUB_LABEL_CLASS}>{cls.day || 'day'}</div>
            <div className="text-sm font-medium text-white line-clamp-1">
              {cls.subject || cls.slot || 'class'}
            </div>
            <div className="text-xs text-white/70">{formatTime(cls)}</div>
            {cls.venue && <div className="text-[11px] text-white/60">{cls.venue}</div>}
          </div>
        ))}
      </div>
    </HubSurface>
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className={HUB_LABEL_CLASS}>{label}</span>
        {onOpen && (
          <button className="text-white/70 hover:text-white" onClick={onOpen}>
            open
          </button>
        )}
      </div>
      {items.length === 0 && <div className="text-sm text-white/60">{fallback}</div>}
      {items.map((item, idx) => (
        <div key={`${label}-${idx}`} className="text-sm text-white">
          <div className="font-medium line-clamp-1">{item.title || fallback}</div>
          {item.supporting && <div className="text-xs text-white/70">{item.supporting}</div>}
          {item.meta && <div className="text-xs text-white/60">{item.meta}</div>}
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
    <HubSurface className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-white/70">
        {icon && <span className="text-white/80">{icon}</span>}
        <span className="uppercase tracking-[0.25em]">{snapshot.title}</span>
      </div>
      <p className="text-sm text-white line-clamp-2">{summary}</p>
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>updated {updatedLabel}</span>
        <button onClick={() => onOpen(snapshot)} className="text-white/80 hover:text-white">
          open
        </button>
      </div>
    </HubSurface>
  )
}

function HubOnboarding({ onLink }: { onLink?: () => void }) {
  return (
    <HubSurface className="space-y-4 text-white">
      <div className={HUB_LABEL_CLASS}>hub requires VTOP linking</div>
      <p className="text-2xl font-light">
        connect once to pull timetable, assignments, attendance, leave status and exams without leaving chat.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => onLink?.()} className="rounded-full px-6">
          <span>link VTOP</span>
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
        <div className="flex items-center gap-2 text-sm text-white/70">
          <LockKeyhole className="h-4 w-4" />
          credentials stay on-device
        </div>
      </div>
    </HubSurface>
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

function isCredentialError(error: any) {
  if (!error) return false
  const message =
    (typeof error === 'string' && error) ||
    (typeof error?.message === 'string' && error.message) ||
    (typeof error?.cause === 'string' && error.cause)
  if (!message) return false
  const lower = message.toLowerCase()
  return lower.includes('credential') || lower.includes('login')
}

function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
