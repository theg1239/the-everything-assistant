'use client'

import { memo } from 'react'
import { Streamdown } from 'streamdown'

type OptimizedMarkdownProps = {
  id: string
  content: string
  isAnimating?: boolean
}

export const OptimizedMarkdown = memo(
  function PureOptimizedMarkdown({ id, content, isAnimating = false }: OptimizedMarkdownProps) {
    return (
      <Streamdown
        key={id}
        className="text-base leading-relaxed prose prose-sm max-w-none dark:prose-invert"
        isAnimating={isAnimating}
      >
        {content}
      </Streamdown>
    )
  },
  (prev, next) =>
    prev.content === next.content && prev.id === next.id && prev.isAnimating === next.isAnimating
)
