import { memo, useLayoutEffect, useRef, useState } from 'react'
import { ChevronUp, Loader2 } from 'lucide-react'
import { MessageBubble, type MaximizedItem } from '@/components/message-bubble'
import type { LegacyMessage } from '@/lib/ai-message-conversion'
import { FollowUpSuggestions } from '@/components/follow-up-suggestions'
import { Button } from '@/components/ui/button'

/** Messages rendered at once; "show earlier messages" reveals (fetching if needed) this many more. */
const RENDER_WINDOW = 50

/** Nearest scrollable ancestor of `element`. */
const findScrollParent = (element: HTMLElement | null): HTMLElement | null => {
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}

type ScrollAnchor = { container: HTMLElement; fromBottom: number }

/** Keeps the content that was in view in place after content is inserted above it. */
const restoreScrollAnchor = ({ container, fromBottom }: ScrollAnchor) => {
  container.scrollTop = container.scrollHeight - fromBottom
}

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
  /** Whether older messages exist that `messages` doesn't include yet. */
  hasEarlier?: boolean
  loadingEarlier?: boolean
  /** Fetches the next older page into `messages`. */
  onLoadEarlier?: () => Promise<void>
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
    hasEarlier = false,
    loadingEarlier = false,
    onLoadEarlier,
  }: VirtualizedMessagesProps) => {
    const [windowSize, setWindowSize] = useState(RENDER_WINDOW)
    const earlierControlRef = useRef<HTMLDivElement>(null)
    const scrollAnchorRef = useRef<ScrollAnchor | null>(null)
    const visibleMessages = messages.slice(-windowSize)
    const hiddenCount = messages.length - visibleMessages.length
    const canShowEarlier = hiddenCount > 0 || (hasEarlier && Boolean(onLoadEarlier))

    // Revealing earlier messages inserts content above the viewport: keep what was in view still.
    useLayoutEffect(() => {
      const anchor = scrollAnchorRef.current
      if (!anchor) return
      scrollAnchorRef.current = null
      restoreScrollAnchor(anchor)
    }, [windowSize])

    const showEarlier = async () => {
      if (hiddenCount < RENDER_WINDOW && hasEarlier && onLoadEarlier) {
        await onLoadEarlier()
      }
      const container = findScrollParent(earlierControlRef.current)
      if (container) {
        scrollAnchorRef.current = {
          container,
          fromBottom: container.scrollHeight - container.scrollTop,
        }
      }
      setWindowSize(size => size + RENDER_WINDOW)
    }


    const lastAssistantIndex = visibleMessages.reduce(
      (lastIdx, msg, idx) => (msg.role === 'assistant' ? idx : lastIdx),
      -1
    )

    // Key by id so bubbles keep their identity when the render window slides (an index in the
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
        {canShowEarlier && (
          <div ref={earlierControlRef} className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void showEarlier()}
              disabled={loadingEarlier}
              className="h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              {loadingEarlier ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ChevronUp className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              )}
              show earlier messages
            </Button>
          </div>
        )}
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
