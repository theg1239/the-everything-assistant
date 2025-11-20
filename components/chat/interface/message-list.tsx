'use client'

import { memo, type MutableRefObject } from 'react'
import { VirtualizedMessages } from '@/components/virtualized-messages'
import { StreamingErrorDisplay } from '@/components/streaming-error-display'
import { DynamicLoadingIndicator } from '@/components/dynamic-loading-indicator'
import type { LegacyMessage } from '@/lib/ai-message-conversion'
import { cn } from '@/lib/utils'

interface ChatMessageListProps {
  messages: LegacyMessage[]
  chatId?: string
  resolvedChatId?: string
  isLoading: boolean
  status?: string
  vtopLoading?: boolean
  contentRef: MutableRefObject<HTMLDivElement | null>
  messagesEndRef: MutableRefObject<HTMLDivElement | null>
  isMobile: boolean
  isFirstMessageInNewChat: boolean
  errorMessage: string | null
  maximizedArtifact: any
  setMaximizedArtifact: (artifact: any) => void
  onCreateCanvas: (content: string) => void
  onLoginClick: () => void
  onPlacementSearch: (company: string) => void
}

export const ChatMessageList = memo(
  ({
    messages,
    chatId,
    resolvedChatId,
    isLoading,
    vtopLoading,
    contentRef,
    messagesEndRef,
    isMobile,
    errorMessage,
    maximizedArtifact,
    setMaximizedArtifact,
    onCreateCanvas,
    onLoginClick,
    onPlacementSearch,
    isFirstMessageInNewChat,
  }: ChatMessageListProps) => {
    const loading = Boolean(isLoading || vtopLoading)

    return (
      <div
        ref={contentRef}
        className={cn(
          'flex-1 overflow-y-auto overflow-fix px-3 md:px-6 pt-4 pb-24 relative',
          isMobile ? 'pt-2 pb-24' : 'pt-4 pb-28'
        )}
      >
        {errorMessage && <StreamingErrorDisplay message={errorMessage} />}

        <VirtualizedMessages
          messages={messages}
          chatId={chatId ?? resolvedChatId}
          isLoading={loading}
          onCreateCanvas={onCreateCanvas}
          onLoginClick={onLoginClick}
          onPlacementSearch={onPlacementSearch}
          maximizedItem={maximizedArtifact}
          setMaximizedItem={setMaximizedArtifact}
        />

        <DynamicLoadingIndicator
          messages={messages}
          isLoading={loading}
          showForFirstMessage={isFirstMessageInNewChat}
        />

        <div ref={messagesEndRef} className="h-1" />
      </div>
    )
  }
)

ChatMessageList.displayName = 'ChatMessageList'
