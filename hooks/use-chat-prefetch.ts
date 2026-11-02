'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useRef } from 'react'

/**
 * Prefetch chat routes on hover/focus with dedupe, so switching between past
 * chats feels instant. Adapted from Scira's implementation.
 */
export function useChatPrefetch() {
  const router = useRouter()
  const prefetched = useRef<Set<string>>(new Set())
  const pendingHover = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prefetchChatRoute = useCallback(
    (chatId: string) => {
      const path = `/chat/${chatId}`
      if (prefetched.current.has(path)) return
      try {
        router.prefetch(path)
        prefetched.current.add(path)
      } catch {
        // ignore - router.prefetch throws outside browser tree
      }
    },
    [router]
  )

  const prefetchOnHover = useCallback(
    (chatId: string) => {
      // Only the item the pointer rests on (200ms) is prefetched: sweeping across the list
      // cancels the pending prefetch of the previously hovered item.
      if (pendingHover.current) clearTimeout(pendingHover.current)
      const tid = setTimeout(() => {
        pendingHover.current = null
        prefetchChatRoute(chatId)
      }, 200)
      pendingHover.current = tid
      return () => {
        clearTimeout(tid)
        if (pendingHover.current === tid) pendingHover.current = null
      }
    },
    [prefetchChatRoute]
  )

  const prefetchOnFocus = useCallback(
    (chatId: string) => {
      prefetchChatRoute(chatId)
    },
    [prefetchChatRoute]
  )

  const prefetchChats = useCallback(
    (chatIds: string[]) => {
      chatIds.forEach(id => prefetchChatRoute(id))
    },
    [prefetchChatRoute]
  )

  return { prefetchChats, prefetchOnHover, prefetchOnFocus, prefetchChatRoute }
}
