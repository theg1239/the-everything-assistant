import { memo } from 'react'
import { MessageBubble, type MaximizedItem } from '@/components/message-bubble'
import type { LegacyMessage } from '@/lib/ai-message-conversion'
import { FollowUpSuggestions } from '@/components/follow-up-suggestions'

interface VirtualizedMessagesProps {
  messages: LegacyMessage[]
  chatId?: string
  isLoading: boolean
  onCreateCanvas: (content: string) => void
  onLoginClick: () => void
  onPlacementSearch: (company: string) => void
  maximizedItem?: MaximizedItem | null
  setMaximizedItem?: (item: MaximizedItem | null) => void
  showFollowUpSuggestions?: boolean
  lastAssistantMessage?: string
  lastUserMessage?: string
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[]
  onSuggestionClick?: (suggestion: string) => void
  onDismissSuggestions?: () => void
  isMobile?: boolean
  onQuote?: (text: string) => void
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
    conversationHistory,
    onSuggestionClick,
    onDismissSuggestions,
    isMobile = false,
    onQuote,
  }: VirtualizedMessagesProps) => {
    const visibleMessages = messages.slice(-50)
    
    const lastAssistantIndex = visibleMessages.reduce(
      (lastIdx, msg, idx) => (msg.role === 'assistant' ? idx : lastIdx),
      -1
    )

    // Key by id so bubbles keep their identity when the 50-message window slides (an index in the
    // key remounted every bubble); a repeated id falls back to id+index to stay unique.
    const seenIds = new Set<string>()
    const keys = visibleMessages.map((message, idx) => {
      const key = seenIds.has(message.id) ? `${message.id}-${idx}` : message.id
      seenIds.add(message.id)
      return key
    })

    // No AnimatePresence: bubbles have no exit animation, and popLayout measured every child on
    // each update. MessageBubble's own mount animation still plays for newly added messages.
    return (
      <>
        {visibleMessages.map((message, idx) => (
          <div key={keys[idx]}>
            <MessageBubble
              message={message}
              chatId={chatId}
              isLoading={isLoading && idx === visibleMessages.length - 1}
              onCreateCanvas={onCreateCanvas}
              onLoginClick={onLoginClick}
              onPlacementSearch={onPlacementSearch}
              maximizedItem={maximizedItem}
              setMaximizedItem={setMaximizedItem}
              onQuote={onQuote}
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
                    conversationHistory={conversationHistory}
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
      </>
    )
  }
)

VirtualizedMessages.displayName = 'VirtualizedMessages'
