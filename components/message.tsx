'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { MessagePartRenderer, type AppUIMessagePart } from '@/components/message-parts'
import type { AppUIMessage } from '@/lib/ai-message-conversion'

interface MessageProps {
  message: AppUIMessage
  isStreaming?: boolean
  toolRenderers?: Parameters<typeof MessagePartRenderer>[0]['toolRenderers']
  className?: string
}

/**
 * A single chat message laid out as user-bubble-right / assistant-left with
 * part-by-part rendering. Intentionally presentational — persistence,
 * streaming, and transport live in the caller. ExamCooker's DocChatDock and
 * EA's (future) refactored chat surface both render via this component.
 */
export const Message = memo(function Message({
  message,
  isStreaming,
  toolRenderers,
  className,
}: MessageProps) {
  const isUser = message.role === 'user'
  const parts = (message.parts ?? []) as AppUIMessagePart[]

  return (
    <div
      data-role={message.role}
      className={cn(
        'group/message flex w-full gap-3',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <div
        className={cn(
          'flex max-w-[min(85%,680px)] flex-col gap-2',
          isUser && 'items-end'
        )}
      >
        {parts.length === 0 && isStreaming ? (
          <div className="h-4 w-6 animate-pulse rounded bg-muted" aria-label="loading" />
        ) : (
          parts.map((part, index) => {
            const key = `${message.id}-${index}-${part.type}`
            if (isUser && part.type === 'text') {
              return (
                <div
                  key={key}
                  className={cn(
                    'whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground shadow-sm'
                  )}
                >
                  {(part as { text?: string }).text}
                </div>
              )
            }
            return (
              <MessagePartRenderer
                key={key}
                part={part}
                messageId={message.id}
                partIndex={index}
                isStreaming={isStreaming && index === parts.length - 1}
                toolRenderers={toolRenderers}
              />
            )
          })
        )}
      </div>
    </div>
  )
})
