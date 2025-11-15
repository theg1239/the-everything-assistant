'use client'

import { memo } from 'react'
import { DailyBriefingMessage, DailyBriefingAction, ExamPrompt } from '@/lib/hub/daily-briefing'
import { Button } from '@/components/ui/button'
import type { HubVTOPCommand } from '@/types/hub'

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
}: DailyBriefingOverlayProps) {
  const activeMessages = messages.slice(0, revealedCount)
  const progress = hydration.total > 0 ? Math.min(100, Math.round((hydration.completed / hydration.total) * 100)) : 100
  const isOnboarding = mode === 'onboarding'
  const showExamActions = !isOnboarding && Boolean(examPrompt && revealedCount >= messages.length && messages.length > 0)
  const showSyncingState = !messagesReady && !isOnboarding

  return (
    <div className="absolute inset-0 z-30 bg-background/95 backdrop-blur-lg border-x border-t border-border/70" aria-live="polite" aria-busy={!messagesReady}>
      <div className="h-full flex flex-col items-center justify-center gap-8 px-6 text-center">
        <div className="space-y-6 max-w-2xl w-full">
          <p className="text-3xl sm:text-4xl font-light tracking-tight text-foreground">{greeting}</p>
          {showSyncingState && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="uppercase tracking-[0.3em] text-[11px] text-muted-foreground/70">syncing</div>
              <div className="text-lg font-light text-foreground">hydrating your hub snapshots…</div>
              <div className="text-xs text-muted-foreground/80">
                pulling {hydration.completed} of {hydration.total} commands
                {hydrationCommand ? ` · ${hydrationCommand.replace('-', ' ')}` : ''}
              </div>
            </div>
          )}
          {activeMessages.length > 0 && (
            <div className="space-y-5">
              {activeMessages.map(message => (
                <div key={message.id} className="space-y-1">
                  <p
                    className={`text-2xl sm:text-3xl font-light leading-tight text-foreground ${
                      message.tone === 'alert'
                        ? 'text-red-400'
                        : message.tone === 'calm'
                        ? 'text-muted-foreground'
                        : ''
                    }`}
                  >
                    {message.primary}
                  </p>
                  {message.supporting && (
                    <p className="text-sm sm:text-base text-muted-foreground/80">{message.supporting}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 items-center">
          {isOnboarding ? (
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">ready to link</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    onLinkRequest?.()
                  }}
                  disabled={!onLinkRequest}
                >
                  link vtop
                </Button>
                <Button size="sm" variant="outline" className="rounded-full" onClick={onDismiss}>
                  not now
                </Button>
              </div>
            </div>
          ) : showExamActions && examPrompt ? (
            <div className="space-y-3">
              <p className="text-base text-muted-foreground/90">
                Do you want to view the syllabus for {examPrompt.course || 'this course'}, or dig into past papers or course materials?
              </p>
              {examPrompt.when && (
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground/70">{examPrompt.when}</p>
              )}
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">prep links</p>
              <div className="flex flex-wrap gap-2 justify-center">
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
          ) : (
            <button onClick={onDismiss} className="text-xs uppercase tracking-[0.4em] text-muted-foreground hover:text-foreground">
              not now
            </button>
          )}
          {!isOnboarding && actions && actions.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {actions.map(action => (
                <button
                  key={action.id}
                  onClick={() => onAction?.(action.command)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-foreground/70 transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          {emailScheduleLabel && !isOnboarding && (
            <div className="flex flex-col items-center gap-1 mt-2">
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
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-border/30">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
})
