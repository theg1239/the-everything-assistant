'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import { OptimizedMarkdown } from './optimized-markdown'
import { ToolCallDisplay } from './tool-call-display'
import { MessageActions } from './message-actions'
import { memo, useMemo, useState, useEffect } from 'react'
import type { LegacyMessage } from '@/lib/ai-message-conversion'
import { ChevronDown } from 'lucide-react'
import { generateId } from 'ai'

type NormalizedToolInvocation = {
  toolCallId: string
  toolName: string
  args?: Record<string, any>
  result?: any
  state?: 'partial-call' | 'call' | 'result' | 'error'
  error?: string
  providerExecuted?: boolean
}

const mapUiStateToLegacyState = (
  state?: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
): NormalizedToolInvocation['state'] => {
  switch (state) {
    case 'input-streaming':
      return 'partial-call'
    case 'input-available':
      return 'call'
    case 'output-error':
      return 'error'
    case 'output-available':
    default:
      return 'result'
  }
}

const deriveToolNameFromType = (type?: string, fallback = 'tool') => {
  if (!type) return fallback
  if (type.startsWith('tool-')) return type.replace('tool-', '')
  return fallback
}

const normalizeToolInvocations = (message: LegacyMessage): NormalizedToolInvocation[] => {
  const normalized: NormalizedToolInvocation[] = []
  const seen = new Set<string>()

  if (Array.isArray(message.parts)) {
    message.parts.forEach((part: any, index: number) => {
      if (!part || typeof part !== 'object') return
      const isToolPart =
        typeof part.type === 'string' &&
        (part.type === 'dynamic-tool' || part.type.startsWith('tool-'))
      if (!isToolPart) return

      const toolName =
        typeof part.toolName === 'string'
          ? part.toolName
          : deriveToolNameFromType(part.type, `tool-${index}`)
      const toolCallId =
          part.toolCallId || `${toolName}-${message.id || 'message'}-${index}`

      const invocation: NormalizedToolInvocation = {
        toolCallId,
        toolName,
        args: (part.input as Record<string, any>) ?? part.args,
        result: part.output ?? part.result,
        state: mapUiStateToLegacyState(part.state),
        error: part.errorText,
        providerExecuted: part.providerExecuted,
      }

      normalized.push(invocation)
      seen.add(toolCallId)
    })
  }

  if (Array.isArray((message as any).toolInvocations)) {
    ;(message as any).toolInvocations.forEach((tool: any, index: number) => {
      const toolCallId = tool.toolCallId || generateId()
      if (seen.has(toolCallId)) return
      normalized.push({
        toolCallId,
        toolName: tool.toolName || `tool-${index}`,
        args: tool.args,
        result: tool.result,
        state: tool.state,
        error: tool.error,
        providerExecuted: tool.providerExecuted,
      })
      seen.add(toolCallId)
    })
  }

  return normalized
}

interface MessageBubbleProps {
  message: LegacyMessage
  chatId?: string
  isLoading?: boolean
  onCreateCanvas?: (content: string) => void
  onLoginClick?: () => void
  onPlacementSearch?: (company: string) => void
  maximizedItem?: any
  setMaximizedItem?: (item: any) => void
}

