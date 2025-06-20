'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'

// Dynamically import background components
const Aurora = dynamic(() => import('@/components/aurora'), {
  ssr: false,
  loading: () => null,
})

const Beams = dynamic(() => import('@/components/beams'), {
  ssr: false,
  loading: () => null,
})

// Background types
export type BackgroundType = 'aurora' | 'beams' | 'gradient' | 'solid'

export interface BackgroundConfig {
  type: BackgroundType
  enabled: boolean
  // Aurora specific config
  aurora?: {
    colorStops?: string[]
    amplitude?: number
    blend?: number
    speed?: number
  }
  // Beams specific config
  beams?: {
    beamWidth?: number
    beamHeight?: number
    beamNumber?: number
    lightColor?: string
    speed?: number
    noiseIntensity?: number
    scale?: number
    rotation?: number
  }
  // Gradient specific config
  gradient?: {
    colors: string[]
    direction?: 'to-br' | 'to-tr' | 'to-bl' | 'to-tl' | 'to-r' | 'to-l' | 'to-t' | 'to-b'
  }
  // Solid color config
  solid?: {
    color: string
  }
}

const defaultBackgroundConfig: BackgroundConfig = {
  type: 'aurora',
  enabled: true,
  aurora: {
    colorStops: ['#5227FF', '#7cff67', '#5227FF'],
    amplitude: 1.2,
    blend: 0.6,
    speed: 0.8,
  },
  beams: {
    beamWidth: 2,
    beamHeight: 15,
    beamNumber: 12,
    lightColor: '#ffffff',
    speed: 2,
    noiseIntensity: 1.75,
    scale: 0.2,
    rotation: 0,
  },
  gradient: {
    colors: ['#1a1a2e', '#16213e', '#0f3460'],
    direction: 'to-br',
  },
  solid: {
    color: '#0a0a0a',
  },
}

export default function CustomBackground() {
  const { data: session, status } = useSession()
  const [backgroundConfig, setBackgroundConfig] = useState<BackgroundConfig>(defaultBackgroundConfig)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  useEffect(() => {
    const loadBackgroundPreference = async () => {
      if (status === 'unauthenticated' || !session?.user?.email) {
        setBackgroundConfig(defaultBackgroundConfig)
        setPreferencesLoaded(true)
        return
      }

      if (status === 'authenticated' && session?.user?.email) {
        try {
          const response = await fetch('/api/user/preferences')
          if (response.ok) {
            const data = await response.json()
            const prefs = data.preferences
            
            // Handle legacy aurora preference
            if (prefs.auroraBackground !== undefined) {
              setBackgroundConfig({
                ...defaultBackgroundConfig,
                type: 'aurora',
                enabled: prefs.auroraBackground,
              })
            } else if (prefs.backgroundConfig) {
              setBackgroundConfig({
                ...defaultBackgroundConfig,
                ...prefs.backgroundConfig,
              })
            } else {
              setBackgroundConfig(defaultBackgroundConfig)
            }
          }
        } catch (error) {
          console.error('Error loading background preference:', error)
          setBackgroundConfig(defaultBackgroundConfig)
        } finally {
          setPreferencesLoaded(true)
        }
      }
    }

    loadBackgroundPreference()
  }, [session?.user?.email, status])

  useEffect(() => {
    const handleBackgroundToggle = (event: CustomEvent<{ config: BackgroundConfig }>) => {
      setBackgroundConfig(event.detail.config)
    }

    const handleAuroraToggle = (event: CustomEvent<{ enabled: boolean }>) => {
      setBackgroundConfig(prev => ({
        ...prev,
        type: 'aurora',
        enabled: event.detail.enabled,
      }))
    }

    window.addEventListener('backgroundToggle', handleBackgroundToggle as EventListener)
    window.addEventListener('auroraToggle', handleAuroraToggle as EventListener)

    return () => {
      window.removeEventListener('backgroundToggle', handleBackgroundToggle as EventListener)
      window.removeEventListener('auroraToggle', handleAuroraToggle as EventListener)
    }
  }, [])

  const renderBackground = () => {
    if (!backgroundConfig.enabled) {
      return (
        <div className="absolute inset-0 bg-background">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
        </div>
      )
    }

    switch (backgroundConfig.type) {
      case 'aurora':
        return (
          <Aurora
            colorStops={backgroundConfig.aurora?.colorStops || defaultBackgroundConfig.aurora!.colorStops!}
            amplitude={backgroundConfig.aurora?.amplitude || defaultBackgroundConfig.aurora!.amplitude!}
            blend={backgroundConfig.aurora?.blend || defaultBackgroundConfig.aurora!.blend!}
            speed={backgroundConfig.aurora?.speed || defaultBackgroundConfig.aurora!.speed!}
          />
        )

      case 'beams':
        return (
          <Beams
            beamWidth={backgroundConfig.beams?.beamWidth || defaultBackgroundConfig.beams!.beamWidth!}
            beamHeight={backgroundConfig.beams?.beamHeight || defaultBackgroundConfig.beams!.beamHeight!}
            beamNumber={backgroundConfig.beams?.beamNumber || defaultBackgroundConfig.beams!.beamNumber!}
            lightColor={backgroundConfig.beams?.lightColor || defaultBackgroundConfig.beams!.lightColor!}
            speed={backgroundConfig.beams?.speed || defaultBackgroundConfig.beams!.speed!}
            noiseIntensity={backgroundConfig.beams?.noiseIntensity || defaultBackgroundConfig.beams!.noiseIntensity!}
            scale={backgroundConfig.beams?.scale || defaultBackgroundConfig.beams!.scale!}
            rotation={backgroundConfig.beams?.rotation || defaultBackgroundConfig.beams!.rotation!}
          />
        )

      case 'gradient':
        const gradientColors = backgroundConfig.gradient?.colors || defaultBackgroundConfig.gradient!.colors
        const direction = backgroundConfig.gradient?.direction || defaultBackgroundConfig.gradient!.direction
        const gradientClasses = `bg-gradient-${direction} from-[${gradientColors[0]}] via-[${gradientColors[1]}] to-[${gradientColors[2] || gradientColors[1]}]`
        
        return (
          <div className="absolute inset-0">
            <div className={`absolute inset-0 ${gradientClasses}`} />
          </div>
        )

      case 'solid':
        const solidColor = backgroundConfig.solid?.color || defaultBackgroundConfig.solid!.color
        return (
          <div className="absolute inset-0" style={{ backgroundColor: solidColor }} />
        )

      default:
        return (
          <div className="absolute inset-0 bg-background">
            <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
          </div>
        )
    }
  }

  if (!preferencesLoaded) {
    return (
      <div className="absolute inset-0 bg-background">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
      </div>
    )
  }

  return renderBackground()
}
