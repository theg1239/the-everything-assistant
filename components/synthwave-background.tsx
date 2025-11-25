'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMiniPlayerStore } from '@/lib/stores/useMiniPlayerStore'
import { cn } from '@/lib/utils'

interface SynthwaveBackgroundProps {
  className?: string
  intensity?: number // 0-1, controls overall visual intensity
}

export function SynthwaveBackground({ className, intensity = 0.8 }: SynthwaveBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const lastBassRef = useRef(0)
  const beatRef = useRef(false)
  const timeRef = useRef(0)
  
  const { isPlaying, currentIndex, tracks, enabled, showSynthwave } = useMiniPlayerStore()
  const currentTrack = tracks[currentIndex]
  const [isActive, setIsActive] = useState(false)

  // Initialize audio context and connect to the audio element
  const initAudioContext = useCallback(() => {
    if (audioContextRef.current) return

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return

      audioContextRef.current = new AudioContextClass()
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8
      
      const bufferLength = analyserRef.current.frequencyBinCount
      dataArrayRef.current = new Uint8Array(bufferLength)
      
      // Connect analyser to destination for monitoring
      analyserRef.current.connect(audioContextRef.current.destination)
    } catch (e) {
      console.warn('Failed to initialize audio context for visualizer:', e)
    }
  }, [])

  // Try to capture audio from video elements
  useEffect(() => {
    if (!showSynthwave || !isPlaying || !enabled || !currentTrack) {
      setIsActive(false)
      return
    }

    setIsActive(true)
    initAudioContext()

    // Look for video/audio elements from ReactPlayer
    const findAndConnectMedia = () => {
      const videoElements = document.querySelectorAll('video, audio')
      
      for (const element of videoElements) {
        const mediaElement = element as HTMLMediaElement
        
        // Skip if already connected or if it's muted
        if (sourceRef.current || mediaElement.muted) continue
        
        try {
          if (audioContextRef.current && analyserRef.current && !sourceRef.current) {
            // Check if this element already has a source
            if (!(mediaElement as any).__audioSourceConnected) {
              sourceRef.current = audioContextRef.current.createMediaElementSource(mediaElement)
              sourceRef.current.connect(analyserRef.current)
              ;(mediaElement as any).__audioSourceConnected = true
            }
          }
        } catch (e) {
          // Element might already be connected to another context
        }
      }
    }

    // Try to connect after a small delay to let ReactPlayer render
    const timeoutId = setTimeout(findAndConnectMedia, 500)
    
    return () => {
      clearTimeout(timeoutId)
    }
  }, [showSynthwave, isPlaying, enabled, currentTrack, initAudioContext])

  // Main animation loop
  useEffect(() => {
    if (!showSynthwave) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.scale(dpr, dpr)
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const draw = () => {
      const width = canvas.getBoundingClientRect().width
      const height = canvas.getBoundingClientRect().height
      
      timeRef.current += 0.016 // ~60fps timing
      
      // Clear with fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
      ctx.fillRect(0, 0, width, height)

      // Get audio data if available
      let bass = 0
      let mid = 0
      let high = 0
      let avgEnergy = 0

      if (analyserRef.current && dataArrayRef.current && isActive) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current)
        const data = dataArrayRef.current
        
        // Split frequency bands
        const bassEnd = Math.floor(data.length * 0.1)
        const midEnd = Math.floor(data.length * 0.5)
        
        for (let i = 0; i < bassEnd; i++) bass += data[i]
        for (let i = bassEnd; i < midEnd; i++) mid += data[i]
        for (let i = midEnd; i < data.length; i++) high += data[i]
        
        bass = bass / bassEnd / 255
        mid = mid / (midEnd - bassEnd) / 255
        high = high / (data.length - midEnd) / 255
        avgEnergy = (bass + mid + high) / 3
        
        // Beat detection
        const bassDelta = bass - lastBassRef.current
        beatRef.current = bassDelta > 0.15 && bass > 0.5
        lastBassRef.current = bass * 0.7 + lastBassRef.current * 0.3
      } else if (isActive && isPlaying) {
        // Simulate audio data when we can't access the actual audio
        const t = timeRef.current
        bass = 0.3 + Math.sin(t * 2) * 0.2 + Math.sin(t * 0.5) * 0.1
        mid = 0.25 + Math.sin(t * 3 + 1) * 0.15
        high = 0.2 + Math.sin(t * 5 + 2) * 0.1
        avgEnergy = (bass + mid + high) / 3
        beatRef.current = Math.sin(t * 4) > 0.9
      }

      const activeIntensity = isActive && isPlaying ? intensity : 0.1

      // Draw gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, `rgba(15, 5, 25, ${activeIntensity})`)
      gradient.addColorStop(0.5, `rgba(30, 10, 50, ${activeIntensity * 0.8})`)
      gradient.addColorStop(1, `rgba(10, 2, 15, ${activeIntensity})`)
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      // Sun/moon
      const sunY = height * 0.35
      const sunRadius = 60 + bass * 20 * activeIntensity
      const sunGradient = ctx.createRadialGradient(width / 2, sunY, 0, width / 2, sunY, sunRadius)
      sunGradient.addColorStop(0, `rgba(255, 100, 150, ${0.9 * activeIntensity})`)
      sunGradient.addColorStop(0.5, `rgba(255, 50, 100, ${0.7 * activeIntensity})`)
      sunGradient.addColorStop(1, `rgba(150, 0, 80, ${0 * activeIntensity})`)
      
      ctx.beginPath()
      ctx.arc(width / 2, sunY, sunRadius, 0, Math.PI * 2)
      ctx.fillStyle = sunGradient
      ctx.fill()

      // Sun stripes (synthwave style)
      ctx.save()
      ctx.beginPath()
      ctx.arc(width / 2, sunY, sunRadius - 5, 0, Math.PI * 2)
      ctx.clip()
      
      const stripeCount = 8
      for (let i = 0; i < stripeCount; i++) {
        const stripeY = sunY - sunRadius + (i + 0.5) * (sunRadius * 2 / stripeCount)
        const stripeHeight = 3 + i * 0.5 + mid * 2 * activeIntensity
        ctx.fillStyle = `rgba(15, 5, 25, ${0.8 * activeIntensity})`
        ctx.fillRect(width / 2 - sunRadius, stripeY, sunRadius * 2, stripeHeight)
      }
      ctx.restore()

      // Grid floor
      const horizonY = height * 0.65
      const gridColor = `rgba(255, 0, 150, ${(0.3 + bass * 0.4) * activeIntensity})`
      const gridColorAlt = `rgba(0, 255, 255, ${(0.2 + high * 0.3) * activeIntensity})`
      
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 1 + bass * activeIntensity

      // Horizontal lines (perspective)
      const lineCount = 20
      for (let i = 0; i < lineCount; i++) {
        const progress = i / lineCount
        const y = horizonY + (height - horizonY) * Math.pow(progress, 1.5)
        const alpha = progress * activeIntensity
        ctx.strokeStyle = `rgba(255, 0, 150, ${alpha * (0.3 + mid * 0.5)})`
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      // Vertical lines (perspective)
      const vLineCount = 30
      const scrollOffset = (timeRef.current * 50 * (isPlaying ? 1 : 0.1)) % (width / vLineCount)
      
      for (let i = -vLineCount / 2; i <= vLineCount / 2; i++) {
        const baseX = width / 2 + i * (width / vLineCount) + scrollOffset
        const topX = width / 2 + i * 10
        
        ctx.strokeStyle = i % 2 === 0 ? gridColor : gridColorAlt
        ctx.lineWidth = 0.5 + high * activeIntensity
        ctx.beginPath()
        ctx.moveTo(topX, horizonY)
        ctx.lineTo(baseX, height)
        ctx.stroke()
      }

      // Mountain silhouettes
      ctx.fillStyle = `rgba(20, 5, 30, ${activeIntensity})`
      ctx.beginPath()
      ctx.moveTo(0, horizonY)
      
      const mountainPoints = 12
      for (let i = 0; i <= mountainPoints; i++) {
        const x = (i / mountainPoints) * width
        const baseHeight = 30 + Math.sin(i * 0.8) * 20
        const audioMod = Math.sin(i + timeRef.current) * mid * 10 * activeIntensity
        const y = horizonY - baseHeight - audioMod
        
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      
      ctx.lineTo(width, horizonY)
      ctx.lineTo(0, horizonY)
      ctx.closePath()
      ctx.fill()

      // Neon glow lines (audio reactive)
      if (isActive && isPlaying) {
        // Left side bars
        const barCount = 32
        const barWidth = 3
        const maxBarHeight = height * 0.3
        
        for (let i = 0; i < barCount; i++) {
          const dataIndex = Math.floor((i / barCount) * (dataArrayRef.current?.length || 32))
          const value = dataArrayRef.current ? dataArrayRef.current[dataIndex] / 255 : Math.sin(timeRef.current + i * 0.2) * 0.5 + 0.5
          const barHeight = value * maxBarHeight * activeIntensity
          
          const hue = 280 + (i / barCount) * 60 // Purple to pink
          ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${0.6 * activeIntensity})`
          ctx.fillRect(10 + i * (barWidth + 2), height - 20 - barHeight, barWidth, barHeight)
          
          // Mirror on right side
          ctx.fillRect(width - 10 - (i + 1) * (barWidth + 2), height - 20 - barHeight, barWidth, barHeight)
        }

        // Floating particles
        const particleCount = 20
        for (let i = 0; i < particleCount; i++) {
          const x = (Math.sin(timeRef.current * 0.5 + i * 2) * 0.5 + 0.5) * width
          const y = (Math.cos(timeRef.current * 0.3 + i * 1.5) * 0.3 + 0.3) * height
          const size = 2 + Math.sin(timeRef.current + i) * 2 + avgEnergy * 4
          const alpha = 0.3 + high * 0.5
          
          ctx.beginPath()
          ctx.arc(x, y, size, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 100, 200, ${alpha * activeIntensity})`
          ctx.fill()
        }

        // Beat flash effect
        if (beatRef.current) {
          ctx.fillStyle = `rgba(255, 0, 150, ${0.1 * activeIntensity})`
          ctx.fillRect(0, 0, width, height)
        }
      }

      // Scanlines effect
      ctx.fillStyle = `rgba(0, 0, 0, ${0.03 * activeIntensity})`
      for (let y = 0; y < height; y += 3) {
        ctx.fillRect(0, y, width, 1)
      }

      // Vignette
      const vignetteGradient = ctx.createRadialGradient(
        width / 2, height / 2, height * 0.3,
        width / 2, height / 2, height * 0.9
      )
      vignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
      vignetteGradient.addColorStop(1, `rgba(0, 0, 0, ${0.5 * activeIntensity})`)
      ctx.fillStyle = vignetteGradient
      ctx.fillRect(0, 0, width, height)

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [showSynthwave, isActive, isPlaying, intensity])

  // Cleanup audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Return null after all hooks have been called
  if (!showSynthwave || !enabled) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isActive && isPlaying ? 1 : 0.3 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className={cn(
          'fixed inset-0 pointer-events-none z-0 overflow-hidden',
          className
        )}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ 
            filter: isActive && isPlaying ? 'blur(0px)' : 'blur(2px)',
            transition: 'filter 0.3s ease'
          }}
        />
        
        {/* Overlay gradient for readability */}
        <div 
          className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/50 to-background/70"
          style={{ 
            opacity: isActive && isPlaying ? 0.6 : 0.85,
            transition: 'opacity 0.3s ease'
          }}
        />
      </motion.div>
    </AnimatePresence>
  )
}
