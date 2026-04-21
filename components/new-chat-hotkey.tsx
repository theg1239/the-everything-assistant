'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Scira-style global keyboard shortcuts:
 *   - Shift + Cmd/Ctrl + O  -> start a new chat (route to `/`)
 *   - Cmd/Ctrl + K          -> reserved for the chat-history command dialog,
 *     which is wired up inside `components/chat-history-dialog.tsx`.
 *
 * Listening at the root level avoids every chat surface re-registering the
 * shortcut and keeps behavior consistent across pages.
 */
export function NewChatHotkey() {
  const router = useRouter()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTyping =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          (target as HTMLElement).isContentEditable)

      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      if (event.shiftKey && (event.key === 'o' || event.key === 'O')) {
        event.preventDefault()
        router.push('/')
        return
      }

      if (!isTyping && (event.key === 'n' || event.key === 'N') && event.shiftKey) {
        event.preventDefault()
        router.push('/')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router])

  return null
}
