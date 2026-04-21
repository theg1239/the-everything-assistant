'use client'

import { memo } from 'react'
import { OptimizedMarkdown } from '@/components/optimized-markdown'

interface TextPartProps {
  id: string
  text: string
  isStreaming?: boolean
}

/**
 * Renders an assistant text part via Streamdown. Pulled into its own file so
 * the `MessagePartRenderer` switch stays small and so ExamCooker can reuse
 * this exact primitive inside its DocChatDock.
 */
export const TextPart = memo(function TextPart({ id, text, isStreaming }: TextPartProps) {
  return (
    <div className="text-sm leading-relaxed text-foreground/95">
      <OptimizedMarkdown id={id} content={text} isAnimating={!!isStreaming} />
    </div>
  )
})
