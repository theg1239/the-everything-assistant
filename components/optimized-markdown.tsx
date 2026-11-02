'use client'

import 'katex/dist/katex.min.css'
import { memo, Suspense, use, useEffect, useSyncExternalStore } from 'react'
import { Streamdown } from 'streamdown'
import {
  contentMayContainMath,
  getStreamdownPluginsWithMath,
  loadStreamdownPluginsWithMath,
  streamdownPlugins,
  subscribeStreamdownPluginsWithMath,
} from '@/lib/streamdown-config'

type OptimizedMarkdownProps = {
  id: string
  content: string
  isAnimating?: boolean
}

const subscribeNoop = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

function MarkdownBody({ id, content, isAnimating = false }: OptimizedMarkdownProps) {
  const needsMath = contentMayContainMath(content)
  const loadedPluginsWithMath = useSyncExternalStore(
    subscribeStreamdownPluginsWithMath,
    getStreamdownPluginsWithMath,
    getStreamdownPluginsWithMath
  )
  // False during SSR and hydration, true for every client render after that.
  const isHydrated = useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot)

  let plugins = streamdownPlugins
  if (needsMath) {
    if (loadedPluginsWithMath) {
      plugins = loadedPluginsWithMath
    } else if (!isHydrated) {
      // SSR / hydration: wait for the math plugin so server and client markup match.
      plugins = use(loadStreamdownPluginsWithMath())
    }
    // Client renders show the text without math until the plugin arrives, then re-render in place.
  }

  useEffect(() => {
    if (needsMath && !loadedPluginsWithMath) void loadStreamdownPluginsWithMath()
  }, [needsMath, loadedPluginsWithMath])

  return (
    <Streamdown
      key={id}
      className="streamdown-content"
      isAnimating={isAnimating}
      mode={isAnimating ? 'streaming' : 'static'}
      plugins={plugins}
      controls={{
        table: true,
        code: true,
      }}
    >
      {content}
    </Streamdown>
  )
}

export const OptimizedMarkdown = memo(
  function PureOptimizedMarkdown(props: OptimizedMarkdownProps) {
    return (
      <Suspense fallback={null}>
        <MarkdownBody {...props} />
      </Suspense>
    )
  },
  (prev, next) =>
    prev.content === next.content && prev.id === next.id && prev.isAnimating === next.isAnimating
)
