'use client'

import { memo, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DailyBriefingMessage, DailyBriefingAction, ExamPrompt } from '@/lib/hub/daily-briefing'
import { Button } from '@/components/ui/button'
import type { HubVTOPCommand } from '@/types/hub'

const BRIEFING_STAGES = [
  { id: 'sync', label: 'sync', caption: 'pulling snapshots' },
  { id: 'prep', label: 'prepare', caption: 'shaping insights' },
  { id: 'briefing', label: 'briefing', caption: 'ready to review' },
] as const

type BriefingStage = (typeof BRIEFING_STAGES)[number]['id'] | 'onboarding'

export type DailyBriefingOverlayProps = {
  mode?: 'briefing' | 'onboarding'
  greeting: string
  messages: DailyBriefingMessage[]
  revealedCount: number
  hydration: { running: boolean; completed: number; total: number }
  hydrationCommand?: HubVTOPCommand | null
  messagesReady: boolean
  onDismiss: () => void
  onLinkRequest?: () => void
  actions?: DailyBriefingAction[]
  onAction?: (command: HubVTOPCommand) => void
  emailScheduleLabel?: string
  emailEnabled?: boolean
  onEmailNow?: () => void
  sendingEmail?: boolean
  examPrompt: ExamPrompt | null
  onExamAction: (action: 'syllabus' | 'papers' | 'materials' | 'skip') => void
  onAdvance?: () => void
  onContinue?: () => void
}

