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
      const tid = setTimeout(() => prefetchChatRoute(chatId), 200)
      return () => clearTimeout(tid)
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