const ReasoningPanel = memo(function ReasoningPanel({
  text,
  isStreaming,
  defaultOpen = true,
}: {
  text: string
  isStreaming: boolean
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [duration, setDuration] = useState(0)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [manuallyToggled, setManuallyToggled] = useState(false)

  useEffect(() => {
    if (isStreaming) {
      if (startTime === null) setStartTime(Date.now())
    } else if (startTime !== null) {
      setDuration(Math.max(1, Math.round((Date.now() - startTime) / 1000)))
      setStartTime(null)
    }
  }, [isStreaming, startTime])

  useEffect(() => {
    if (!manuallyToggled && !isStreaming && isOpen && duration > 0) {
      const timer = setTimeout(() => setIsOpen(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [isStreaming, isOpen, duration, manuallyToggled])

  if (!text) return null

  const headerLabel = isStreaming ? 'Thinking…' : duration > 0 ? `Thought for ${duration}s` : 'Thoughts'

  return (
    <div className="rounded-2xl border border-border/50 bg-muted/40 text-xs text-muted-foreground">
      <button
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-foreground/80 transition-colors hover:text-foreground"
        onClick={() => {
          setIsOpen(prev => !prev)
          setManuallyToggled(true)
        }}
        type="button"
      >
        <span className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          {headerLabel}
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen ? 'rotate-180' : '')} />
      </button>
      <div
        className={cn(
          'overflow-hidden px-3 pb-3 transition-[max-height,opacity] duration-200',
          isOpen ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="max-h-[360px] overflow-y-auto pr-1 text-muted-foreground">
          <div className="prose prose-sm dark:prose-invert leading-relaxed">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
})

const PureMessageBubble = ({
  message,
  chatId,
  isLoading,
  onCreateCanvas,
  onLoginClick,
  onPlacementSearch,
  maximizedItem,
  setMaximizedItem,
}: MessageBubbleProps) => {
  const isUser = message.role === 'user'

  const toolInvocations = useMemo(
    () => normalizeToolInvocations(message),
    [message, message.parts, (message as any).toolInvocations]
  )

  const visibleToolCalls = useMemo(() => {
    const filtered =
      toolInvocations?.filter(
        (t: any) => t.toolName !== 'knowledgeBase' && t.toolName !== 'saveMemory'
      ) || []

    return filtered
  }, [toolInvocations])

  const reasoningParts = useMemo(
    () =>
      (message.parts || []).filter(
        part => part?.type === 'reasoning' && typeof (part as any).text === 'string'
      ),
    [message.parts]
  )

  const reasoningText = useMemo(() => {
    if (!reasoningParts.length) return ''
    return reasoningParts
      .map(part => ((part as any).text as string).trim())
      .filter(Boolean)
      .join('\n\n')
  }, [reasoningParts])

  const hasContent = useMemo(() => {
    return message.content && (message.content as string).trim() !== ''
  }, [message.content])

  const hasVisibleToolCalls = useMemo(() => {
    return visibleToolCalls.length > 0
  }, [visibleToolCalls.length])

  const hasKnowledgeBaseInProgress = useMemo(() => {
    return toolInvocations?.some((t: any) => t.toolName === 'knowledgeBase' && t.state !== 'result')
  }, [toolInvocations])

  if (!isUser && !hasContent) {
    if (!hasVisibleToolCalls && !hasKnowledgeBaseInProgress && !reasoningText) {
      return null
    }
  }

  return (
    <motion.div
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full mx-auto max-w-3xl px-4 group/message"
      data-role={message.role}
    >
      <div
        className={cn(
          'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:w-fit'
        )}
      >
        {/* {message.role === 'assistant' && (
          <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
            <div className="translate-y-px">
              <SparklesIcon size={14} />
            </div>
          </div>
        )} */}

        <div className="flex flex-col gap-4 w-full">
          {reasoningText && (
            <ReasoningPanel text={reasoningText} isStreaming={Boolean(isLoading)} />
          )}

          {hasVisibleToolCalls && (
            <ToolCallDisplay
              key={`tool-calls-${message.id}`}
              toolCalls={visibleToolCalls}
              onLoginClick={onLoginClick}
              onPlacementSearch={onPlacementSearch}
              maximizedItem={maximizedItem}
              setMaximizedItem={setMaximizedItem}
            />
          )}

          <div
            className={cn('flex flex-col gap-4', {
              'bg-primary text-primary-foreground px-3 py-2 rounded-xl': message.role === 'user',
            })}
          >
            {isUser ? (
              <p className="text-base leading-relaxed">{message.content}</p>
            ) : hasContent ? (
              <OptimizedMarkdown id={message.id} content={message.content as string} />
            ) : null}

            {/* Message actions */}
            {!isUser && !isLoading && chatId && (hasContent || hasVisibleToolCalls) && (
              <MessageActions
                messageId={message.id}
                chatId={chatId}
                content={message.content}
                onCreateCanvas={onCreateCanvas}
              />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export const MessageBubble = memo(PureMessageBubble)
