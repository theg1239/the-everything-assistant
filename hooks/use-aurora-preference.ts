'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import type { BackgroundConfig } from '@/components/custom-background'

export function useAuroraPreference() {
  const { data: session } = useSession()
  const [auroraEnabled, setAuroraEnabled] = useState(true)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadAuroraPreference = async () => {
      if (!session?.user?.email) {
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch('/api/user/preferences')
        if (response.ok) {
          const data = await response.json()
          const prefs = data.preferences
          
          if (prefs.backgroundConfig) {
            const config = prefs.backgroundConfig as BackgroundConfig
            setAuroraEnabled(config.type === 'aurora' && config.enabled)
          } else {
            setAuroraEnabled(prefs.auroraBackground ?? true)
          }
        }
      } catch (error) {
        console.error('Error loading aurora preference:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadAuroraPreference()
  }, [session?.user?.email])

  useEffect(() => {
    const handleAuroraToggle = (event: CustomEvent<{ enabled: boolean }>) => {
      setAuroraEnabled(event.detail.enabled)
    }

    const handleBackgroundToggle = (event: CustomEvent<{ config: BackgroundConfig }>) => {
      const config = event.detail.config
      setAuroraEnabled(config.type === 'aurora' && config.enabled)
    }

    window.addEventListener('auroraToggle', handleAuroraToggle as EventListener)
    window.addEventListener('backgroundToggle', handleBackgroundToggle as EventListener)

    return () => {
      window.removeEventListener('auroraToggle', handleAuroraToggle as EventListener)
      window.removeEventListener('backgroundToggle', handleBackgroundToggle as EventListener)
    }
  }, [])

  return { auroraEnabled, isLoading }
}
