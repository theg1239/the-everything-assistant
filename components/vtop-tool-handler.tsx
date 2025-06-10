"use client"

import React, { useState, useEffect } from "react"
import { VTOPCredentialsDialog } from "./vtop-credentials-dialog"

interface VTOPToolHandlerProps {
  children: React.ReactNode
  toolInvocations?: any[]
  onCredentialsSubmit?: (credentials: { username: string; encryptedPassword: string }, originalToolCall: any) => void
}

export function VTOPToolHandler({ children, toolInvocations, onCredentialsSubmit }: VTOPToolHandlerProps) {
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false)
  const [pendingToolCall, setPendingToolCall] = useState<any>(null)
  const [command, setCommand] = useState("")
  const [processedToolCalls, setProcessedToolCalls] = useState<Set<string>>(new Set())
  useEffect(() => {
    //console.log('VTOP Handler: Checking tool invocations', toolInvocations)
    
    if (toolInvocations) {
      const vtopToolCall = toolInvocations.find(
        (tool) => 
          tool.toolName === 'queryVTOP' && 
          tool.result && 
          tool.result.requiresCredentials === true &&
          !processedToolCalls.has(tool.toolCallId) &&
          !tool.result.data &&
          !tool.result.output
      )
      
      //console.log('VTOP Handler: Found tool requiring credentials:', vtopToolCall)
      
      if (vtopToolCall && !showCredentialsDialog) {
        //console.log('VTOP Handler: Setting up credentials dialog')
        setPendingToolCall(vtopToolCall)
        setCommand(vtopToolCall.result.command || vtopToolCall.args?.command || 'VTOP command')
        setShowCredentialsDialog(true)
        setProcessedToolCalls(prev => new Set([...prev, vtopToolCall.toolCallId]))
      }
    }
  }, [toolInvocations, showCredentialsDialog, processedToolCalls])

  const handleCredentialsSubmit = (credentials: { username: string; encryptedPassword: string }) => {
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
