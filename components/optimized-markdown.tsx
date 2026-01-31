'use client'

import { memo } from 'react'
import { Streamdown } from 'streamdown'
import { streamdownPlugins } from '@/lib/streamdown-config'

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
        className="streamdown-content"
        isAnimating={isAnimating}
        mode={isAnimating ? 'streaming' : 'static'}
        plugins={streamdownPlugins}
        controls={{
          table: true,
          code: true,
        }}
      >
        {content}
      </Streamdown>
    )
  },
  (prev, next) =>
    prev.content === next.content && prev.id === next.id && prev.isAnimating === next.isAnimating
)
