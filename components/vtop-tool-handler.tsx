'use client'

import React, { useState, useEffect } from 'react'
import { VTOPCredentialsDialog } from './vtop-credentials-dialog'
import { hasVTOPCredentials, getFormattedVTOPCredentials } from '@/lib/vtop-credentials'
import { asRecord, readString } from '@/components/narrow'

/** Minimal shape of a (legacy) tool invocation this handler inspects. `result` is unvalidated. */
export type VTOPToolCall = {
  toolName?: string
  toolCallId?: string
  args?: Record<string, unknown>
  result?: unknown
  meta?: Record<string, unknown>
}

interface VTOPToolHandlerProps {
  children: React.ReactNode
  toolInvocations?: VTOPToolCall[]
  onCredentialsSubmit?: (
    credentials: { username: string; encryptedPassword: string },
    originalToolCall: VTOPToolCall
  ) => void
}

const commandOf = (tool: VTOPToolCall) =>
  readString(asRecord(tool.result)?.command) || readString(tool.args?.command)

const detailOf = (event: Event) => (event instanceof CustomEvent ? asRecord(event.detail) : null)

export function VTOPToolHandler({
  children,
  toolInvocations,
  onCredentialsSubmit,
}: VTOPToolHandlerProps) {
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false)
  const [pendingToolCall, setPendingToolCall] = useState<VTOPToolCall | null>(null)
  const [command, setCommand] = useState('')
  const [dismissedToolCallIds, setDismissedToolCallIds] = useState<Set<string>>(new Set())
  const [disclaimerShownIds] = useState<Set<string>>(new Set())

  const dispatchDisclaimer = (toolCall: VTOPToolCall | null, cmd: string) => {
    const id = toolCall?.toolCallId || `queryVTOP-${cmd}`
    if (disclaimerShownIds.has(id)) return
    disclaimerShownIds.add(id)
    try {
      const event = new CustomEvent('vtopCredentialsDisclaimer', {
        detail: {
          toolCallId: id,
          command: cmd,
          message:
            'To fetch your VTOP data, the assistant needs your VTOP credentials. Your credentials are stored locally and are optional; you can provide them so the assistant can answer your queries.',
        },
      })
      window.dispatchEvent(event)
    } catch {}
  }
  useEffect(() => {
    const handleVTOPLoginTrigger = (event: Event) => {
      const detail = detailOf(event)
      const triggerCommand = readString(detail?.command)
      const triggerToolCallId = readString(detail?.toolCallId)
      const linkOnly = detail?.linkOnly

      if (hasVTOPCredentials()) {
        const savedCredentials = getFormattedVTOPCredentials()
        if (savedCredentials && onCredentialsSubmit) {
          let vtopToolCall: VTOPToolCall | null | undefined = null
          if (triggerToolCallId) {
            vtopToolCall = toolInvocations?.find(tool => tool.toolCallId === triggerToolCallId)
          }

          if (!vtopToolCall) {
            vtopToolCall = {
              toolName: 'queryVTOP',
              args: { command: triggerCommand || 'attendance' },
              result: { requiresCredentials: true, command: triggerCommand || 'attendance' },
              toolCallId: triggerToolCallId || Date.now().toString(),
              meta: { linkOnly: !!linkOnly },
            }
          }

          onCredentialsSubmit(savedCredentials, vtopToolCall)
          return
        }
      }

      let vtopToolCall: VTOPToolCall | null | undefined = null

      if (triggerToolCallId) {
        vtopToolCall = toolInvocations?.find(tool => tool.toolCallId === triggerToolCallId)
      }

      if (!vtopToolCall) {
        vtopToolCall = toolInvocations?.find(tool => {
          const result = asRecord(tool.result)
          const error = readString(result?.error)
          return (
            tool.toolName === 'queryVTOP' &&
            result &&
            (result.requiresCredentials === true ||
              (error &&
                (error.includes('VTOP credentials required') ||
                  error.includes('credentials') ||
                  error.includes('Invalid LoginId/Password') ||
                  error.includes('Login failed')))) &&
            !result.data &&
            !result.output
          )
        })
      }

      const resolvedToolCall: VTOPToolCall = vtopToolCall
        ? {
            ...vtopToolCall,
            meta: {
              ...(vtopToolCall.meta || {}),
              linkOnly: vtopToolCall.meta?.linkOnly || !!linkOnly,
            },
          }
        : {
            toolName: 'queryVTOP',
            args: { command: triggerCommand || 'attendance' },
            result: { requiresCredentials: true, command: triggerCommand || 'attendance' },
            toolCallId: triggerToolCallId || Date.now().toString(),
            meta: { linkOnly: !!linkOnly },
          }

      const commandToRun = commandOf(resolvedToolCall) || triggerCommand || 'attendance'

      setCommand(commandToRun)
      setPendingToolCall(resolvedToolCall)
      dispatchDisclaimer(resolvedToolCall, commandToRun)
      if (linkOnly || resolvedToolCall.meta?.linkOnly) {
        setShowCredentialsDialog(true)
      }
    }

    window.addEventListener('vtopLoginTrigger', handleVTOPLoginTrigger)
    const handleOpenCredentials = (e: Event) => {
      const requestedId = detailOf(e)?.toolCallId
      if (requestedId && pendingToolCall && requestedId !== pendingToolCall.toolCallId) {
        if (toolInvocations) {
          const match = toolInvocations.find(t => t.toolCallId === requestedId)
          if (match) setPendingToolCall(match)
        }
      }
      if (pendingToolCall) setShowCredentialsDialog(true)
    }
    window.addEventListener('vtopOpenCredentials', handleOpenCredentials)
    return () => {
      window.removeEventListener('vtopLoginTrigger', handleVTOPLoginTrigger)
      window.removeEventListener('vtopOpenCredentials', handleOpenCredentials)
    }
  }, [toolInvocations, onCredentialsSubmit, pendingToolCall])
  useEffect(() => {
    if (toolInvocations && !showCredentialsDialog) {
      const vtopToolCall = toolInvocations.find(tool => {
        const result = asRecord(tool.result)
        const error = readString(result?.error)
        return (
          tool.toolName === 'queryVTOP' &&
          result &&
          (result.requiresCredentials === true ||
            (error && error.includes('VTOP credentials required'))) &&
          !result.data &&
          !result.output &&
          !(tool.toolCallId !== undefined && dismissedToolCallIds.has(tool.toolCallId))
        )
      })
      if (vtopToolCall) {
        setPendingToolCall(vtopToolCall)
        const cmd = commandOf(vtopToolCall) || 'VTOP command'
        setCommand(cmd)
        dispatchDisclaimer(vtopToolCall, cmd)
      }
    }
  }, [toolInvocations, showCredentialsDialog])

  const handleCredentialsSubmit = (credentials: {
    username: string
    encryptedPassword: string
  }) => {
    if (onCredentialsSubmit && pendingToolCall) {
      onCredentialsSubmit(credentials, pendingToolCall)
    }
    setShowCredentialsDialog(false)
    setPendingToolCall(null)
  }

  const handleCredentialsClose = () => {
    const pendingId = pendingToolCall?.toolCallId
    if (pendingId) {
      setDismissedToolCallIds(prev => {
        const next = new Set(prev)
        next.add(pendingId)
        return next
      })
    }
    setShowCredentialsDialog(false)
    setPendingToolCall(null)
  }

  return (
    <>
      {children}
      <VTOPCredentialsDialog
        isOpen={showCredentialsDialog}
        onClose={handleCredentialsClose}
        onSubmit={handleCredentialsSubmit}
        command={command}
      />
    </>
  )
}
