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
  onCreateCanvas?: (content: string) => void
  onLoginClick?: () => void
  onPlacementSearch?: (company: string) => void
  maximizedItem?: any
  setMaximizedItem?: (item: any) => void
}

const PureMessageBubble = ({
  message,
  chatId,
  onCreateCanvas,
  onLoginClick,
  onPlacementSearch,
  maximizedItem,
  setMaximizedItem,
}: MessageBubbleProps) => {
  const isUser = message.role === 'user'

  const textContent = useMemo(() => {
    if (Array.isArray((message as any).parts)) {
      const textFromParts = (message as any).parts
        .filter((p: any) => p.type === 'text' && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('')
      if (textFromParts.trim()) {
        return textFromParts
      }
    }
    
    if (typeof (message as any).content === 'string') {
      return (message as any).content
    }
    
    if ((message as any).text && typeof (message as any).text === 'string') {
      return (message as any).text
    }
    
    return ''
  }, [message.parts, (message as any).content, (message as any).text])

  const toolInvocations = useMemo(() => {
    // AI SDK v5: Extract tool calls from parts array
    if (Array.isArray(message.parts)) {
      const toolParts = message.parts.filter((part: any) => {
        return part.type.startsWith('tool-');
      });
      
      if (toolParts.length > 0) {
        return toolParts.map((part: any) => {
          const toolName = part.type.replace('tool-', '');
          if (part.state === 'input-available') {
            return {
              toolCallId: part.toolCallId,
              toolName: toolName,
              args: part.input,
              state: 'call',
            }
          } else if (part.state === 'output-available') {
            return {
              toolCallId: part.toolCallId,
              toolName: toolName,
              result: part.output,
              state: 'result',
            }
          }
          return part;
        })
      }
    }
    
    // Fallback to legacy format
    const directToolInvocations = (message as any).toolInvocations
    if (Array.isArray(directToolInvocations)) {
      return directToolInvocations
    }
    
    const toolCalls = (message as any).toolCalls
    if (Array.isArray(toolCalls)) {
      return toolCalls
    }
    
    return []
  }, [message.parts, (message as any).toolInvocations, (message as any).toolCalls])

  const visibleToolCalls = useMemo(() => {
    const filtered = toolInvocations?.filter(
      (t: any) => t.toolName !== 'knowledgeBase' && t.toolName !== 'saveMemory'
    ) || []
    
    return filtered
  }, [toolInvocations])

  const hasContent = useMemo(() => {
    return textContent.trim() !== ''
  }, [textContent])

  const hasVisibleToolCalls = useMemo(() => {
    return visibleToolCalls.length > 0
  }, [visibleToolCalls.length])

  const hasKnowledgeBaseInProgress = useMemo(() => {
    return toolInvocations?.some((t: any) => t.toolName === 'knowledgeBase' && t.state !== 'result')
  }, [toolInvocations])

  if (!isUser && !hasContent && !hasVisibleToolCalls && !hasKnowledgeBaseInProgress) {
    return null
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
              <p className="text-base leading-relaxed">{textContent}</p>
            ) : textContent.trim() ? (
              <OptimizedMarkdown
                id={message.id}
                content={textContent}
              />
            ) : null}

            {/* Message actions - show for assistant messages with content */}
            {!isUser && chatId && textContent.trim() && (
              <MessageActions
                messageId={message.id}
                chatId={chatId}
                content={textContent}
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
