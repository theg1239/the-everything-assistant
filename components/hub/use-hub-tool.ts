'use client'

import { useCallback, useState } from 'react'
import type { HubToolRunState } from './types'

export function useHubTool<T = any>(toolName: string) {
  const [state, setState] = useState<HubToolRunState<T>>({ loading: false, error: null, result: null })

  const run = useCallback(async (args: Record<string, any>) => {
    setState({ loading: true, error: null, result: null })
    try {
      const res = await fetch('/api/hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName, args }),
      })
      const data = await res.json()
      if (!res.ok || data.success === false) {
        throw new Error(data?.error || 'Failed to execute tool')
      }
      setState({ loading: false, error: null, result: data.result as T })
      return data.result as T
    } catch (e: any) {
      setState({ loading: false, error: e?.message || 'Unknown error', result: null })
      throw e
    }
  }, [toolName])

  const reset = useCallback(() => setState({ loading: false, error: null, result: null }), [])

  return { ...state, run, reset }
}

