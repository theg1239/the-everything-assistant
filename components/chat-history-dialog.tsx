'use client'

import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import { MessageSquare, Plus, Search } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useChatPrefetch } from '@/hooks/use-chat-prefetch'

interface ChatSummary {
  id: string
  title: string | null
  path?: string | null
  createdAt: string
  updatedAt: string
}

interface ChatHistoryDialogProps {
  /** When provided, takes full control of open state from outside. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Scira-inspired cmdk history dialog. Registers Cmd/Ctrl+K globally and
 * renders a search palette backed by `/api/chats`. Each result prefetches on
 * hover so switching chats feels instant.
 */
export function ChatHistoryDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ChatHistoryDialogProps = {}) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen

  const [chats, setChats] = React.useState<ChatSummary[]>([])
  const [loading, setLoading] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const { prefetchOnHover, prefetchOnFocus } = useChatPrefetch()

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

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetch('/api/chats?limit=40', { cache: 'no-store' })
      .then(async r => (r.ok ? ((await r.json()) as ChatSummary[]) : []))
      .then(list => {
        if (cancelled) return
        setChats(list)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  function go(path: string) {
    setOpen(false)
    router.push(path)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-background/70 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-[16vh] z-50 w-[min(640px,92vw)] -translate-x-1/2',
            'rounded-2xl border border-border/60 bg-popover text-popover-foreground shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          <DialogPrimitive.Title className="sr-only">Chat history</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search and jump to any previous conversation.
          </DialogPrimitive.Description>
          <CommandPrimitive
            loop
            label="Chat history"
            className="flex flex-col overflow-hidden rounded-2xl"
          >
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CommandPrimitive.Input
                value={query}
                onValueChange={setQuery}
                autoFocus
                placeholder="search chats, or press Enter for a new one"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="pointer-events-none hidden select-none rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
                esc
              </kbd>
            </div>

            <CommandPrimitive.List className="max-h-[60vh] overflow-y-auto p-2">
              {loading && (
                <div className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
                  loading chats…
                </div>
              )}

              <CommandPrimitive.Empty className="px-4 py-8 text-center text-sm text-muted-foreground">
                no chats match “{query}”
              </CommandPrimitive.Empty>

              <CommandPrimitive.Group
                heading="actions"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                <CommandPrimitive.Item
                  value="__new_chat__"
                  onSelect={() => go('/')}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  <span>start new chat</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    ⇧⌘O
                  </span>
                </CommandPrimitive.Item>
              </CommandPrimitive.Group>

              {chats.length > 0 && (
                <CommandPrimitive.Group
                  heading="recent"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {chats.map(chat => {
                    const path = chat.path || `/chat/${chat.id}`
                    const title = chat.title?.trim() || 'untitled chat'
                    return (
                      <CommandPrimitive.Item
                        key={chat.id}
                        value={`${title} ${chat.id}`}
                        onSelect={() => go(path)}
                        onMouseEnter={() => prefetchOnHover(chat.id)}
                        onFocus={() => prefetchOnFocus(chat.id)}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                      >
                        <MessageSquare
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="truncate">{title}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {formatRelative(chat.updatedAt || chat.createdAt)}
                        </span>
                      </CommandPrimitive.Item>
                    )
                  })}
                </CommandPrimitive.Group>
              )}
            </CommandPrimitive.List>

            <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="rounded bg-muted px-1 py-0.5">↑</kbd>
                  <kbd className="ml-0.5 rounded bg-muted px-1 py-0.5">↓</kbd> nav
                </span>
                <span>
                  <kbd className="rounded bg-muted px-1 py-0.5">↵</kbd> open
                </span>
              </div>
              <span>
                <kbd className="rounded bg-muted px-1 py-0.5">⌘K</kbd> toggle
              </span>
            </div>
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function formatRelative(iso: string) {
  try {
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}
