'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
  type ReactNode,
  type RefObject,
} from 'react'
import { motion, useMotionValue, type MotionValue, type PanInfo } from 'framer-motion'
import { Music2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { MiniPlayerState, Track } from '@/lib/stores/useMiniPlayerStore'

// View states: collapsed (bubble only), minimized (compact now playing), screen (video/lyrics), expanded (full panel)
export type ViewState = 'collapsed' | 'minimized' | 'screen' | 'expanded'
type CornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** Store selector for the track at `currentIndex` (stable reference while the track is unchanged). */
export const selectCurrentTrack = (state: MiniPlayerState): Track | null =>
  state.tracks[state.currentIndex] ?? null

/** Playable URL for a track; YouTube links are normalized to `watch?v=` form. */
export function getTrackUrl(track: Track | null): string | undefined {
  if (!track) return undefined
  const raw = track.url || (track.id ? `https://www.youtube.com/watch?v=${track.id}` : '')
  if (!raw) return undefined
  try {
    const u = new URL(raw)
    // Only normalize YouTube links
    if (u.hostname.includes('youtube.com') || u.hostname === 'youtu.be') {
      let videoId = u.searchParams.get('v')
      if (!videoId && u.hostname === 'youtu.be') videoId = u.pathname.slice(1)
      if (!videoId) {
        const match = u.pathname.match(/\/(embed|shorts)\/([a-zA-Z0-9_-]{11})/)
        if (match?.[2]) videoId = match[2]
      }
      if (videoId) return `https://www.youtube.com/watch?v=${videoId}`
    }
  } catch (e) {
    console.warn('[MiniPlayer] URL parse error:', e)
  }
  return raw
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export interface BubbleLayout {
  containerRef: RefObject<HTMLDivElement | null>
  dragX: MotionValue<number>
  dragY: MotionValue<number>
  handleDragEnd: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void
  desktopPositionStyle: { top?: number; bottom?: number; left?: number; right?: number }
  mobileContainerStyle: { top: number; left: number } | { top: number; right: number }
  isDesktopTop: boolean
  desktopAlignmentClass: string
  mobileAlignmentClass: string
  mobilePreferDown: boolean
}

/**
 * Position/drag state of the floating player. Owned by the always-mounted shell so the position
 * survives the hand-off to the lazily loaded player.
 */
export function useBubbleLayout(isMobile: boolean): BubbleLayout {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const [desktopCorner, setDesktopCorner] = useState<CornerPosition>('bottom-right')
  const [mobilePosition, setMobilePosition] = useState<{ x: number; y: number } | null>(null)
  const [mobileAlignEnd, setMobileAlignEnd] = useState(true)
  const [mobilePreferDown, setMobilePreferDown] = useState(true)

  useEffect(() => {
    if (!isMobile || mobilePosition !== null) return
    if (typeof window === 'undefined') return
    const spacing = 16
    const rect = containerRef.current?.getBoundingClientRect()
    const width = rect?.width ?? 120
    setMobilePosition({
      x: Math.max(spacing, window.innerWidth - width - spacing),
      y: spacing,
    })
    setMobileAlignEnd(true)
    setMobilePreferDown(true)
  }, [isMobile, mobilePosition])

  const desktopPositionStyle = useMemo(() => {
    const verticalSpacing = 20
    const horizontalSpacing = 16
    return {
      top: desktopCorner.startsWith('top') ? verticalSpacing : undefined,
      bottom: desktopCorner.startsWith('bottom') ? verticalSpacing : undefined,
      left: desktopCorner.endsWith('left') ? horizontalSpacing : undefined,
      right: desktopCorner.endsWith('right') ? horizontalSpacing : undefined,
    }
  }, [desktopCorner])

  const mobileContainerStyle = useMemo(() => {
    if (mobilePosition) {
      return {
        top: mobilePosition.y,
        left: mobilePosition.x,
      }
    }
    return { top: 16, right: 16 }
  }, [mobilePosition])

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      dragX.set(0)
      dragY.set(0)
      if (typeof window === 'undefined') return

      if (isMobile) {
        const rect = containerRef.current?.getBoundingClientRect()
        const width = rect?.width ?? 120
        const height = rect?.height ?? 120
        const safePadding = 12
        const newLeft = clamp(info.point.x - width / 2, safePadding, window.innerWidth - width - safePadding)
        const newTop = clamp(info.point.y - height / 2, safePadding, window.innerHeight - height - safePadding)
        setMobilePosition({ x: newLeft, y: newTop })
        const midPoint = newLeft + width / 2
        setMobileAlignEnd(midPoint >= window.innerWidth / 2)
        setMobilePreferDown(newTop < window.innerHeight / 2)
        return
      }

      const { innerWidth, innerHeight } = window
      const horizontal = info.point.x < innerWidth / 2 ? 'left' : 'right'
      const vertical = info.point.y < innerHeight / 2 ? 'top' : 'bottom'
      const corner: CornerPosition = `${vertical}-${horizontal}`
      setDesktopCorner(corner)
    },
    [dragX, dragY, isMobile]
  )

  return {
    containerRef,
    dragX,
    dragY,
    handleDragEnd,
    desktopPositionStyle,
    mobileContainerStyle,
    isDesktopTop: desktopCorner.startsWith('top'),
    desktopAlignmentClass: desktopCorner.endsWith('left') ? 'items-start' : 'items-end',
    mobileAlignmentClass: mobileAlignEnd ? 'items-end' : 'items-start',
    mobilePreferDown,
  }
}

