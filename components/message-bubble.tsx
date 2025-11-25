'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Streamdown } from 'streamdown'
import { OptimizedMarkdown } from './optimized-markdown'
import { ToolCallDisplay } from './tool-call-display'
import { MusicPlayerToolHandler } from './music-player-tool-handler'
import { MessageActions } from './message-actions'
import { memo, useMemo, useState, useEffect, useId } from 'react'
import type { LegacyMessage } from '@/lib/ai-message-conversion'
import { ChevronDown, FileIcon } from 'lucide-react'
import { generateId } from 'ai'
import type { Attachment } from '@/types/attachment'

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
      const toolCallId = part.toolCallId || `${toolName}-${message.id || 'message'}-${index}`

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
  const panelId = useId()

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

  const headerLabel = isStreaming
    ? 'Thinking…'
    : duration > 0
      ? `Thought for ${duration}s`
      : 'Thoughts'

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-background/40 text-xs text-muted-foreground shadow-[0_15px_35px_rgba(0,0,0,0.25)] backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/0" />
      </div>
      <button
        className="relative z-[1] flex w-full items-center justify-between gap-3 px-4 py-1 mt-3 text-left text-[11px] font-semibold uppercase tracking-wide text-foreground/80 transition-colors hover:text-foreground"
        onClick={() => {
          setIsOpen(prev => !prev)
          setManuallyToggled(true)
        }}
        aria-expanded={isOpen}
        aria-controls={panelId}
        type="button"
      >
        <span className="flex items-center gap-2 text-[12px] text-foreground">
          <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" />
          {headerLabel}
        </span>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/90">
            {isStreaming ? 'streaming' : duration > 0 ? `${duration}s` : 'ready'}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-foreground/70 transition-transform',
              isOpen ? 'rotate-180' : ''
            )}
          />
        </div>
      </button>
      <div
        id={panelId}
        className={cn(
          'relative z-[1] overflow-hidden px-4 pb-4 transition-[max-height,opacity] duration-300 ease-out',
          isOpen ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-3 text-muted-foreground max-h-64 overflow-y-auto">
          <Streamdown className="streamdown-content text-sm">
            {text}
          </Streamdown>
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

  const attachments = useMemo(() => {
    const partFiles: Attachment[] =
      Array.isArray(message.parts) && message.parts.length > 0
        ? (message.parts
            .filter(part => typeof part === 'object' && part !== null && (part as { type?: string }).type === 'file')
            .map(part => {
              const filePart = part as {
                url?: string
                name?: string
                mediaType?: string
                providerMetadata?: { attachmentName?: string }
              }
              if (!filePart.url || !filePart.mediaType) return null
              return {
                url: filePart.url,
                name: filePart.providerMetadata?.attachmentName || filePart.name || null,
                contentType: filePart.mediaType,
              }
            })
            .filter(att => att !== null) as Attachment[])
        : []

    const legacyAttachments: Attachment[] =
      Array.isArray((message as LegacyMessage).attachments) && (message as LegacyMessage).attachments!.length > 0
        ? (message as LegacyMessage).attachments!.map(att => ({
            url: (att as { url?: string }).url ?? '',
            name: (att as { name?: string | null }).name ?? undefined,
            contentType: (att as { contentType?: string }).contentType ?? '',
          }))
        : []

    const mapped = [...partFiles, ...legacyAttachments].filter(att => att.url && att.contentType)
    const seen = new Set<string>()
    return mapped.filter(att => {
      if (seen.has(att.url)) return false
      seen.add(att.url)
      return true
    })
  }, [message.parts, message.attachments])

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

          {/* Handle music player tool commands */}
          <MusicPlayerToolHandler toolInvocations={toolInvocations} />

          <div
            className={cn('flex flex-col gap-4 break-words', {
              'bg-primary text-primary-foreground px-3 py-2 rounded-xl': message.role === 'user',
            })}
          >
            {isUser ? (
              <p className="text-base leading-relaxed whitespace-pre-wrap break-words">
                {message.content}
              </p>
            ) : hasContent ? (
              <OptimizedMarkdown 
                id={message.id} 
                content={message.content as string} 
                isAnimating={isLoading && message.role === 'assistant'}
              />
            ) : null}

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {attachments.map(att => {
                  const isImage = att.contentType?.startsWith('image/')
                  const isPdf = att.contentType === 'application/pdf'
                  const fileName = att.name || att.url.split('/').pop() || 'file'
                  const fileType = isPdf ? 'PDF' : isImage ? 'Image' : 'File'
                  
                  if (isImage) {
                    return (
                      <a
                        key={att.url}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative w-32 overflow-hidden rounded-xl border border-border/40 bg-muted/30 hover:border-primary/50 transition-all"
                      >
                        <div className="h-24 w-full bg-background/40 flex items-center justify-center overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={att.url}
                            alt={fileName}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      </a>
                    )
                  }
                  
                  // PDF and other files - horizontal card style
                  return (
                    <a
                      key={att.url}
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/40 bg-muted/30 hover:bg-muted/50 hover:border-primary/50 transition-all max-w-[280px]"
                    >
                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-red-500/90 flex items-center justify-center">
                        <FileIcon className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate" title={fileName}>
                          {fileName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fileType}
                        </div>
                      </div>
                    </a>
                  )
                })}
              </div>
            )}


            {!isUser && !isLoading && chatId && (hasContent || hasVisibleToolCalls) && (
              <MessageActions
                messageId={message.id}
                chatId={chatId}
                content={message.content}
                role={message.role}
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
