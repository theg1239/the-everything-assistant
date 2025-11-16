'use client'

import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import HubShell from './hub-shell'
import type {
  PersonalHubState,
  HubVTOPCommand,
  PersonalHubSnapshot,
  VTOPCredentialPayload,
} from '@/types/hub'
import { Drawer } from 'vaul'
import { useHubStore } from './hub-store'
import { shallow } from 'zustand/shallow'

export type HubActionHandlers = {
  refreshState: () => Promise<PersonalHubState>
  syncCore: () => Promise<PersonalHubState>
  refreshVTOP: (
    command: HubVTOPCommand,
    extras?: Record<string, unknown>,
    credentials?: VTOPCredentialPayload
  ) => Promise<PersonalHubSnapshot>
  runTool: (toolName: string, args?: Record<string, unknown>) => Promise<unknown>
}

interface HubProps {
  isOpen: boolean
  locked?: boolean
  syncing?: boolean
  onClose?: () => void
  onLink?: () => void
  actions: HubActionHandlers
  preferences?: Record<string, unknown>
}

export default function Hub({
  isOpen,
  locked = false,
  syncing = false,
  onClose,
  onLink,
  actions,
  preferences,
}: HubProps) {
  const [mounted, setMounted] = useState(false)
  const hubSyncing = useHubStore(state => state.syncing, shallow)
  const isSyncing = syncing || hubSyncing
  const [forceClose, setForceClose] = useState(false)
  const effectiveOpen = isOpen && !forceClose
  useEffect(() => {
    if (!isOpen) {
      setForceClose(false)
    }
  }, [isOpen])

  useEffect(() => {
    const handleLinked = () => {
      setForceClose(false)
    }
    window.addEventListener('vtopCredentialsLinked', handleLinked as EventListener)
    return () => window.removeEventListener('vtopCredentialsLinked', handleLinked as EventListener)
  }, [])
  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock background scroll and enable Esc to close while open
  useEffect(() => {
    if (!mounted) return
    const prevOverflow = document.body.style.overflow
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = prevOverflow
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mounted, isOpen, onClose])

  if (!mounted) return null

  return (
    <Drawer.Root open={effectiveOpen} onOpenChange={next => !next && onClose?.()} modal dismissible>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 mx-auto w-full md:w-auto max-w-full md:max-w-6xl rounded-t-[28px] md:rounded-t-3xl border-0 md:border border-border bg-background shadow-2xl z-50 flex flex-col overflow-hidden"
          style={{
            height: 'min(calc(var(--app-height, 100vh) - 16px), 96vh)',
            maxHeight: 'calc(var(--app-height, 100vh) - 8px)',
          }}
        >
          <Drawer.Title className="sr-only">Hub</Drawer.Title>
          <Drawer.Handle className="mx-auto mt-2 mb-1 h-1 w-16 rounded-full bg-border/70 md:bg-border" />
          <div className="flex items-center justify-between gap-2 px-4 pb-3 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md">
            <div className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">hub</div>
            <div className="flex items-center gap-2">
              {isSyncing && !locked && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> syncing
                </span>
              )}
              <Drawer.Close asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-full hover:bg-muted"
                  aria-label="Close hub"
                >
                  <X className="h-4 w-4" />
                </Button>
              </Drawer.Close>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {locked ? (
              <HubEmptyState onAction={onLink} />
            ) : (
              <HubShell
                actions={actions}
                syncing={isSyncing}
                onLink={() => {
                  setForceClose(true)
                  onClose?.()
                  onLink?.()
                }}
                preferences={preferences}
                visible={effectiveOpen}
              />
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function HubEmptyState({ onAction }: { onAction?: () => void }) {
  return (
    <div className="h-full flex items-center justify-center px-6 py-8 text-center">
      <div className="space-y-3">
        <div className="text-sm font-semibold uppercase text-muted-foreground">hub requires VTOP linking</div>
        <p className="text-2xl font-light text-foreground">
          link once to pull timetable, assignments, attendance and leave status directly inside chat.
        </p>
        <Button onClick={onAction} className="rounded-full px-6">
          link VTOP
        </Button>
      </div>
    </div>
  )
}
