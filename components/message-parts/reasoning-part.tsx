'use client'

import { memo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Brain, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReasoningPartProps {
  id: string
  text: string
  isStreaming?: boolean
}

/**
 * Collapsible reasoning/thinking block, closely modeled on Scira's reasoning
 * part. Open while the model is actively streaming, collapses once the final
 * answer lands.
 */
export const ReasoningPart = memo(function ReasoningPart({
  id,
  text,
  isStreaming,
}: ReasoningPartProps) {
  const [open, setOpen] = useState<boolean>(!!isStreaming)

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-muted/30',
        'text-xs text-muted-foreground'
      )}
      data-reasoning-id={id}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <Brain className="h-3.5 w-3.5" aria-hidden />
        <span className="font-medium text-foreground/80">
          {isStreaming ? 'thinking…' : 'reasoning'}
        </span>
        <ChevronDown
          className={cn(
            'ml-auto h-3.5 w-3.5 transition-transform',
            open ? 'rotate-180' : 'rotate-0'
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
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <pre className="whitespace-pre-wrap break-words px-3 pb-3 font-sans leading-relaxed">
              {text}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
