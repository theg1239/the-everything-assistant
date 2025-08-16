'use client'

import { motion } from 'framer-motion'
import type { UIMessage } from 'ai'
import { cn } from '@/lib/utils'
import { OptimizedMarkdown } from './optimized-markdown'
import { ToolCallDisplay } from './tool-call-display'
import { MessageActions } from './message-actions'
import { memo, useMemo } from 'react'

interface MessageBubbleProps {
  message: UIMessage
  chatId?: string
  isLoading?: boolean
  onCreateCanvas?: (content: string) => void
  onLoginClick?: () => void
  onPlacementSearch?: (company: string) => void
  maximizedItem?: any
  setMaximizedItem?: (item: any) => void
}

/** v5 helper: join all text parts into a single display string */
const getMessageText = (message: UIMessage): string =>
  Array.isArray((message as any).parts)
    ? (message as any).parts
        .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('\n')
    : ''

/** v5 helper: normalize tool parts (tool-call, tool-result, tool-*) or legacy shapes into a single array */
const getToolInvocations = (message: UIMessage): any[] => {
  const parts: any[] = (message as any).parts || []

  // v5 typed tool parts
  const v5Parts = parts.filter(
    (p: any) =>
      p &&
      typeof p.type === 'string' &&
      (p.type === 'tool-call' || p.type === 'tool-result' || p.type.startsWith('tool-'))
  )

  const mappedFromParts = v5Parts.map((p: any) => {
    if (p.type === 'tool-call') {
      // some runtimes may include p.toolName or only encode it in the typed part upstream
      const name = p.toolName || p.name || 'unknown'
      return {
        toolCallId: p.toolCallId || `${name}-${Date.now()}`,
        toolName: name,
        args: p.input ?? p.args,
        state: 'call',
        result: undefined,
      }
    }
    if (p.type === 'tool-result') {
      const name = p.toolName || p.name || 'unknown'
      return {
        toolCallId: p.toolCallId || `${name}-${Date.now()}`,
        toolName: name,
        args: undefined,
        state: 'result',
        result: p.result ?? p.output,
      }
    }
    // typed tool part: 'tool-${toolName}'
    const toolName = p.type.replace(/^tool-/, '')
    const state =
      p.state === 'output-available' || p.state === 'output-error' ? 'result' : 'call'
    const result =
      p.state === 'output-available'
        ? p.output
        : p.state === 'output-error'
        ? { success: false, error: p.errorText || 'Tool error' }
        : undefined
    const args = p.input ?? p.args
    return {
      toolCallId: p.toolCallId || `${toolName}-${Date.now()}`,
      toolName,
      args,
      state,
      result,
    }
  })

  // legacy fallbacks if present on message (pre-v5 shapes)
  const legacyToolInvocations = Array.isArray((message as any).toolInvocations)
    ? (message as any).toolInvocations
    : []
  const legacyToolCalls = Array.isArray((message as any).toolCalls)
    ? (message as any).toolCalls
    : []

  // combine while avoiding obvious dups by toolCallId
  const combined = [...mappedFromParts, ...legacyToolInvocations, ...legacyToolCalls]
  const byId = new Map<string, any>()
  for (const t of combined) {
    const id = t?.toolCallId || `${t?.toolName || 'tool'}-${t?.state || 'call'}`
    if (!byId.has(id)) byId.set(id, t)
  }
  return Array.from(byId.values())
}

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

  // Normalize tool invocations for display
  const toolInvocations = useMemo(() => getToolInvocations(message), [message])

  const visibleToolCalls = useMemo(() => {
    const filtered =
      toolInvocations?.filter(
        (t: any) => t?.toolName !== 'knowledgeBase' && t?.toolName !== 'saveMemory'
      ) || []
    return filtered
  }, [toolInvocations])

  const hasVisibleToolCalls = useMemo(() => visibleToolCalls.length > 0, [visibleToolCalls.length])

  const hasKnowledgeBaseInProgress = useMemo(
    () => toolInvocations?.some((t: any) => t?.toolName === 'knowledgeBase' && t?.state !== 'result'),
    [toolInvocations]
  )

  // v5: no .content; render from parts → text
  const messageText = useMemo(() => getMessageText(message), [message])
  const hasContent = messageText.trim().length > 0

  if (!isUser && !hasContent) {
    if (!hasVisibleToolCalls && !hasKnowledgeBaseInProgress) {
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
              <p className="text-base leading-relaxed">{messageText}</p>
            ) : hasContent ? (
              <OptimizedMarkdown id={message.id} content={messageText} />
            ) : null}

            {/* Message actions */}
            {!isUser && !isLoading && chatId && (hasContent || hasVisibleToolCalls) && (
              <MessageActions
                messageId={message.id}
                chatId={chatId}
                content={messageText}
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
