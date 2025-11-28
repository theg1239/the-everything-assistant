'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Streamdown } from 'streamdown'
import { OptimizedMarkdown } from './optimized-markdown'
import { ToolCallDisplay } from './tool-call-display'
import { MusicPlayerToolHandler } from './music-player-tool-handler'
import { MessageActions } from './message-actions'
import { SelectionMenu } from './selection-menu'
import { memo, useMemo, useState, useEffect, useId, useRef } from 'react'
import type { LegacyMessage } from '@/lib/ai-message-conversion'
import { ChevronDown, FileIcon, Loader2 } from 'lucide-react'
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
  onQuote?: (text: string) => void
}

const ReasoningPanel = memo(function ReasoningPanel({
  text,
  isStreaming,
  defaultOpen = true,
  stepIndex,
}: {
  text: string
  isStreaming: boolean
  defaultOpen?: boolean
  stepIndex?: number
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

  const stepLabel = stepIndex !== undefined ? `Step ${stepIndex + 1}` : null
  
  let statusText = ''
  if (isStreaming) {
    statusText = 'Thinking…'
  } else if (duration > 0) {
    statusText = `Thought for ${duration}s`
  } else {
    statusText = 'Thoughts'
  }

  return (
    <div className="my-2">
      <button
        className="flex items-center gap-2 text-xs text-muted-foreground/70 hover:text-foreground transition-colors select-none group w-full text-left"
        onClick={() => {
          setIsOpen(prev => !prev)
          setManuallyToggled(true)
        }}
        aria-expanded={isOpen}
        aria-controls={panelId}
        type="button"
      >
        <div className="relative flex items-center justify-center w-3 h-3 shrink-0">
          {isStreaming ? (
            <Loader2 className="w-3 h-3 animate-spin text-primary/60" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-primary/20 group-hover:bg-primary/40 transition-colors" />
          )}
        </div>
        <span className="font-medium flex items-center gap-2">
          {stepLabel && <span className="text-primary/70 font-semibold">{stepLabel}</span>}
          <span className={cn(stepLabel ? "text-muted-foreground/60" : "")}>{statusText}</span>
        </span>
        <ChevronDown
          className={cn(
            'h-3 w-3 text-muted-foreground/50 transition-transform duration-200 ml-auto',
            isOpen ? 'rotate-180' : ''
          )}
        />
      </button>
      <div
        id={panelId}
        className={cn(
          'transition-[max-height,opacity] duration-300 ease-out',
          isOpen
            ? 'max-h-[70vh] opacity-100 overflow-y-auto'
            : 'max-h-0 opacity-0 overflow-hidden'
        )}
      >
        <div className="pl-4 border-l-2 border-primary/10 mt-1 ml-[5px] hover:border-primary/20 transition-colors">
          <div className="text-muted-foreground text-sm leading-relaxed py-1">
            <Streamdown className="streamdown-content">
              {text}
            </Streamdown>
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
  onQuote,
}: MessageBubbleProps) => {
  const isUser = message.role === 'user'
  const contentRef = useRef<HTMLDivElement>(null)

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

  // Build ordered render segments from message.parts
  // Reasoning is shown inline where it appears in the conversation flow
  const orderedSegments = useMemo(() => {
    const segments: Array<{
      type: 'reasoning' | 'text' | 'tools'
      content?: string
      toolCalls?: NormalizedToolInvocation[]
      reasoningText?: string
    }> = []

    if (!Array.isArray(message.parts) || message.parts.length === 0) {
      // Fallback: no parts, use legacy structure
      if (reasoningText) {
        segments.push({ type: 'reasoning', reasoningText })
      }
      if (hasVisibleToolCalls) {
        segments.push({ type: 'tools', toolCalls: visibleToolCalls })
      }
      if (hasContent) {
        segments.push({ type: 'text', content: message.content as string })
      }
      return segments
    }

    let currentTextContent = ''
    let currentReasoningContent = ''
    let currentToolCalls: NormalizedToolInvocation[] = []
    const seenToolCallIds = new Set<string>()

    const flushText = () => {
      if (currentTextContent.trim()) {
        segments.push({ type: 'text', content: currentTextContent.trim() })
        currentTextContent = ''
      }
    }

    const flushReasoning = () => {
      if (currentReasoningContent.trim()) {
        segments.push({ type: 'reasoning', reasoningText: currentReasoningContent.trim() })
        currentReasoningContent = ''
      }
    }

    const flushTools = () => {
      if (currentToolCalls.length > 0) {
        segments.push({ type: 'tools', toolCalls: [...currentToolCalls] })
        currentToolCalls = []
      }
    }

    for (const part of message.parts) {
      if (!part || typeof part !== 'object') continue

      const partType = (part as any).type

      // Handle reasoning - inline where it appears
      if (partType === 'reasoning' && typeof (part as any).text === 'string') {
        const reasoningPartText = ((part as any).text as string).trim()
        if (reasoningPartText) {
          // Flush text/tools before reasoning to maintain order
          flushText()
          flushTools()
          // Accumulate consecutive reasoning
          currentReasoningContent += (currentReasoningContent ? '\n\n' : '') + reasoningPartText
        }
        continue
      }

      // Handle text parts
      if (partType === 'text' && typeof (part as any).text === 'string') {
        // Flush reasoning and tools before text
        flushReasoning()
        flushTools()
        currentTextContent += (currentTextContent ? '\n\n' : '') + (part as any).text
        continue
      }

      // Handle tool invocations
      const isToolPart = partType === 'dynamic-tool' || (partType && partType.startsWith?.('tool-'))
      if (isToolPart) {
        const toolCallId = (part as any).toolCallId || (part as any).toolName
        
        // Skip hidden tools
        const toolName = (part as any).toolName || deriveToolNameFromType(partType, 'tool')
        if (toolName === 'knowledgeBase' || toolName === 'saveMemory' || toolName === 'musicPlayer') {
          continue
        }

        // Skip duplicates
        if (toolCallId && seenToolCallIds.has(toolCallId)) continue
        if (toolCallId) seenToolCallIds.add(toolCallId)

        // Find the matching normalized tool invocation
        const normalizedTool = visibleToolCalls.find(t => 
          t.toolCallId === toolCallId || 
          (t.toolName === toolName && !seenToolCallIds.has(t.toolCallId))
        )

        if (normalizedTool) {
          // Flush reasoning and text before adding tool
          flushReasoning()
          flushText()
          currentToolCalls.push(normalizedTool)
        }
        continue
      }
    }

    // Flush remaining content in order
    flushReasoning()
    flushTools()
    flushText()

    // If we have tool calls that weren't in parts (legacy toolInvocations), add them
    const segmentToolIds = new Set(
      segments
        .filter(s => s.type === 'tools')
        .flatMap(s => s.toolCalls?.map(t => t.toolCallId) || [])
    )
    const remainingTools = visibleToolCalls.filter(t => !segmentToolIds.has(t.toolCallId))
    if (remainingTools.length > 0) {
      // Insert remaining tools at the appropriate position (after any initial reasoning)
      const firstTextIdx = segments.findIndex(s => s.type === 'text')
      const insertIdx = firstTextIdx >= 0 ? firstTextIdx : segments.length
      segments.splice(insertIdx, 0, { type: 'tools', toolCalls: remainingTools })
    }

    return segments
  }, [message.parts, message.content, reasoningText, visibleToolCalls, hasContent, hasVisibleToolCalls])

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
        <div ref={contentRef} className="flex flex-col gap-4 w-full relative">
          {onQuote && <SelectionMenu containerRef={contentRef} onQuote={onQuote} />}

          {/* Render ordered segments for assistant messages */}
          {!isUser && (() => {
            let reasoningStepIndex = 0
            return orderedSegments.map((segment, idx) => {
              if (segment.type === 'reasoning' && segment.reasoningText) {
                const currentStepIndex = reasoningStepIndex
                reasoningStepIndex++
                // Only show step number if there are multiple reasoning segments
                const totalReasoningSegments = orderedSegments.filter(s => s.type === 'reasoning').length
                return (
                  <ReasoningPanel 
                    key={`reasoning-${idx}`}
                    text={segment.reasoningText} 
                    isStreaming={Boolean(isLoading)} 
                    stepIndex={totalReasoningSegments > 1 ? currentStepIndex : undefined}
                  />
                )
              }
              
              if (segment.type === 'tools' && segment.toolCalls && segment.toolCalls.length > 0) {
                return (
                  <ToolCallDisplay
                    key={`tools-${idx}-${segment.toolCalls[0]?.toolCallId || idx}`}
                    toolCalls={segment.toolCalls}
                    onLoginClick={onLoginClick}
                    onPlacementSearch={onPlacementSearch}
                    maximizedItem={maximizedItem}
                  />
                )
              }
              
              if (segment.type === 'text' && segment.content) {
                return (
                  <div key={`text-${idx}`} className="flex flex-col gap-4 break-words">
                    <OptimizedMarkdown 
                      id={`${message.id}-${idx}`} 
                      content={segment.content} 
                      isAnimating={isLoading && message.role === 'assistant'}
                    />
                  </div>
                )
              }
              
              return null
            })
          })()}

          {/* Handle music player tool commands */}
          <MusicPlayerToolHandler toolInvocations={toolInvocations} />

          {/* User message content */}
          {isUser && (
            <div
              className={cn('flex flex-col gap-4 break-words', {
                'bg-primary text-primary-foreground px-3 py-2 rounded-xl': true,
              })}
            >
              <p className="text-base leading-relaxed whitespace-pre-wrap break-words">
                {message.content}
              </p>
            </div>
          )}

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
    </motion.div>
  )
}

export const MessageBubble = memo(PureMessageBubble)
