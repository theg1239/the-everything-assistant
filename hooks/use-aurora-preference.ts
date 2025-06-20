'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

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
          setAuroraEnabled(prefs.auroraBackground ?? true)
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

    window.addEventListener('auroraToggle', handleAuroraToggle as EventListener)

    return () => {
      window.removeEventListener('auroraToggle', handleAuroraToggle as EventListener)
    }
  }, [])

  return { auroraEnabled, isLoading }
}
