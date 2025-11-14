'use client'

import { useCallback, useMemo, useState } from 'react'
import type { HubToolRunState } from './types'
import { useHubToolExecutor } from './hub-tools-context'

export function useHubTool<T = any>(
  toolNameOrExecutor: string | ((args: Record<string, any>) => Promise<T>)
) {
  const contextExecutor = useHubToolExecutor()
  const executor = useMemo(() => {
    if (typeof toolNameOrExecutor === 'string') {
      return (args: Record<string, any>) => contextExecutor(toolNameOrExecutor, args)
    }
    return toolNameOrExecutor
  }, [toolNameOrExecutor, contextExecutor])
  const [state, setState] = useState<HubToolRunState<T>>({
    loading: false,
    error: null,
    result: null,
  })

  const run = useCallback(
    async (args: Record<string, any>) => {
      setState({ loading: true, error: null, result: null })
      try {
        const result = await executor(args)
        setState({ loading: false, error: null, result: result as T })
        return result as T
      } catch (e: any) {
        setState({ loading: false, error: e?.message || 'Unknown error', result: null })
        throw e
      }
    },
    [executor]
  )

  const reset = useCallback(() => setState({ loading: false, error: null, result: null }), [])

  return { ...state, run, reset }
}
