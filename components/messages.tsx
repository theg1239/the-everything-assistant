'use client'

import { memo, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Message } from '@/components/message'
import type { AppUIMessage } from '@/lib/ai-message-conversion'
import { useOptimizedScroll } from '@/hooks/use-optimized-scroll'
import type { MessagePartRenderer } from '@/components/message-parts'

interface MessagesProps {
  messages: AppUIMessage[]
  isStreaming?: boolean
  toolRenderers?: Parameters<typeof MessagePartRenderer>[0]['toolRenderers']
  emptyState?: React.ReactNode
  className?: string
}

/**
 * Non-virtualized list of Messages suited for small/medium-sized transcripts
 * (ExamCooker's DocChatDock keeps things short). EA's big list still uses its
 * existing virtualized renderer; this module is an opt-in alternative.
 *
 * Auto-scrolls to bottom via `useOptimizedScroll` while respecting the user's
 * manual scroll-up intent.
 */
export const Messages = memo(function Messages({
  messages,
  isStreaming,
  toolRenderers,
  emptyState,
  className,
}: MessagesProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { scrollToBottom, markManualScroll, resetManualScroll } =
    useOptimizedScroll(containerRef)

  useEffect(() => {
    if (messages.length === 0) {
      resetManualScroll()
      return
    }
    scrollToBottom()
  }, [messages, isStreaming, scrollToBottom, resetManualScroll])

  return (
    <div
      ref={containerRef}
      onScroll={() => markManualScroll()}
      className={cn(
        'flex-1 overflow-y-auto px-3 py-4 sm:px-5',
        'flex flex-col gap-4',
        className
      )}
    >
      {messages.length === 0 && emptyState}
      {messages.map((message, idx) => (
        <Message
          key={message.id}
          message={message}
          isStreaming={isStreaming && idx === messages.length - 1}
          toolRenderers={toolRenderers}
        />
      ))}
    </div>
  )
})
