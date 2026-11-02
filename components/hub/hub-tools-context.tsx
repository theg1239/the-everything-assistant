'use client'

import { createContext, useContext } from 'react'
import type { HubToolArgs } from './types'

export type HubToolExecutor = (toolName: string, args?: HubToolArgs) => Promise<unknown>

const HubToolContext = createContext<HubToolExecutor | null>(null)

export function HubToolProvider({
  value,
  children,
}: {
  value: HubToolExecutor
  children: React.ReactNode
}) {
  return <HubToolContext.Provider value={value}>{children}</HubToolContext.Provider>
}

export function useHubToolExecutor() {
  const ctx = useContext(HubToolContext)
  if (!ctx) {
    throw new Error('Hub tool executor is unavailable in this component tree')
  }
  return ctx
}
