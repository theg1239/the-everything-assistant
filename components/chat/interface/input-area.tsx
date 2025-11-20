'use client'

import { memo, useCallback } from 'react'
import { MultimodalInput } from '@/components/multimodal-input'
import { FollowUpSuggestions } from '@/components/follow-up-suggestions'
import { cn } from '@/lib/utils'

interface Props {
  isMobile: boolean
  maximizedArtifact: any
  lastAssistantMessage: string
  lastUserMessage: string
  showFollowUpSuggestions: boolean
  setShowFollowUpSuggestions: (value: boolean) => void
  isLoading: boolean
  input: string
  setInput: (value: string) => void
  handleFormSubmit: (e?: React.FormEvent<HTMLFormElement>) => void
  stop?: () => void
  handleToolSelection: (tool: string | null) => void
  selectedTool: string | null
}

export const ChatInputArea = memo(
  ({
    isMobile,
    lastAssistantMessage,
    lastUserMessage,
    showFollowUpSuggestions,
    setShowFollowUpSuggestions,
    isLoading,
    input,
    setInput,
    handleFormSubmit,
    stop,
    handleToolSelection,
    selectedTool,
  }: Props) => {
    const handleSuggestionClick = useCallback(
      (suggestion: string) => {
        setInput(suggestion)
        setShowFollowUpSuggestions(false)
        // Defer to ensure state updates before submit.
        setTimeout(() => handleFormSubmit(), 0)
      },
      [handleFormSubmit, setInput, setShowFollowUpSuggestions]
    )

    return (
      <div className="sticky bottom-0 left-0 right-0 bg-background/90 backdrop-blur-sm border-t border-border/60">
        <div
          className={cn(
            'max-w-5xl mx-auto w-full flex flex-col gap-2',
            isMobile ? 'px-3 py-3' : 'px-6 py-4'
          )}
        >
          <MultimodalInput
            input={input}
            setInput={setInput}
            handleSubmit={handleFormSubmit}
            isLoading={isLoading}
            stop={stop}
            onToolSelect={handleToolSelection}
            selectedTool={selectedTool ?? undefined}
            placeholder="ask anything..."
            className="w-full"
            showAttachments={!maximizedArtifact}
          />

          <FollowUpSuggestions
            lastAssistantMessage={lastAssistantMessage}
            lastUserMessage={lastUserMessage}
            isVisible={showFollowUpSuggestions}
            onSuggestionClick={handleSuggestionClick}
            onDismiss={() => setShowFollowUpSuggestions(false)}
            isMobile={isMobile}
          />
        </div>
      </div>
    )
  }
)

ChatInputArea.displayName = 'ChatInputArea'
