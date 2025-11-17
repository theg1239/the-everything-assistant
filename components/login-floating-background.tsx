'use client'

import { useState, type ComponentType } from 'react'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'

type LoginFloatingBackgroundProps = {
  children: React.ReactNode
  className?: string
}

const FloatingLinesBackground = dynamic(() => import('@/components/backgrounds/floating-lines'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#05060b]" />,
})

const ColorBandsBackground = dynamic(() => import('@/components/backgrounds/color-bands'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#05060b]" />,
})

const AuroraBackground = dynamic(() => import('@/components/backgrounds/aurora'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#05060b]" />,
})

const BeamsBackground = dynamic(() => import('@/components/backgrounds/beams'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#05060b]" />,
})

const DitherBackground = dynamic(() => import('@/components/backgrounds/dither'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#05060b]" />,
})

const TerminalBackground = dynamic(() => import('@/components/backgrounds/terminal'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#05060b]" />,
})

const GridBackground = dynamic(() => import('@/components/backgrounds/grid'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#05060b]" />,
})

const SolidBackdrop = () => <div className="w-full h-full bg-[#030712]" />

type BackgroundVariant = {
  key: string
  Component: ComponentType<any>
  props?: Record<string, any>
}

const fallbackVariant: BackgroundVariant = {
  key: 'floating-lines-fallback',
  Component: FloatingLinesBackground,
  props: {
    linesGradient: ['#8b5cf6', '#0ea5e9', '#14b8a6'],
    lineCount: [8, 6, 4],
    lineDistance: [6, 8, 10],
    animationSpeed: 1.2,
    parallaxStrength: 0.35,
    interactive: false,
  },
}

const BACKGROUND_VARIANTS: BackgroundVariant[] = [
  fallbackVariant,
  {
    key: 'floating-lines',
    Component: FloatingLinesBackground,
    props: {
      linesGradient: ['#8b5cf6', '#0ea5e9', '#14b8a6'],
      lineCount: [10, 7, 5],
      lineDistance: [5, 7, 9],
      animationSpeed: 0.95,
      parallaxStrength: 0.25,
      interactive: false,
    },
  },
  {
    key: 'color-bands',
    Component: ColorBandsBackground,
    props: {
      colors: ['#22d3ee', '#3b82f6', '#a855f7', '#f97316'],
      transparent: true,
      rotation: 24,
      speed: 0.25,
      autoRotate: 6,
      scale: 1.05,
      frequency: 0.8,
      warpStrength: 1,
      noise: 0.04,
    },
  },
  {
    key: 'aurora',
    Component: AuroraBackground,
    props: {
      colorStops: ['#5227FF', '#7cff67', '#5227FF'],
      amplitude: 1.1,
      blend: 0.55,
      speed: 0.7,
    },
  },
  {
    key: 'beams',
    Component: BeamsBackground,
    props: {
      beamWidth: 3,
      beamHeight: 160,
      beamNumber: 6,
      lightColor: '#60a5fa',
      speed: 0.35,
      noiseIntensity: 0.35,
      scale: 1.15,
      rotation: 30,
    },
  },
  {
    key: 'dither',
    Component: DitherBackground,
    props: {
      waveSpeed: 0.05,
      waveFrequency: 3,
      waveAmplitude: 0.3,
      waveColor: [0.4, 0.6, 0.8],
      colorNum: 4,
      pixelSize: 2,
      disableAnimation: false,
      enableMouseInteraction: false,
      mouseRadius: 1,
    },
  },
  {
    key: 'terminal',
    Component: TerminalBackground,
    props: {
      scale: 1,
      gridMul: [2, 1],
      digitSize: 1.4,
      timeScale: 0.3,
      scanlineIntensity: 0.25,
      glitchAmount: 0.85,
      flickerAmount: 0.35,
      noiseAmp: 0.45,
      chromaticAberration: 0.001,
      dither: 0.35,
      curvature: 0.1,
      tint: '#2fd4c8',
      mouseReact: false,
      brightness: 0.9,
      backgroundColor: '#030712',
      overlayOpacity: 0.45,
    },
  },
  {
    key: 'grid',
    Component: GridBackground,
    props: {
      className: 'absolute inset-0 scale-[1.02]',
      lineThickness: 1,
      linesColor: '#2dd4ff',
      scanColor: '#f472b6',
      scanOpacity: 0.45,
      gridScale: 0.12,
      lineStyle: 'dashed',
      lineJitter: 0.08,
      scanDirection: 'pingpong',
      noiseIntensity: 0.02,
      scanGlow: 0.6,
      scanSoftness: 2,
      scanPhaseTaper: 0.85,
      scanDuration: 2.5,
      scanDelay: 2.5,
      enablePost: false,
    },
  },
]

export function LoginFloatingBackground({ children, className }: LoginFloatingBackgroundProps) {
  const [variant] = useState(() => {
    const available = BACKGROUND_VARIANTS.filter(v => v.key !== fallbackVariant.key)
    return available[Math.floor(Math.random() * available.length)] || fallbackVariant
  })
  const BackgroundComponent = variant?.Component || fallbackVariant.Component
  const backgroundProps = variant?.props || fallbackVariant.props

  return (
    <div className={cn('relative min-h-screen bg-[#05060b] overflow-hidden', className)}>
      <div className="absolute inset-0 pointer-events-none opacity-95">
        <BackgroundComponent {...(backgroundProps || {})} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#020617]/60 via-transparent to-black/70" />
      </div>
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        {children}
      </div>
    </div>
  )
}
