'use client'

import { memo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Wrench, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToolPartState =
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-error'
  | 'approval-requested'

interface ToolPartProps {
  toolName: string
  state: ToolPartState
  /** Raw arguments from the model (may be partial while streaming). */
  input?: unknown
  /** Tool return value once available. */
  output?: unknown
  /** Error string if the tool failed. */
  errorText?: string
  /**
   * Optional custom body. If provided, replaces the default JSON preview for
   * `output-available`. Tool-specific renderers can pass richer UI here.
   */
  renderOutput?: (output: unknown) => ReactNode
  defaultOpen?: boolean
}

/**
 * Generic tool-call shell with a collapsible body. Tool-specific renderers
 * wrap this with domain-specific output. The header reflects state with a
 * chip, matching Scira's visual language.
 */
export const ToolPart = memo(function ToolPart({
  toolName,
  state,
  input,
  output,
  errorText,
  renderOutput,
  defaultOpen = false,
}: ToolPartProps) {
  const [open, setOpen] = useState(defaultOpen || state === 'output-error')

  const { label, tone, Icon } = toneForState(state)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/60 bg-card/60',
        'text-sm shadow-sm backdrop-blur-sm'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="font-mono text-[13px] text-foreground/90">{toolName}</span>
        <span
          className={cn(
            'ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
            tone
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {label}
        </span>
        <ChevronRight
          className={cn(
            'ml-auto h-4 w-4 text-muted-foreground transition-transform',
            open ? 'rotate-90' : 'rotate-0'
          )}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-2 border-t border-border/40 px-3 py-2.5">
              {input !== undefined && input !== null && (
                <section>
                  <header className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    input
                  </header>
                  <pre className="max-h-48 overflow-auto rounded bg-muted/50 px-2 py-1.5 text-[11px] leading-relaxed">
                    {safeStringify(input)}
                  </pre>
                </section>
              )}

              {state === 'output-error' && errorText && (
                <section>
                  <header className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                    error
                  </header>
                  <pre className="max-h-48 overflow-auto rounded bg-destructive/10 px-2 py-1.5 text-[11px] leading-relaxed text-destructive-foreground">
                    {errorText}
                  </pre>
                </section>
              )}

              {output !== undefined && output !== null && state !== 'output-error' && (
                <section>
                  <header className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    output
                  </header>
                  {renderOutput ? (
                    renderOutput(output)
                  ) : (
                    <pre className="max-h-64 overflow-auto rounded bg-muted/50 px-2 py-1.5 text-[11px] leading-relaxed">
                      {safeStringify(output)}
                    </pre>
                  )}
                </section>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toneForState(state: ToolPartState) {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return {
        label: 'running',
        tone: 'bg-muted text-muted-foreground',
        Icon: Loader2,
      }
    case 'output-available':
      return {
        label: 'done',
        tone: 'bg-primary/10 text-primary',
        Icon: Check,
      }
    case 'output-error':
      return {
        label: 'error',
        tone: 'bg-destructive/15 text-destructive',
        Icon: AlertTriangle,
      }
    case 'approval-requested':
      return {
        label: 'awaiting',
        tone: 'bg-muted text-muted-foreground',
        Icon: Loader2,
      }
    default:
      return {
        label: state,
        tone: 'bg-muted text-muted-foreground',
        Icon: Wrench,
      }
  }
}
