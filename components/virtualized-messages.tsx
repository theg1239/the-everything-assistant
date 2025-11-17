import { memo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { MessageBubble } from '@/components/message-bubble'

interface VirtualizedMessagesProps {
  messages: any[]
  chatId?: string
  isLoading: boolean
  onCreateCanvas: (content: string) => void
  onLoginClick: () => void
  onPlacementSearch: (company: string) => void
  maximizedItem?: any
  setMaximizedItem?: (item: any) => void
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
  }: VirtualizedMessagesProps) => {
    const visibleMessages = messages.slice(-50)

    return (
      <AnimatePresence mode="popLayout">
        {visibleMessages.map((message, idx) => (
          <MessageBubble
            key={`${message.id}-${idx}`}
            message={message}
            chatId={chatId}
            isLoading={isLoading && idx === visibleMessages.length - 1}
            onCreateCanvas={onCreateCanvas}
            onLoginClick={onLoginClick}
            onPlacementSearch={onPlacementSearch}
            maximizedItem={maximizedItem}
            setMaximizedItem={setMaximizedItem}
          />
        ))}
      </AnimatePresence>
    )
  }
)

VirtualizedMessages.displayName = 'VirtualizedMessages'
