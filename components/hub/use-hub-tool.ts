'use client'

import { useCallback, useMemo, useState } from 'react'
import type { HubToolArgs, HubToolRunState } from './types'
import { useHubToolExecutor } from './hub-tools-context'
import { errorMessage } from '@/components/narrow'

export type HubToolHandle<T> = HubToolRunState<T> & {
  run: (args: HubToolArgs) => Promise<T>
  reset: () => void
}

/** Runs a named hub tool through the context executor; the result is unvalidated (`unknown`). */
export function useHubTool(toolName: string): HubToolHandle<unknown>
/** Runs a custom executor whose result type is known to the caller. */
export function useHubTool<T>(executor: (args: HubToolArgs) => Promise<T>): HubToolHandle<T>
export function useHubTool(
  toolNameOrExecutor: string | ((args: HubToolArgs) => Promise<unknown>)
): HubToolHandle<unknown> {
  const contextExecutor = useHubToolExecutor()
  const executor = useMemo(() => {
    if (typeof toolNameOrExecutor === 'string') {
      return (args: HubToolArgs) => contextExecutor(toolNameOrExecutor, args)
    }
    return toolNameOrExecutor
  }, [toolNameOrExecutor, contextExecutor])
  const [state, setState] = useState<HubToolRunState<unknown>>({
    loading: false,
    error: null,
    result: null,
  })

  const run = useCallback(
    async (args: HubToolArgs) => {
      setState({ loading: true, error: null, result: null })
      try {
        const result = await executor(args)
        setState({ loading: false, error: null, result })
        return result
      } catch (e) {
        setState({ loading: false, error: errorMessage(e) || 'Unknown error', result: null })
        throw e
      }
    },
    [executor]
  )

  const reset = useCallback(() => setState({ loading: false, error: null, result: null }), [])

  return { ...state, run, reset }
}
