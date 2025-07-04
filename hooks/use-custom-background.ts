'use client'

import { useCallback } from 'react'
import type { BackgroundType, BackgroundConfig } from '@/components/backgrounds/custom-background'

export function useCustomBackground() {
  const updateBackgroundConfig = useCallback(async (config: Partial<BackgroundConfig>) => {
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backgroundConfig: config,
        }),
      })

      if (response.ok) {
        window.dispatchEvent(
          new CustomEvent('backgroundToggle', {
            detail: { config },
          })
        )
        return true
      }
      return false
    } catch (error) {
      console.error('Failed to update background config:', error)
      return false
    }
  }, [])

  const setBackgroundType = useCallback(
    async (type: BackgroundType, enabled: boolean = true) => {
      return updateBackgroundConfig({ type, enabled })
    },
    [updateBackgroundConfig]
  )

  const toggleBackground = useCallback(
    async (enabled: boolean) => {
      return updateBackgroundConfig({ enabled })
    },
    [updateBackgroundConfig]
  )

  const toggleAurora = useCallback(
    async (enabled: boolean) => {
      return updateBackgroundConfig({ type: 'aurora', enabled })
    },
    [updateBackgroundConfig]
  )

  return {
    updateBackgroundConfig,
    setBackgroundType,
    toggleBackground,
    toggleAurora,
  }
}
