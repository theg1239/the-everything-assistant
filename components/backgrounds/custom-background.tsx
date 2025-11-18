'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { readJson } from '@/lib/http'
import type { UserPreferencesResponse } from '@/types/preferences'

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

const FloatingLines = dynamic(() => import('@/components/backgrounds/floating-lines'), {
  ssr: false,
  loading: () => null,
})

const TerminalBackground = dynamic(() => import('@/components/backgrounds/terminal'), {
  ssr: false,
  loading: () => null,
})

const ColorBands = dynamic(() => import('@/components/backgrounds/color-bands'), {
  ssr: false,
  loading: () => null,
})

const GridBackground = dynamic(() => import('@/components/backgrounds/grid'), {
  ssr: false,
  loading: () => null,
})

const BACKGROUND_TYPES = [
  'aurora',
  'beams',
  'dither',
  'floating-lines',
  'terminal',
  'grid',
  'color-bands',
  'gradient',
  'solid',
  'null',
] as const satisfies readonly BackgroundType[]

export type BackgroundType =
  | 'aurora'
  | 'beams'
  | 'dither'
  | 'floating-lines'
  | 'terminal'
  | 'grid'
  | 'color-bands'
  | 'gradient'
  | 'solid'
  | 'null'

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
  floatingLines?: {
    linesGradient?: string[]
    enabledWaves?: Array<'top' | 'middle' | 'bottom'>
    animationSpeed?: number
    parallaxStrength?: number
  }
  terminal?: {
    scale?: number
    gridMul?: [number, number]
    digitSize?: number
    timeScale?: number
    scanlineIntensity?: number
    glitchAmount?: number
    flickerAmount?: number
    noiseAmp?: number
    chromaticAberration?: number
    dither?: number | boolean
    curvature?: number
    tint?: string
    mouseReact?: boolean
    mouseStrength?: number
    brightness?: number
    backgroundColor?: string
    overlayOpacity?: number
  }
  grid?: {
    lineThickness?: number
    linesColor?: string
    scanColor?: string
    scanOpacity?: number
    gridScale?: number
    lineStyle?: 'solid' | 'dashed' | 'dotted'
    lineJitter?: number
    noiseIntensity?: number
    scanDirection?: 'forward' | 'backward' | 'pingpong'
    scanGlow?: number
    scanSoftness?: number
    scanPhaseTaper?: number
    scanDuration?: number
    scanDelay?: number
    enablePost?: boolean
  }
  colorBands?: {
    colors?: string[]
    transparent?: boolean
    rotation?: number
    speed?: number
    autoRotate?: number
    scale?: number
    frequency?: number
    warpStrength?: number
    mouseInfluence?: number
    parallax?: number
    noise?: number
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
  type: 'aurora',
  enabled: false,
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
  floatingLines: {
    linesGradient: ['#8b5cf6', '#0ea5e9', '#14b8a6'],
    enabledWaves: ['top', 'middle', 'bottom'],
    animationSpeed: 1.2,
    parallaxStrength: 0.35,
  },
  terminal: {
    scale: 1,
    gridMul: [2, 1],
    digitSize: 1.3,
    timeScale: 0.3,
    scanlineIntensity: 0.25,
    glitchAmount: 0.85,
    flickerAmount: 0.35,
    noiseAmp: 0.45,
    chromaticAberration: 0.001,
    dither: 0.35,
    curvature: 0.1,
    tint: '#2fd4c8',
    mouseReact: true,
    mouseStrength: 0.2,
    brightness: 0.9,
    backgroundColor: '#030712',
    overlayOpacity: 0.5,
  },
  colorBands: {
    colors: ['#22d3ee', '#3b82f6', '#a855f7', '#f97316'],
    transparent: true,
    rotation: 32,
    speed: 0.35,
    autoRotate: 5,
    scale: 1.1,
    frequency: 0.9,
    warpStrength: 1.5,
    mouseInfluence: 0.5,
    parallax: 0.4,
    noise: 0.08,
  },
  grid: {
    lineThickness: 1.1,
    linesColor: '#2dd4ff',
    scanColor: '#f472b6',
    scanOpacity: 0.45,
    gridScale: 0.12,
    lineStyle: 'dashed',
    lineJitter: 0.08,
    noiseIntensity: 0.02,
    scanDirection: 'pingpong',
    scanGlow: 0.6,
    scanSoftness: 2,
    scanPhaseTaper: 0.85,
    scanDuration: 2.5,
    scanDelay: 2.5,
    enablePost: true,
  },
  gradient: {
    colors: ['#1a1a2e', '#16213e', '#0f3460'],
    direction: 'to-br',
  },
  solid: {
    color: '#0a0a0a',
  },
}

type StoredBackgroundConfig = Partial<Omit<BackgroundConfig, 'type'>> & { type?: string }

