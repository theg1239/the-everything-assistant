'use client'

import React, { useState, useEffect } from 'react'
import { VTOPCredentialsDialog } from './vtop-credentials-dialog'
import { hasVTOPCredentials, getFormattedVTOPCredentials } from '@/lib/vtop-credentials'

interface VTOPToolHandlerProps {
  children: React.ReactNode
  toolInvocations?: any[]
  onCredentialsSubmit?: (
    credentials: { username: string; encryptedPassword: string },
    originalToolCall: any
  ) => void
}

export function VTOPToolHandler({
  children,
  toolInvocations,
  onCredentialsSubmit,
}: VTOPToolHandlerProps) {
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false)
  const [pendingToolCall, setPendingToolCall] = useState<any>(null)
  const [command, setCommand] = useState('')
  const [dismissedToolCallIds, setDismissedToolCallIds] = useState<Set<string>>(new Set())
  const [disclaimerShownIds] = useState<Set<string>>(new Set())

  const dispatchDisclaimer = (toolCall: any, cmd: string) => {
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
    const handleVTOPLoginTrigger = (event: CustomEvent) => {
      const { command: triggerCommand, toolCallId: triggerToolCallId } = event.detail

      if (hasVTOPCredentials()) {
        const savedCredentials = getFormattedVTOPCredentials()
        if (savedCredentials && onCredentialsSubmit) {
          let vtopToolCall = null
          if (triggerToolCallId) {
            vtopToolCall = toolInvocations?.find(tool => tool.toolCallId === triggerToolCallId)
          }

          if (!vtopToolCall) {
            vtopToolCall = {
              toolName: 'queryVTOP',
              args: { command: triggerCommand || 'attendance' },
              result: { requiresCredentials: true, command: triggerCommand || 'attendance' },
              toolCallId: triggerToolCallId || Date.now().toString(),
            }
          }

          onCredentialsSubmit(savedCredentials, vtopToolCall)
          return
        }
      }

      let vtopToolCall = null

      if (triggerToolCallId) {
        vtopToolCall = toolInvocations?.find(tool => tool.toolCallId === triggerToolCallId)
      }

      if (!vtopToolCall) {
        vtopToolCall = toolInvocations?.find(
          tool =>
            tool.toolName === 'queryVTOP' &&
            tool.result &&
            (tool.result.requiresCredentials === true ||
              (tool.result.error &&
                (tool.result.error.includes('VTOP credentials required') ||
                  tool.result.error.includes('credentials') ||
                  tool.result.error.includes('Invalid LoginId/Password') ||
                  tool.result.error.includes('Login failed')))) &&
            !tool.result.data &&
            !tool.result.output
        )
      }

      if (vtopToolCall) {
        setCommand(
          vtopToolCall.result.command ||
            vtopToolCall.args?.command ||
            triggerCommand ||
            'attendance'
        )
        setPendingToolCall(vtopToolCall)
        // Show disclaimer on chat before opening dialog
        dispatchDisclaimer(
          vtopToolCall,
          vtopToolCall.result.command ||
            vtopToolCall.args?.command ||
            triggerCommand ||
            'attendance'
        )
      } else {
        setCommand(triggerCommand || 'attendance')
        setPendingToolCall({
          toolName: 'queryVTOP',
          args: { command: triggerCommand || 'attendance' },
          result: { requiresCredentials: true, command: triggerCommand || 'attendance' },
          toolCallId: triggerToolCallId || Date.now().toString(),
        })
        // Show disclaimer for synthetic call
        const synthetic = {
          toolCallId: triggerToolCallId || Date.now().toString(),
          args: { command: triggerCommand || 'attendance' },
          result: { requiresCredentials: true, command: triggerCommand || 'attendance' },
        }
        dispatchDisclaimer(synthetic, triggerCommand || 'attendance')
      }
    }

    window.addEventListener('vtopLoginTrigger', handleVTOPLoginTrigger as EventListener)
    const handleOpenCredentials = (e: CustomEvent) => {
      // Optionally ensure the pending tool call matches
      const requestedId = e.detail?.toolCallId
      if (requestedId && pendingToolCall && requestedId !== pendingToolCall.toolCallId) {
        // If user explicitly opened a different tool call, attempt to locate it
        if (toolInvocations) {
          const match = toolInvocations.find(t => t.toolCallId === requestedId)
          if (match) setPendingToolCall(match)
        }
      }
      if (pendingToolCall) setShowCredentialsDialog(true)
    }
    window.addEventListener('vtopOpenCredentials', handleOpenCredentials as EventListener)
    return () => {
      window.removeEventListener('vtopLoginTrigger', handleVTOPLoginTrigger as EventListener)
      window.removeEventListener('vtopOpenCredentials', handleOpenCredentials as EventListener)
    }
  }, [toolInvocations, onCredentialsSubmit, pendingToolCall])
  useEffect(() => {
    if (toolInvocations && !showCredentialsDialog) {
      const vtopToolCall = toolInvocations.find(
        tool =>
          tool.toolName === 'queryVTOP' &&
          tool.result &&
          (tool.result.requiresCredentials === true ||
            (tool.result.error && tool.result.error.includes('VTOP credentials required'))) &&
          !tool.result.data &&
          !tool.result.output &&
          !dismissedToolCallIds.has(tool.toolCallId)
      )
      if (vtopToolCall) {
        setPendingToolCall(vtopToolCall)
        const cmd = vtopToolCall.result.command || vtopToolCall.args?.command || 'VTOP command'
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
    if (pendingToolCall && pendingToolCall.toolCallId) {
      setDismissedToolCallIds(prev => {
        const next = new Set(prev)
        next.add(pendingToolCall.toolCallId)
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
