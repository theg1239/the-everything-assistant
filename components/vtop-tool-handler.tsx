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
  const [processedToolCalls, setProcessedToolCalls] = useState<Set<string>>(new Set())
  useEffect(() => {
    const handleVTOPLoginTrigger = (event: CustomEvent) => {
      const { command: triggerCommand, toolCallId: triggerToolCallId } = event.detail

      // First check if we have saved credentials and can auto-login
      if (hasVTOPCredentials()) {
        const savedCredentials = getFormattedVTOPCredentials()
        if (savedCredentials && onCredentialsSubmit) {
          // Find the relevant tool call
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

          // Auto-submit with saved credentials
          onCredentialsSubmit(savedCredentials, vtopToolCall)
          return
        }
      }

      // Fallback to manual credential entry
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
    if (toolInvocations) {
      // disable automatic credential detection - we now rely on manual button clicks
      // this was causing automatic dialog opening when we want users to click the login button
      // Keep this code commented for reference but don't auto-trigger
      /*
      const vtopToolCall = toolInvocations.find(
        (tool) => 
          tool.toolName === 'queryVTOP' && 
          tool.result && 
          tool.result.requiresCredentials === true &&
          !processedToolCalls.has(tool.toolCallId) &&
          !tool.result.data &&
          !tool.result.output
      )
      
      if (vtopToolCall && !showCredentialsDialog) {
        setPendingToolCall(vtopToolCall)
        setCommand(vtopToolCall.result.command || vtopToolCall.args?.command || 'VTOP command')
        setShowCredentialsDialog(true)
        setProcessedToolCalls(prev => new Set([...prev, vtopToolCall.toolCallId]))
      }
      */
    }
  }, [toolInvocations, showCredentialsDialog, processedToolCalls])

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
