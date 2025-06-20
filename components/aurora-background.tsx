'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'

const Aurora = dynamic(() => import('@/components/aurora'), {
  ssr: false,
  loading: () => null,
})

export default function AuroraBackground() {
  const { data: session, status } = useSession()
  const [auroraEnabled, setAuroraEnabled] = useState(true)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  useEffect(() => {
    const loadAuroraPreference = async () => {
      if (status === 'unauthenticated' || !session?.user?.email) {
        setAuroraEnabled(true)
        setPreferencesLoaded(true)
        return
      }

      if (status === 'authenticated' && session?.user?.email) {
        try {
          const response = await fetch('/api/user/preferences')
          if (response.ok) {
            const data = await response.json()
            const prefs = data.preferences
            setAuroraEnabled(prefs.auroraBackground ?? true)
          }
        } catch (error) {
          console.error('Error loading aurora preference:', error)
          setAuroraEnabled(true)
        } finally {
          setPreferencesLoaded(true)
        }
      }
    }

    loadAuroraPreference()
  }, [session?.user?.email, status])

  useEffect(() => {
    const handleAuroraToggle = (event: CustomEvent<{ enabled: boolean }>) => {
      setAuroraEnabled(event.detail.enabled)
    }

    window.addEventListener('auroraToggle', handleAuroraToggle as EventListener)

    return () => {
      window.removeEventListener('auroraToggle', handleAuroraToggle as EventListener)
    }
  }, [])

  if (!preferencesLoaded) {
    return (
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
      </div>
    )
  }

  if (!auroraEnabled) {
    return (
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
      </div>
    )
  }

  return (
    <Aurora
      colorStops={['#5227FF', '#7cff67', '#5227FF']}
      amplitude={1.2}
      blend={0.6}
      speed={0.8}
    />
  )
}