interface BubbleButtonOptions {
  isMobile: boolean
  isPlaying: boolean
  hasTrack: boolean
  onClick: MouseEventHandler<HTMLButtonElement>
  /** Called on hover/touch/focus intent (used to prefetch the player). */
  onIntent?: () => void
}

/**
 * The round floating bubble. Returned as an element (not a component) so it can be passed
 * straight to `Drawer.Trigger asChild`.
 */
export function renderBubbleButton({ isMobile, isPlaying, hasTrack, onClick, onIntent }: BubbleButtonOptions) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.05 }}
      onClick={onClick}
      onPointerEnter={onIntent}
      onTouchStart={onIntent}
      onFocus={onIntent}
      className={cn(
        'relative rounded-full flex items-center justify-center transition-all duration-300',
        isMobile ? 'h-12 w-12' : 'h-14 w-14',
        // Base styling
        'shadow-xl',
        // Playing state - vibrant green glow
        isPlaying && hasTrack && [
          'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600',
          'border-2 border-emerald-300/50',
          'shadow-emerald-500/40 shadow-2xl',
          'ring-4 ring-emerald-400/20',
        ],
        // Paused with track - subtle indication
        hasTrack && !isPlaying && [
          'bg-gradient-to-br from-zinc-800 via-zinc-850 to-zinc-900',
          'border-2 border-zinc-600/50',
          'shadow-zinc-900/50',
          'ring-2 ring-zinc-500/20',
        ],
        // No track - neutral state
        !hasTrack && [
          'bg-gradient-to-br from-zinc-800 to-zinc-900',
          'border border-zinc-700/50',
          'shadow-zinc-900/30',
        ]
      )}
      aria-label="Mini player"
      title={hasTrack ? (isPlaying ? 'Now playing - Click to minimize' : 'Paused - Click to open') : 'Open mini player'}
    >
      {/* Animated ring for playing state */}
      {isPlaying && hasTrack && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-emerald-400/60"
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.6, 0, 0.6],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Inner glyph */}
      <div className={cn(
        "flex items-center justify-center rounded-full transition-all duration-300",
        isMobile ? "h-8 w-8" : "h-10 w-10",
        isPlaying && hasTrack
          ? "bg-white/20 backdrop-blur-sm"
          : hasTrack
            ? "bg-zinc-700/50"
            : "bg-zinc-800/50"
      )}>
        {isPlaying && hasTrack ? (
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <Music2 className={cn("text-white", isMobile ? "h-4 w-4" : "h-5 w-5")} />
          </motion.div>
        ) : (
          <Music2 className={cn(
            isMobile ? "h-4 w-4" : "h-5 w-5",
            hasTrack ? "text-zinc-300" : "text-zinc-400"
          )} />
        )}
      </div>

      {/* Playing indicator dot */}
      {hasTrack && (
        <span className={cn(
          "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background transition-all duration-300",
          isMobile ? "h-3 w-3" : "h-3.5 w-3.5",
          isPlaying
            ? "bg-emerald-400 shadow-lg shadow-emerald-400/50"
            : "bg-zinc-500"
        )} />
      )}
    </motion.button>
  )
}

interface BubbleContainerProps {
  layout: BubbleLayout
  isMobile: boolean
  children: ReactNode
}

/** Draggable fixed container + inner bubble column. */
export function BubbleContainer({ layout, isMobile, children }: BubbleContainerProps) {
  const {
    containerRef,
    dragX,
    dragY,
    handleDragEnd,
    desktopPositionStyle,
    mobileContainerStyle,
    isDesktopTop,
    desktopAlignmentClass,
    mobileAlignmentClass,
    mobilePreferDown,
  } = layout
  if (isMobile) {
    return (
      <motion.div
        ref={containerRef}
        className={cn(
          'fixed z-[60] flex flex-col gap-2 transition-[top,left,right,bottom] duration-200 ease-out',
          mobileAlignmentClass
        )}
        style={{ ...mobileContainerStyle, x: dragX, y: dragY }}
        drag
        dragMomentum={false}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
      >
        <div
          className={cn(
            'flex gap-2',
            mobilePreferDown ? 'flex-col' : 'flex-col-reverse',
            mobileAlignmentClass
          )}
        >
          {children}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        'fixed z-[60] flex flex-col gap-3 transition-[top,left,right,bottom] duration-200 ease-out',
        desktopAlignmentClass
      )}
      style={{ ...desktopPositionStyle, x: dragX, y: dragY }}
      drag
      dragMomentum={false}
      dragElastic={0.08}
      onDragEnd={handleDragEnd}
    >
      <div
        className={cn(
          'flex gap-3',
          isDesktopTop ? 'flex-col' : 'flex-col-reverse',
          desktopAlignmentClass
        )}
      >
        {children}
      </div>
    </motion.div>
  )
}
