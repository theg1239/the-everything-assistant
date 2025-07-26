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
        setShowCredentialsDialog(true)
      } else {
        setCommand(triggerCommand || 'attendance')
        setPendingToolCall({
          toolName: 'queryVTOP',
          args: { command: triggerCommand || 'attendance' },
          result: { requiresCredentials: true, command: triggerCommand || 'attendance' },
          toolCallId: triggerToolCallId || Date.now().toString(),
        })
        setShowCredentialsDialog(true)
      }
    }

    window.addEventListener('vtopLoginTrigger', handleVTOPLoginTrigger as EventListener)
    return () => {
      window.removeEventListener('vtopLoginTrigger', handleVTOPLoginTrigger as EventListener)
    }
  }, [toolInvocations, onCredentialsSubmit])
  useEffect(() => {
    if (toolInvocations && !showCredentialsDialog) {
      const vtopToolCall = toolInvocations.find(
        (tool) => 
          tool.toolName === 'queryVTOP' && 
          tool.result && 
          (tool.result.requiresCredentials === true ||
            (tool.result.error && tool.result.error.includes('VTOP credentials required')))
          && !tool.result.data && !tool.result.output &&
          !dismissedToolCallIds.has(tool.toolCallId)
      )
      if (vtopToolCall) {
        setPendingToolCall(vtopToolCall)
        setCommand(vtopToolCall.result.command || vtopToolCall.args?.command || 'VTOP command')
        setShowCredentialsDialog(true)
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
