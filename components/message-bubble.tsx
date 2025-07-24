'use client'

import { motion } from 'framer-motion'
import type { Message } from 'ai'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import { OptimizedMarkdown } from './optimized-markdown'
import { ToolCallDisplay } from './tool-call-display'
import { MessageActions } from './message-actions'
import { memo, useMemo } from 'react'

interface MessageBubbleProps {
  message: Message
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

  const toolInvocations = useMemo(() => {
    if (message.parts) {
      return message.parts
        .filter((part: any) => part.type === 'tool-invocation')
        .map((part: any) => part.toolInvocation)
    }
    
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
    return message.content && (message.content as string).trim() !== ''
  }, [message.content])

  const hasVisibleToolCalls = useMemo(() => {
    return visibleToolCalls.length > 0
  }, [visibleToolCalls.length])

  const hasKnowledgeBaseInProgress = useMemo(() => {
    return toolInvocations?.some((t: any) => t.toolName === 'knowledgeBase' && t.state !== 'result')
  }, [toolInvocations])

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
              <p className="text-base leading-relaxed">{message.content}</p>
            ) : hasContent ? (
              <OptimizedMarkdown
                id={message.id}
                content={message.content as string}
              />
            ) : null}

            {/* Message actions */}
            {!isUser && chatId && (hasContent || hasVisibleToolCalls) && (
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