export const DailyBriefingOverlay = memo(function DailyBriefingOverlay({
  mode = 'briefing',
  greeting,
  messages,
  revealedCount,
  hydration,
  hydrationCommand,
  messagesReady,
  onDismiss,
  onLinkRequest,
  actions,
  onAction,
  emailScheduleLabel,
  emailEnabled,
  onEmailNow,
  examPrompt,
  onExamAction,
  sendingEmail,
  onAdvance,
  onContinue,
}: DailyBriefingOverlayProps) {
  const activeMessages = messages.slice(0, revealedCount)
  const currentMessage = activeMessages.length ? activeMessages[activeMessages.length - 1] : null
  const previousMessages = activeMessages.slice(0, -1)
  const isOnboarding = mode === 'onboarding'
  const stage: BriefingStage = useMemo(() => {
    if (isOnboarding) return 'onboarding'
    if (hydration.running) return 'sync'
    if (!messagesReady) return 'prep'
    return 'briefing'
  }, [hydration.running, messagesReady, isOnboarding])
  const stageSteps = useMemo(() => {
    if (isOnboarding) return []
    const currentIdx = BRIEFING_STAGES.findIndex(step => step.id === stage)
    return BRIEFING_STAGES.map((step, idx) => ({
      ...step,
      status: idx < currentIdx ? 'done' : idx === currentIdx ? 'active' : 'pending',
    }))
  }, [stage, isOnboarding])
  const insightsReleased = Math.min(revealedCount, messages.length)
  const insightsReady = !isOnboarding && messagesReady && messages.length > 0
  const showExamActions = !isOnboarding && Boolean(examPrompt && insightsReleased >= messages.length && messages.length > 0)
  const stageProgress = useMemo(() => {
    if (isOnboarding) return 25
    const syncProgress = hydration.total > 0 ? hydration.completed / hydration.total : 1
    if (stage === 'sync') return Math.min(100, syncProgress * 33)
    if (stage === 'prep') return 66
    if (stage === 'briefing') {
      const revealRatio = messages.length > 0 ? Math.min(1, insightsReleased / messages.length) : 1
      return 66 + revealRatio * 34
    }
    return 0
  }, [stage, hydration.completed, hydration.total, isOnboarding, insightsReleased, messages.length])
  const stageSupporting = useMemo(() => {
    if (stage === 'sync') {
      const total = hydration.total || 0
      if (!total) return 'hydration ready'
      const detail = hydrationCommand ? ` · ${hydrationCommand.replace('-', ' ')}` : ''
      return `pulling ${Math.min(hydration.completed, total)} of ${total} commands${detail}`
    }
    if (stage === 'prep') return 'summarizing attendance, marks, assignments, exams'
    if (stage === 'briefing') {
      if (!messages.length) return 'all clear — no urgent updates'
      return `${insightsReleased} of ${messages.length} insights revealed`
    }
    return 'link VTOP to unlock your daily snapshots'
  }, [stage, hydration.completed, hydration.total, hydrationCommand, messages.length, insightsReleased])

  return (
    <div className="absolute inset-0 z-30 bg-background/95 backdrop-blur-lg border-x border-t border-border/70" aria-live="polite" aria-busy={!messagesReady}>
      <div className="h-full flex flex-col items-center justify-center px-6 text-center">
        <div className="space-y-7 max-w-3xl w-full">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground/70">daily briefing</p>
            <p className="text-3xl sm:text-4xl font-light tracking-tight text-foreground">{greeting}</p>
          </div>
          {!isOnboarding && stage !== 'briefing' && stageSteps.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-3">
                {stageSteps.map((step, idx) => (
                  <div key={step.id} className="flex items-center gap-2 text-left">
                    <span
                      className={`h-8 w-8 rounded-full border text-[11px] uppercase tracking-[0.3em] flex items-center justify-center ${
                        step.status === 'done'
                          ? 'bg-foreground text-background border-foreground'
                          : step.status === 'active'
                          ? 'border-white/90 text-white'
                          : 'border-white/20 text-white/30'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="flex flex-col">
                      <span
                        className={`text-[10px] uppercase tracking-[0.35em] ${
                          step.status === 'pending' ? 'text-white/40' : 'text-white/70'
                        }`}
                      >
                        {step.label}
                      </span>
                      <span className="text-[11px] text-white/60">{step.caption}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{stageSupporting}</p>
            </div>
          )}
          {isOnboarding ? (
            <div className="space-y-4">
              <p className="text-base text-muted-foreground">
                link VTOP to let us pull attendance, timetable, assignments, leave, and exams directly into your daily hub.
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button size="sm" className="rounded-full" onClick={() => onLinkRequest?.()} disabled={!onLinkRequest}>
                  link vtop
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" onClick={onDismiss}>
                  not now
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {stage === 'sync' || stage === 'prep' ? (
                <div className="rounded-[24px] border border-border/60 bg-black/30 px-6 py-5 text-left space-y-2">
                  <p className="text-sm uppercase tracking-[0.35em] text-muted-foreground">{stage === 'sync' ? 'syncing' : 'prepping'}</p>
                  <p className="text-lg font-light text-white">
                    {stage === 'sync' ? 'hydrating your hub snapshots…' : 'assembling today’s insights…'}
                  </p>
                  <p className="text-xs text-white/70">{stageSupporting}</p>
                </div>
              ) : null}
              {currentMessage && stage === 'briefing' && (
                <div className="space-y-4">
                  <p className="text-[11px] uppercase tracking-[0.4em] text-muted-foreground">latest insight</p>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentMessage.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.3 }}
                      className={`rounded-[28px] border border-white/15 bg-white/5 px-6 py-5 text-left shadow-[0_30px_80px_rgba(0,0,0,0.35)] ${
                        insightsReleased < messages.length ? 'cursor-pointer tap-highlight-transparent' : ''
                      }`}
                      onClick={() => {
                        if (insightsReleased < messages.length) {
                          onAdvance?.()
                        }
                      }}
                    >
                      <p
                        className={`text-2xl font-light leading-snug text-white ${
                          currentMessage.tone === 'alert'
                            ? 'text-red-400'
                            : currentMessage.tone === 'calm'
                            ? 'text-white/60'
                            : ''
                        }`}
                      >
                        {currentMessage.primary}
                      </p>
                      {currentMessage.supporting && (
                        <p className="text-sm text-white/75 mt-2">{currentMessage.supporting}</p>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  {insightsReleased < messages.length && (
                    <p className="text-[11px] uppercase tracking-[0.4em] text-muted-foreground">tap to continue</p>
                  )}
                </div>
              )}
              {!currentMessage && stage === 'briefing' && (
                <div className="rounded-[24px] border border-border/60 bg-black/20 px-6 py-5 text-sm text-white/70">
                  all clear — nothing major to report.
                </div>
              )}
              {showExamActions && examPrompt && (
                <div className="rounded-[24px] border border-border/50 bg-black/25 px-6 py-5 space-y-3 text-left">
                  <p className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">upcoming exam</p>
                  <p className="text-lg font-medium text-white">{examPrompt.course}</p>
                  {examPrompt.when && <p className="text-xs text-muted-foreground">{examPrompt.when}</p>}
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <Button size="sm" className="rounded-full" onClick={() => onExamAction('syllabus')}>
                      syllabus
                    </Button>
                    <Button size="sm" className="rounded-full" onClick={() => onExamAction('papers')}>
                      past papers
                    </Button>
                    <Button size="sm" className="rounded-full" onClick={() => onExamAction('materials')}>
                      course materials
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => onExamAction('skip')}>
                      not now
                    </Button>
                  </div>
                </div>
              )}
              {!isOnboarding && actions && actions.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {actions.map(action => (
                    <button
                      key={action.id}
                      onClick={() => onAction?.(action.command)}
                      className="text-xs px-3 py-1.5 rounded-full border border-white/20 text-muted-foreground hover:text-white hover:border-white/60 transition-colors"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
              {emailScheduleLabel && !isOnboarding && (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-[11px] text-muted-foreground/70">{emailScheduleLabel}</p>
                  {emailEnabled && onEmailNow && (
                    <button
                      onClick={onEmailNow}
                      className="text-[11px] underline underline-offset-4 text-muted-foreground hover:text-foreground disabled:opacity-60"
                      disabled={sendingEmail}
                    >
                      {sendingEmail ? 'sending…' : 'send now'}
                    </button>
                  )}
                </div>
              )}
              {!isOnboarding && stage === 'briefing' && insightsReleased >= messages.length && (
                <div className="flex flex-col gap-2 items-center">
                  <Button size="sm" className="rounded-full" onClick={() => onContinue?.() ?? onDismiss()}>
                    continue
                  </Button>
                  <button
                    onClick={onDismiss}
                    className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground hover:text-foreground"
                  >
                    close briefing
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-border/30">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${stageProgress}%` }} />
      </div>
    </div>
  )
})
