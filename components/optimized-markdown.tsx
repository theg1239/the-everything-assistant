'use client'

import { memo, useMemo } from 'react'
import { Streamdown, defaultRemarkPlugins } from 'streamdown'
import remarkMath from 'remark-math'
import type { PluggableList } from 'unified'

type OptimizedMarkdownProps = {
  id: string
  content: string
  isAnimating?: boolean
}

export const OptimizedMarkdown = memo(
  function PureOptimizedMarkdown({ id, content, isAnimating = false }: OptimizedMarkdownProps) {
    const remarkPlugins = useMemo<PluggableList>(
      () => [
        defaultRemarkPlugins.gfm,
        [remarkMath, { singleDollarTextMath: true }],
        defaultRemarkPlugins.cjkFriendly,
        defaultRemarkPlugins.cjkFriendlyGfmStrikethrough,
      ],
      []
    )

    return (
      <Streamdown
        key={id}
        className="streamdown-content"
        isAnimating={isAnimating}
        mode={isAnimating ? 'streaming' : 'static'}
        remarkPlugins={remarkPlugins}
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
