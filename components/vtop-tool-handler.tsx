'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { VTOPCredentialsDialog } from './vtop-credentials-dialog'
import { hasVTOPCredentials, getFormattedVTOPCredentials } from '@/lib/vtop-credentials'

/**
 * Accepts either:
 *  - toolInvocations: legacy array like { toolCallId, toolName, args, result, state }
 *  - toolParts: v5 UIMessage parts with type 'tool-${name}', state, input/output, errorText
 */
interface VTOPToolHandlerProps {
  children: React.ReactNode
  toolInvocations?: any[]
  toolParts?: any[]
  onCredentialsSubmit?: (
    credentials: { username: string; encryptedPassword: string },
    originalToolCall: any
  ) => void
}

export function VTOPToolHandler({
  children,
  toolInvocations,
  toolParts,
  onCredentialsSubmit,
}: VTOPToolHandlerProps) {
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false)
  const [pendingToolCall, setPendingToolCall] = useState<any>(null)
  const [command, setCommand] = useState('')
  const [dismissedToolCallIds, setDismissedToolCallIds] = useState<Set<string>>(new Set())
  const [disclaimerShownIds] = useState<Set<string>>(new Set())

  // Normalize v5 tool parts to legacy invocation objects your UI expects
  const invocations: any[] | undefined = useMemo(() => {
    if (toolInvocations && toolInvocations.length) return toolInvocations
    if (!toolParts || !Array.isArray(toolParts)) return undefined

    const mapped = toolParts
      .filter((p: any) => p && typeof p.type === 'string' && p.type.startsWith('tool-'))
      .map((p: any) => {
        const toolName = p.type.replace(/^tool-/, '')
        // Map v5 part states to your legacy 'state'
        const state =
          p.state === 'output-available' || p.state === 'output-error' ? 'result' : 'call'

        // Map input/output/error
        const args = p.input ?? p.args
        let result: any = undefined
        if (p.state === 'output-available') {
          result = p.output
        } else if (p.state === 'output-error') {
          result = { success: false, error: p.errorText || 'Tool error' }
        }

        return {
          toolCallId: p.toolCallId || `${toolName}-${Date.now()}`,
          toolName,
          args,
          result,
          state,
        }
      })

    return mapped
  }, [toolInvocations, toolParts])

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
      const { command: triggerCommand, toolCallId: triggerToolCallId } = (event as any).detail || {}

      if (hasVTOPCredentials()) {
        const savedCredentials = getFormattedVTOPCredentials()
        if (savedCredentials && onCredentialsSubmit) {
          let vtopToolCall = null
          if (triggerToolCallId && invocations) {
            vtopToolCall = invocations.find(tool => tool.toolCallId === triggerToolCallId)
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

      if (triggerToolCallId && invocations) {
        vtopToolCall = invocations.find(tool => tool.toolCallId === triggerToolCallId)
      }

      if (!vtopToolCall && invocations) {
        vtopToolCall = invocations.find(
          tool =>
            tool.toolName === 'queryVTOP' &&
            tool.result &&
            (tool.result.requiresCredentials === true ||
              (tool.result.error &&
                (tool.result.error.includes?.('VTOP credentials required') ||
                  tool.result.error.includes?.('credentials') ||
                  tool.result.error.includes?.('Invalid LoginId/Password') ||
                  tool.result.error.includes?.('Login failed')))) &&
            !tool.result.data &&
            !tool.result.output
        )
      }

      if (vtopToolCall) {
        setCommand(
          vtopToolCall.result?.command ||
            vtopToolCall.args?.command ||
            triggerCommand ||
            'attendance'
        )
        setPendingToolCall(vtopToolCall)
        // Show disclaimer on chat before opening dialog
        dispatchDisclaimer(
          vtopToolCall,
          vtopToolCall.result?.command ||
            vtopToolCall.args?.command ||
            triggerCommand ||
            'attendance'
        )
      } else {
        setCommand(triggerCommand || 'attendance')
        const syntheticCallId = triggerToolCallId || Date.now().toString()
        setPendingToolCall({
          toolName: 'queryVTOP',
          args: { command: triggerCommand || 'attendance' },
          result: { requiresCredentials: true, command: triggerCommand || 'attendance' },
          toolCallId: syntheticCallId,
        })
        // Show disclaimer for synthetic call
        const synthetic = {
          toolCallId: syntheticCallId,
          args: { command: triggerCommand || 'attendance' },
          result: { requiresCredentials: true, command: triggerCommand || 'attendance' },
        }
        dispatchDisclaimer(synthetic, triggerCommand || 'attendance')
      }
    }

    window.addEventListener('vtopLoginTrigger', handleVTOPLoginTrigger as EventListener)

    const handleOpenCredentials = (e: CustomEvent) => {
      const requestedId = (e as any).detail?.toolCallId
      if (requestedId && pendingToolCall && requestedId !== pendingToolCall.toolCallId && invocations) {
        const match = invocations.find(t => t.toolCallId === requestedId)
        if (match) setPendingToolCall(match)
      }
      if (pendingToolCall) setShowCredentialsDialog(true)
    }

    window.addEventListener('vtopOpenCredentials', handleOpenCredentials as EventListener)
    return () => {
      window.removeEventListener('vtopLoginTrigger', handleVTOPLoginTrigger as EventListener)
      window.removeEventListener('vtopOpenCredentials', handleOpenCredentials as EventListener)
    }
  }, [invocations, onCredentialsSubmit, pendingToolCall])

  useEffect(() => {
    if (invocations && !showCredentialsDialog) {
      const vtopToolCall = invocations.find(
        tool =>
          tool.toolName === 'queryVTOP' &&
          tool.result &&
          (tool.result.requiresCredentials === true ||
            (tool.result.error && tool.result.error.includes?.('VTOP credentials required'))) &&
          !tool.result.data &&
          !tool.result.output &&
          !dismissedToolCallIds.has(tool.toolCallId)
      )
      if (vtopToolCall) {
        setPendingToolCall(vtopToolCall)
        const cmd = vtopToolCall.result?.command || vtopToolCall.args?.command || 'VTOP command'
        setCommand(cmd)
        dispatchDisclaimer(vtopToolCall, cmd)
      }
    }
  }, [invocations, showCredentialsDialog, dismissedToolCallIds])

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