const ensureBackgroundType = (value?: string): BackgroundType => {
  return value && (BACKGROUND_TYPES as readonly string[]).includes(value)
    ? (value as BackgroundType)
    : defaultBackgroundConfig.type
}

const normalizeBackgroundConfig = (config?: StoredBackgroundConfig): BackgroundConfig => ({
  ...defaultBackgroundConfig,
  ...(config || {}),
  type: ensureBackgroundType(config?.type),
})

export default function CustomBackground() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const [backgroundConfig, setBackgroundConfig] = useState<BackgroundConfig>(() => ({
    ...defaultBackgroundConfig,
  }))
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  const isLoginPage = pathname === '/login'

  useEffect(() => {
    const loadBackgroundPreference = async () => {
      if (isLoginPage) {
        setBackgroundConfig(normalizeBackgroundConfig({ type: 'aurora', enabled: true }))
        setPreferencesLoaded(true)
        return
      }

      if (status === 'unauthenticated' || !session?.user?.email) {
        setBackgroundConfig(normalizeBackgroundConfig())
        setPreferencesLoaded(true)
        return
      }

      if (status === 'authenticated' && session?.user?.email) {
        try {
          const response = await fetch('/api/user/preferences')
          if (response.ok) {
            const data = await readJson<UserPreferencesResponse>(response)
            const prefs = data.preferences

            if (prefs.auroraBackground !== undefined) {
              setBackgroundConfig(
                normalizeBackgroundConfig({ type: 'aurora', enabled: prefs.auroraBackground })
              )
            } else if (prefs.backgroundConfig) {
              setBackgroundConfig(normalizeBackgroundConfig(prefs.backgroundConfig))
            } else {
              setBackgroundConfig(normalizeBackgroundConfig())
            }
          }
        } catch (error) {
          console.error('Error loading background preference:', error)
          setBackgroundConfig(normalizeBackgroundConfig())
        } finally {
          setPreferencesLoaded(true)
        }
      }
    }

    loadBackgroundPreference()
  }, [session?.user?.email, status, isLoginPage])

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
              backgroundConfig.dither?.waveFrequency ||
              defaultBackgroundConfig.dither!.waveFrequency!
            }
            waveAmplitude={
              backgroundConfig.dither?.waveAmplitude ||
              defaultBackgroundConfig.dither!.waveAmplitude!
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
              backgroundConfig.dither?.disableAnimation ||
              defaultBackgroundConfig.dither!.disableAnimation!
            }
            enableMouseInteraction={
              backgroundConfig.dither?.enableMouseInteraction ||
              defaultBackgroundConfig.dither!.enableMouseInteraction!
            }
            mouseRadius={
              backgroundConfig.dither?.mouseRadius || defaultBackgroundConfig.dither!.mouseRadius!
            }
          />
        )

      case 'floating-lines':
        return (
          <FloatingLines
            linesGradient={
              backgroundConfig.floatingLines?.linesGradient ||
              defaultBackgroundConfig.floatingLines!.linesGradient!
            }
            enabledWaves={
              backgroundConfig.floatingLines?.enabledWaves ||
              defaultBackgroundConfig.floatingLines!.enabledWaves!
            }
            animationSpeed={
              backgroundConfig.floatingLines?.animationSpeed ||
              defaultBackgroundConfig.floatingLines!.animationSpeed!
            }
            parallaxStrength={
              backgroundConfig.floatingLines?.parallaxStrength ||
              defaultBackgroundConfig.floatingLines!.parallaxStrength!
            }
          />
        )
      case 'terminal':
        return (
          <TerminalBackground
            scale={backgroundConfig.terminal?.scale ?? defaultBackgroundConfig.terminal!.scale}
            gridMul={
              backgroundConfig.terminal?.gridMul ?? defaultBackgroundConfig.terminal!.gridMul
            }
            digitSize={
              backgroundConfig.terminal?.digitSize ?? defaultBackgroundConfig.terminal!.digitSize
            }
            timeScale={
              backgroundConfig.terminal?.timeScale ?? defaultBackgroundConfig.terminal!.timeScale
            }
            scanlineIntensity={
              backgroundConfig.terminal?.scanlineIntensity ??
              defaultBackgroundConfig.terminal!.scanlineIntensity
            }
            glitchAmount={
              backgroundConfig.terminal?.glitchAmount ??
              defaultBackgroundConfig.terminal!.glitchAmount
            }
            flickerAmount={
              backgroundConfig.terminal?.flickerAmount ??
              defaultBackgroundConfig.terminal!.flickerAmount
            }
            noiseAmp={
              backgroundConfig.terminal?.noiseAmp ?? defaultBackgroundConfig.terminal!.noiseAmp
            }
            chromaticAberration={
              backgroundConfig.terminal?.chromaticAberration ??
              defaultBackgroundConfig.terminal!.chromaticAberration
            }
            dither={backgroundConfig.terminal?.dither ?? defaultBackgroundConfig.terminal!.dither}
            curvature={
              backgroundConfig.terminal?.curvature ?? defaultBackgroundConfig.terminal!.curvature
            }
            tint={backgroundConfig.terminal?.tint ?? defaultBackgroundConfig.terminal!.tint}
            mouseReact={
              backgroundConfig.terminal?.mouseReact ?? defaultBackgroundConfig.terminal!.mouseReact
            }
            mouseStrength={
              backgroundConfig.terminal?.mouseStrength ??
              defaultBackgroundConfig.terminal!.mouseStrength
            }
            brightness={
              backgroundConfig.terminal?.brightness ?? defaultBackgroundConfig.terminal!.brightness
            }
            backgroundColor={
              backgroundConfig.terminal?.backgroundColor ??
              defaultBackgroundConfig.terminal!.backgroundColor
            }
            overlayOpacity={
              backgroundConfig.terminal?.overlayOpacity ??
              defaultBackgroundConfig.terminal!.overlayOpacity
            }
          />
        )

      case 'color-bands':
        return (
          <ColorBands
            colors={
              backgroundConfig.colorBands?.colors || defaultBackgroundConfig.colorBands!.colors
            }
            transparent={
              backgroundConfig.colorBands?.transparent ??
              defaultBackgroundConfig.colorBands!.transparent!
            }
            rotation={
              backgroundConfig.colorBands?.rotation ?? defaultBackgroundConfig.colorBands!.rotation
            }
            speed={backgroundConfig.colorBands?.speed ?? defaultBackgroundConfig.colorBands!.speed}
            autoRotate={
              backgroundConfig.colorBands?.autoRotate ??
              defaultBackgroundConfig.colorBands!.autoRotate
            }
            scale={backgroundConfig.colorBands?.scale ?? defaultBackgroundConfig.colorBands!.scale}
            frequency={
              backgroundConfig.colorBands?.frequency ??
              defaultBackgroundConfig.colorBands!.frequency
            }
            warpStrength={
              backgroundConfig.colorBands?.warpStrength ??
              defaultBackgroundConfig.colorBands!.warpStrength
            }
            mouseInfluence={
              backgroundConfig.colorBands?.mouseInfluence ??
              defaultBackgroundConfig.colorBands!.mouseInfluence
            }
            parallax={
              backgroundConfig.colorBands?.parallax ?? defaultBackgroundConfig.colorBands!.parallax
            }
            noise={backgroundConfig.colorBands?.noise ?? defaultBackgroundConfig.colorBands!.noise}
          />
        )

      case 'grid':
        return (
          <GridBackground
            className="absolute inset-0"
            lineThickness={
              backgroundConfig.grid?.lineThickness ?? defaultBackgroundConfig.grid!.lineThickness
            }
            linesColor={
              backgroundConfig.grid?.linesColor ?? defaultBackgroundConfig.grid!.linesColor
            }
            scanColor={backgroundConfig.grid?.scanColor ?? defaultBackgroundConfig.grid!.scanColor}
            scanOpacity={
              backgroundConfig.grid?.scanOpacity ?? defaultBackgroundConfig.grid!.scanOpacity
            }
            gridScale={backgroundConfig.grid?.gridScale ?? defaultBackgroundConfig.grid!.gridScale}
            lineStyle={backgroundConfig.grid?.lineStyle ?? defaultBackgroundConfig.grid!.lineStyle}
            lineJitter={
              backgroundConfig.grid?.lineJitter ?? defaultBackgroundConfig.grid!.lineJitter
            }
            noiseIntensity={
              backgroundConfig.grid?.noiseIntensity ?? defaultBackgroundConfig.grid!.noiseIntensity
            }
            scanDirection={
              backgroundConfig.grid?.scanDirection ?? defaultBackgroundConfig.grid!.scanDirection
            }
            scanGlow={backgroundConfig.grid?.scanGlow ?? defaultBackgroundConfig.grid!.scanGlow}
            scanSoftness={
              backgroundConfig.grid?.scanSoftness ?? defaultBackgroundConfig.grid!.scanSoftness
            }
            scanPhaseTaper={
              backgroundConfig.grid?.scanPhaseTaper ?? defaultBackgroundConfig.grid!.scanPhaseTaper
            }
            scanDuration={
              backgroundConfig.grid?.scanDuration ?? defaultBackgroundConfig.grid!.scanDuration
            }
            scanDelay={backgroundConfig.grid?.scanDelay ?? defaultBackgroundConfig.grid!.scanDelay}
            enablePost={
              backgroundConfig.grid?.enablePost ?? defaultBackgroundConfig.grid!.enablePost
            }
            enableWebcam={false}
            showPreview={false}
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
