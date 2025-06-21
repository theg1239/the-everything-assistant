import { memo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageBubble } from '@/components/message-bubble'

interface VirtualizedMessagesProps {
  messages: any[]
  chatId?: string
  onCreateCanvas: (content: string) => void
  onLoginClick: () => void
}

export const VirtualizedMessages = memo(({ 
  messages, 
  chatId, 
  onCreateCanvas, 
  onLoginClick 
}: VirtualizedMessagesProps) => {
  const visibleMessages = messages.slice(-50)
  
  return (
    <AnimatePresence mode="popLayout">
      {visibleMessages.map((message, idx) => (
        <MessageBubble
          key={`${message.id}-${idx}`}
          message={message}
          chatId={chatId}
          onCreateCanvas={onCreateCanvas}
          onLoginClick={onLoginClick}
        />
      ))}
    </AnimatePresence>
  )
})

VirtualizedMessages.displayName = 'VirtualizedMessages'
