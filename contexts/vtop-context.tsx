'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { useVTOPCredentialBootstrap } from '@/lib/vtop-credentials'

interface VTOPToolResult {
  toolCallId: string
  command: string
  result: unknown
  timestamp: number
}

interface VTOPContextType {
  toolResults: Map<string, VTOPToolResult>
  updateToolResult: (toolCallId: string, command: string, result: unknown) => void
  getToolResult: (toolCallId: string) => VTOPToolResult | undefined
  clearToolResult: (toolCallId: string) => void
  version: number
}

const VTOPContext = createContext<VTOPContextType | undefined>(undefined)

export function VTOPProvider({ children }: { children: React.ReactNode }) {
  const [toolResults, setToolResults] = useState<Map<string, VTOPToolResult>>(new Map())
  const [version, setVersion] = useState(0)
  // Warm the cached link status that the chat's synchronous VTOP checks read, and migrate
  // any pre-server-storage credential cookies into the encrypted server store.
  useVTOPCredentialBootstrap()

  const updateToolResult = useCallback((toolCallId: string, command: string, result: unknown) => {
    setToolResults(prev => {
      const newMap = new Map(prev)
      newMap.set(toolCallId, {
        toolCallId,
        command,
        result,
        timestamp: Date.now(),
      })
      return newMap
    })
    setVersion(prev => prev + 1)
  }, [])

  const getToolResult = useCallback(
    (toolCallId: string) => {
      return toolResults.get(toolCallId)
    },
    [toolResults]
  )

  const clearToolResult = useCallback((toolCallId: string) => {
    setToolResults(prev => {
      const newMap = new Map(prev)
      newMap.delete(toolCallId)
      return newMap
    })
  }, [])
  return (
    <VTOPContext.Provider
      value={{
        toolResults,
        updateToolResult,
        getToolResult,
        clearToolResult,
        version,
      }}
    >
      {children}
    </VTOPContext.Provider>
  )
}

export function useVTOP() {
  const context = useContext(VTOPContext)
  if (context === undefined) {
    throw new Error('useVTOP must be used within a VTOPProvider')
  }
  return context
}
