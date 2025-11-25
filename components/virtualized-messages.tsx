import { memo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { MessageBubble } from '@/components/message-bubble'
import { FollowUpSuggestions } from '@/components/follow-up-suggestions'

interface VirtualizedMessagesProps {
  messages: any[]
  chatId?: string
  isLoading: boolean
  onCreateCanvas: (content: string) => void
  onLoginClick: () => void
  onPlacementSearch: (company: string) => void
  maximizedItem?: any
  setMaximizedItem?: (item: any) => void
  showFollowUpSuggestions?: boolean
  lastAssistantMessage?: string
  lastUserMessage?: string
  onSuggestionClick?: (suggestion: string) => void
  onDismissSuggestions?: () => void
  isMobile?: boolean
}

export const VirtualizedMessages = memo(
  ({
    messages,
    chatId,
    isLoading,
    onCreateCanvas,
    onLoginClick,
    onPlacementSearch,
    maximizedItem,
    setMaximizedItem,
    showFollowUpSuggestions = false,
    lastAssistantMessage = '',
    lastUserMessage = '',
    onSuggestionClick,
    onDismissSuggestions,
    isMobile = false,
  }: VirtualizedMessagesProps) => {
    const visibleMessages = messages.slice(-50)
    
    const lastAssistantIndex = visibleMessages.reduce(
      (lastIdx, msg, idx) => (msg.role === 'assistant' ? idx : lastIdx),
      -1
    )

    return (
      <AnimatePresence mode="popLayout">
        {visibleMessages.map((message, idx) => (
          <div key={`${message.id}-${idx}`}>
            <MessageBubble
              message={message}
              chatId={chatId}
              isLoading={isLoading && idx === visibleMessages.length - 1}
              onCreateCanvas={onCreateCanvas}
              onLoginClick={onLoginClick}
              onPlacementSearch={onPlacementSearch}
              maximizedItem={maximizedItem}
              setMaximizedItem={setMaximizedItem}
            />
            {!isMobile &&
              idx === lastAssistantIndex &&
              message.role === 'assistant' &&
              showFollowUpSuggestions &&
              !isLoading &&
              onSuggestionClick &&
              onDismissSuggestions && (
                <div className="w-full mx-auto max-w-3xl px-4 mt-2">
                  <FollowUpSuggestions
                    lastAssistantMessage={lastAssistantMessage}
                    lastUserMessage={lastUserMessage}
                    isVisible={showFollowUpSuggestions}
                    onSuggestionClick={onSuggestionClick}
                    onDismiss={onDismissSuggestions}
                    isMobile={false}
                    inline={true}
                  />
                </div>
              )}
          </div>
        ))}
      </AnimatePresence>
    )
  }
)

VirtualizedMessages.displayName = 'VirtualizedMessages'
