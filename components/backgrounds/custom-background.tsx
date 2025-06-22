'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'

const Aurora = dynamic(() => import('@/components/backgrounds/aurora'), {
  ssr: false,
  loading: () => null,
})

const Beams = dynamic(() => import('@/components/backgrounds/beams'), {
  ssr: false,
  loading: () => null,
})

const Dither = dynamic(() => import('@/components/backgrounds/dither'), {
  ssr: false,
  loading: () => null,
})

export type BackgroundType = 'aurora' | 'beams' | 'dither' | 'gradient' | 'solid' | 'null'

export interface BackgroundConfig {
  type: BackgroundType
  enabled: boolean
  aurora?: {
    colorStops?: string[]
    amplitude?: number
    blend?: number
    speed?: number
  }
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
  dither?: {
    waveSpeed?: number
    waveFrequency?: number
    waveAmplitude?: number
    waveColor?: [number, number, number]
    colorNum?: number
    pixelSize?: number
    disableAnimation?: boolean
    enableMouseInteraction?: boolean
    mouseRadius?: number
  }
  gradient?: {
    colors: string[]
    direction?: 'to-br' | 'to-tr' | 'to-bl' | 'to-tl' | 'to-r' | 'to-l' | 'to-t' | 'to-b'
  }
  solid?: {
    color: string
  }
}

const defaultBackgroundConfig: BackgroundConfig = {
  type: 'null',
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
  dither: {
    waveSpeed: 0.05,
    waveFrequency: 3,
    waveAmplitude: 0.3,
    waveColor: [0.4, 0.6, 0.8],
    colorNum: 4,
    pixelSize: 2,
    disableAnimation: false,
    enableMouseInteraction: true,
    mouseRadius: 1,
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
  const [backgroundConfig, setBackgroundConfig] =
    useState<BackgroundConfig>(defaultBackgroundConfig)
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
            colorStops={
              backgroundConfig.aurora?.colorStops || defaultBackgroundConfig.aurora!.colorStops!
            }
            amplitude={
              backgroundConfig.aurora?.amplitude || defaultBackgroundConfig.aurora!.amplitude!
            }
            blend={backgroundConfig.aurora?.blend || defaultBackgroundConfig.aurora!.blend!}
            speed={backgroundConfig.aurora?.speed || defaultBackgroundConfig.aurora!.speed!}
          />
        )

      case 'beams':
        return (
          <Beams
            beamWidth={
              backgroundConfig.beams?.beamWidth || defaultBackgroundConfig.beams!.beamWidth!
            }
            beamHeight={
              backgroundConfig.beams?.beamHeight || defaultBackgroundConfig.beams!.beamHeight!
            }
            beamNumber={
              backgroundConfig.beams?.beamNumber || defaultBackgroundConfig.beams!.beamNumber!
            }
            lightColor={
              backgroundConfig.beams?.lightColor || defaultBackgroundConfig.beams!.lightColor!
            }
            speed={backgroundConfig.beams?.speed || defaultBackgroundConfig.beams!.speed!}
            noiseIntensity={
              backgroundConfig.beams?.noiseIntensity ||
              defaultBackgroundConfig.beams!.noiseIntensity!
            }
            scale={backgroundConfig.beams?.scale || defaultBackgroundConfig.beams!.scale!}
            rotation={backgroundConfig.beams?.rotation || defaultBackgroundConfig.beams!.rotation!}
          />
        )

      case 'dither':
        return (
          <Dither
            waveSpeed={
              backgroundConfig.dither?.waveSpeed || defaultBackgroundConfig.dither!.waveSpeed!
            }
            waveFrequency={
              backgroundConfig.dither?.waveFrequency || defaultBackgroundConfig.dither!.waveFrequency!
            }
            waveAmplitude={
              backgroundConfig.dither?.waveAmplitude || defaultBackgroundConfig.dither!.waveAmplitude!
            }
            waveColor={
              backgroundConfig.dither?.waveColor || defaultBackgroundConfig.dither!.waveColor!
            }
            colorNum={
              backgroundConfig.dither?.colorNum || defaultBackgroundConfig.dither!.colorNum!
            }
            pixelSize={
              backgroundConfig.dither?.pixelSize || defaultBackgroundConfig.dither!.pixelSize!
            }
            disableAnimation={
              backgroundConfig.dither?.disableAnimation || defaultBackgroundConfig.dither!.disableAnimation!
            }
            enableMouseInteraction={
              backgroundConfig.dither?.enableMouseInteraction || defaultBackgroundConfig.dither!.enableMouseInteraction!
            }
            mouseRadius={
              backgroundConfig.dither?.mouseRadius || defaultBackgroundConfig.dither!.mouseRadius!
            }
          />
        )

      case 'gradient':
        const gradientColors =
          backgroundConfig.gradient?.colors || defaultBackgroundConfig.gradient!.colors
        const direction =
          backgroundConfig.gradient?.direction || defaultBackgroundConfig.gradient!.direction
        const gradientClasses = `bg-gradient-${direction} from-[${gradientColors[0]}] via-[${gradientColors[1]}] to-[${gradientColors[2] || gradientColors[1]}]`

        return (
          <div className="absolute inset-0">
            <div className={`absolute inset-0 ${gradientClasses}`} />
          </div>
        )

      case 'solid':
        const solidColor = backgroundConfig.solid?.color || defaultBackgroundConfig.solid!.color
        return <div className="absolute inset-0" style={{ backgroundColor: solidColor }} />

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
