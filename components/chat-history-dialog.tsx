'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'

const loadBody = () => import('@/components/chat-history-dialog-body')

/** The cmdk palette (and its chat fetching) only loads once the dialog is first opened. */
const ChatHistoryDialogBody = dynamic(() => loadBody().then(mod => mod.ChatHistoryDialogBody), {
  ssr: false,
})

interface ChatHistoryDialogProps {
  /** When provided, takes full control of open state from outside. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Scira-inspired cmdk history dialog. Registers Cmd/Ctrl+K globally and
 * renders a search palette backed by `/api/chats`. Each result prefetches on
 * hover so switching chats feels instant.
 *
 * This wrapper stays tiny: it owns the open state and hotkey, warms the palette chunk when
 * the browser is idle, and mounts the palette on first open (kept mounted afterwards so the
 * close animation still plays).
 */
export function ChatHistoryDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ChatHistoryDialogProps = {}) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen
  const [hasOpened, setHasOpened] = React.useState(open)

  if (open && !hasOpened) {
    setHasOpened(true)
  }

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  // Warm the palette chunk off the critical path so the first Cmd+K opens without a delay.
  React.useEffect(() => {
    const preload = () => {
      void loadBody()
    }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(preload, { timeout: 8000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(preload, 3000)
    return () => window.clearTimeout(id)
  }, [])

  if (!hasOpened) return null

  return <ChatHistoryDialogBody open={open} onOpenChange={setOpen} />
}
