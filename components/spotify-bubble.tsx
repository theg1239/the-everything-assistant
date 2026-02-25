'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import ReactPlayer from 'react-player'
import { AnimatePresence, motion, useMotionValue } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { Drawer } from 'vaul'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
  Shuffle,
  Repeat,
  Repeat1,
  Plus,
  Loader2,
  Music2,
  Video,
  Captions,
  Minus,
  Plus as PlusIcon,
  Search,
  ListMusic,
  Link2,
  ChevronRight,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMiniPlayerStore, formatTime } from '@/lib/stores/useMiniPlayerStore'
import { useMiniLyrics } from '@/hooks/useMiniLyrics'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useSession } from 'next-auth/react'

// View states: collapsed (bubble only), minimized (compact now playing), screen (video/lyrics), expanded (full panel)
type ViewState = 'collapsed' | 'minimized' | 'screen' | 'expanded'
type CornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const BubbleGlyph = ({ size = 24, isPlaying = false }: { size?: number; isPlaying?: boolean }) => (
  <div
    aria-hidden
    className={cn(
      "flex items-center justify-center rounded-full transition-all duration-300",
      isPlaying 
        ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30" 
        : "bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-300 shadow-inner"
    )}
    style={{ width: size, height: size }}
  >
    <Music2 className={cn("transition-transform", isPlaying ? "h-4 w-4" : "h-5 w-5")} />
  </div>
)

const StatusToast = ({ message }: { message: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 6 }}
    transition={{ duration: 0.18 }}
    className="pointer-events-none absolute left-4 top-4 rounded-md bg-black/70 px-3 py-1 text-xs font-semibold text-white shadow-lg"
  >
    {message}
  </motion.div>
)

const ControlButton = ({
  active,
  icon: Icon,
  onClick,
  label,
}: {
  active?: boolean
  icon: typeof Pause
  onClick?: () => void
  label: string
}) => (
  <button
    className={cn(
      'h-9 w-9 rounded-full flex items-center justify-center transition-colors',
      active ? 'bg-foreground text-background' : 'bg-foreground/5 text-foreground'
    )}
    onClick={onClick}
    aria-label={label}
    title={label}
  >
    <Icon className="h-4 w-4" />
  </button>
)

export default function SpotifyBubble() {
  // Main player ref for both audio and video - using ReactPlayer type
  const playerRef = useRef<ReactPlayer>(null)
  // Visual player ref for mobile drawer (muted, synced with audio player)
  const visualPlayerRef = useRef<ReactPlayer>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const { data: session } = useSession()
  const [desktopCorner, setDesktopCorner] = useState<CornerPosition>('bottom-right')
  const [mobilePosition, setMobilePosition] = useState<{ x: number; y: number } | null>(null)
  const [mobileAlignEnd, setMobileAlignEnd] = useState(true)
  const [mobilePreferDown, setMobilePreferDown] = useState(true)
  
  // Local state for elapsed/total time (matching ryos pattern)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [totalTime, setTotalTime] = useState(0)
  
  // View state: collapsed (bubble), minimized (compact view), expanded (full panel)
  const [viewState, setViewState] = useState<ViewState>('collapsed')
  const open = viewState === 'expanded'
  const setOpen = (isOpen: boolean) => setViewState(isOpen ? 'expanded' : 'collapsed')
  const [hasInteracted, setHasInteracted] = useState(false)
  const activatePlayer = useCallback(() => setHasInteracted(true), [])
  
  const log = useCallback((...args: any[]) => {
    // eslint-disable-next-line no-console
    console.debug('[MiniPlayer]', ...args)
  }, [])
  const clamp = useCallback((value: number, min: number, max: number) => Math.min(Math.max(value, min), max), [])
  const {
    enabled,
    tracks,
    currentIndex,
    isPlaying,
    loopAll,
    loopCurrent,
    isShuffled,
    initializeLibrary,
    setIsPlaying,
    toggleShuffle,
    toggleLoopAll,
    toggleLoopCurrent,
    toggleVideo,
    toggleLyrics,
    showVideo,
    showLyrics,
    nextTrack,
    previousTrack,
    addTrackFromUrl,
    playlists,
    activePlaylistId,
    createPlaylist,
    selectPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    playTrack,
    adjustLyricOffset,
  } = useMiniPlayerStore()

  useEffect(() => {
    if (isPlaying) setHasInteracted(true)
  }, [isPlaying])

  const [pendingAdd, setPendingAdd] = useState(false)
  const [url, setUrl] = useState('')
  const [seeking, setSeeking] = useState<number | null>(null)
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null)
  const [showNewPlaylist, setShowNewPlaylist] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'add' | 'library' | 'playlists'>('add')

  const isMobile = useMediaQuery('(max-width: 640px)')
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
  const isAuthenticated = Boolean(session?.user)
  const isDesktopTop = desktopCorner.startsWith('top')
  const desktopAlignmentClass = desktopCorner.endsWith('left') ? 'items-start' : 'items-end'
  const mobileAlignmentClass = mobileAlignEnd ? 'items-end' : 'items-start'
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
      setDesktopCorner(`${vertical}-${horizontal}` as CornerPosition)
    },
    [clamp, dragX, dragY, isMobile]
  )

  const currentTrack = useMemo(() => {
    if (currentIndex >= 0 && currentIndex < tracks.length) return tracks[currentIndex]
    return null
  }, [currentIndex, tracks])

  const trackUrl = useMemo(() => {
    if (!currentTrack) return undefined
    const raw = currentTrack.url || (currentTrack.id ? `https://www.youtube.com/watch?v=${currentTrack.id}` : '')
    if (!raw) return undefined
    console.debug('[MiniPlayer] raw trackUrl:', raw)
    try {
      const u = new URL(raw)
      // Only normalize YouTube links
      if (u.hostname.includes('youtube.com') || u.hostname === 'youtu.be') {
        let videoId = u.searchParams.get('v')
        if (!videoId && u.hostname === 'youtu.be') videoId = u.pathname.slice(1)
        if (!videoId) {
          const match = u.pathname.match(/\/(embed|shorts)\/([a-zA-Z0-9_-]{11})/)
          if (match) videoId = match[2]
        }
        if (videoId) {
          const normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`
          console.debug('[MiniPlayer] normalized trackUrl:', normalizedUrl)
          return normalizedUrl
        }
      }
    } catch (e) {
      console.warn('[MiniPlayer] URL parse error:', e)
    }
    return raw
  }, [currentTrack])

  useEffect(() => {
    if (!trackUrl && currentTrack) {
      toast.error('Track URL missing')
      setIsPlaying(false)
      log('missing trackUrl', currentTrack)
    }
  }, [trackUrl, currentTrack, setIsPlaying]) // log intentionally omitted for stable deps

  useEffect(() => {
    if (trackUrl) {
      log('loading trackUrl', trackUrl)
      console.log('[MiniPlayer] Current track URL:', trackUrl)
      console.log('[MiniPlayer] Current track:', currentTrack)
    } else if (currentTrack) {
      console.warn('[MiniPlayer] No trackUrl for track:', currentTrack)
    }
  }, [trackUrl, currentTrack]) // log intentionally omitted for stable deps

  const lyricsTrack = hasInteracted ? currentTrack : null
  const { lines, currentLine, loading: lyricsLoading, error: lyricsError } = useMiniLyrics(
    lyricsTrack,
    elapsedTime * 1000 // Convert seconds to ms for lyrics
  )

  const showStatus = (msg: string) => {
    setStatus(msg)
    window.setTimeout(() => setStatus(null), 1000)
  }

  useEffect(() => {
    if (!hasInteracted) return
    initializeLibrary().catch((e) => console.error('init mini library', e))
    log('initializeLibrary requested')
  }, [hasInteracted, initializeLibrary, log])

  // If library is empty but flagged as loaded, force a reload
  useEffect(() => {
    if (!hasInteracted) return
    if (tracks.length === 0) {
      initializeLibrary().catch((e) => console.error('reinit mini library', e))
      log('reinitialize because tracks empty')
    }
  }, [hasInteracted, tracks.length, initializeLibrary, log])

  // Ensure a current track is selected
  useEffect(() => {
    if (tracks.length > 0 && currentIndex < 0) {
      setElapsedTime(0)
      setTotalTime(0)
      // pick first track
      useMiniPlayerStore.setState({ currentIndex: 0 })
      log('auto-select first track index 0')
    }
    if (tracks.length === 0) {
      setIsPlaying(false)
      log('no tracks -> force pause')
    }
  }, [tracks.length, currentIndex, setIsPlaying, log])

  useEffect(() => {
    setSelectedPlaylist(activePlaylistId)
  }, [activePlaylistId])

  // Sync visual player when drawer opens on mobile
  useEffect(() => {
    if (open && visualPlayerRef.current && elapsedTime > 0) {
      // Small delay to ensure player is ready
      const timer = setTimeout(() => {
        visualPlayerRef.current?.seekTo(elapsedTime, 'seconds')
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [open]) // Only run when drawer opens, not on every elapsedTime change

  // mobile layout removed; player and panel always mounted (desktop flow)

  // Reset elapsed time when track changes
  useEffect(() => {
    setElapsedTime(0)
    setTotalTime(0)
  }, [currentTrack?.id])

  // Player event handlers (matching ryos pattern)
  const handleProgress = useCallback((state: { playedSeconds: number }) => {
    setElapsedTime(Math.floor(state.playedSeconds))
  }, [])

  const handleDuration = useCallback((duration: number) => {
    setTotalTime(duration)
  }, [])

  const handlePlay = useCallback(() => {
    setIsPlaying(true)
  }, [setIsPlaying])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
  }, [setIsPlaying])

  const handleReady = useCallback(() => {
    log('player ready')
  }, [log])

  const handleTrackEnd = useCallback(() => {
    if (loopCurrent) {
      playerRef.current?.seekTo(0)
      setIsPlaying(true)
    } else {
      nextTrack()
    }
  }, [loopCurrent, nextTrack, setIsPlaying])

  const handleAdd = async () => {
    activatePlayer()
    if (!url.trim()) return
    log('addTrackFromUrl', url)
    setPendingAdd(true)
    try {
      const track = await addTrackFromUrl(url)
      if (track) {
        toast.success(`Queued ${track.title}`)
        log('added track', track)
        setUrl('')
        setOpen(true)
      }
    } catch (e: any) {
      toast.error(e?.message || 'Could not add track')
      log('addTrack error', e)
    } finally {
      setPendingAdd(false)
    }
  }

  const onSeekCommit = (value: number) => {
    setSeeking(null)
    const seconds = value / 1000
    setElapsedTime(seconds)
    log('seek', seconds)
    playerRef.current?.seekTo(seconds, 'seconds')
  }

  const disabled = !currentTrack || !trackUrl
  // Use elapsedTime (in seconds) converted to ms for the slider
  const sliderValueRaw = seeking ?? (elapsedTime * 1000)
  const sliderValue = Number.isFinite(sliderValueRaw) ? sliderValueRaw : 0
  const effectiveDuration = totalTime > 0 ? totalTime * 1000 : Math.max(sliderValue, 0)

  // Keyboard shortcuts when panel is open
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      switch (e.code) {
        case 'Space':
          e.preventDefault()
          if (!disabled) setIsPlaying(!isPlaying)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (!disabled) {
            const newTime = Math.min(elapsedTime + 10, totalTime)
            playerRef.current?.seekTo(newTime, 'seconds')
            setElapsedTime(newTime)
            showStatus('+10s')
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (!disabled) {
            const newTime = Math.max(elapsedTime - 10, 0)
            playerRef.current?.seekTo(newTime, 'seconds')
            setElapsedTime(newTime)
            showStatus('-10s')
          }
          break
        case 'KeyN':
          if (!disabled) nextTrack()
          break
        case 'KeyP':
          if (!disabled) previousTrack()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, disabled, isPlaying, setIsPlaying, elapsedTime, totalTime, nextTrack, previousTrack])

  const searchResults = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return tracks
      .filter((t) =>
        [t.title, t.artist, t.album, t.url]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q))
      )
      .slice(0, 6)
  }, [search, tracks])

  // Filter tracks by selected playlist
  const filteredTracks = useMemo(() => {
    if (!selectedPlaylist) return tracks
    const playlist = playlists.find(p => p.id === selectedPlaylist)
    if (!playlist) return tracks
    return tracks.filter(t => playlist.trackIds.includes(t.id))
  }, [tracks, playlists, selectedPlaylist])

  // Display tracks based on search and playlist filter
  const displayTracks = useMemo(() => {
    if (search.trim()) return searchResults
    return filteredTracks
  }, [search, searchResults, filteredTracks])

  const screenLines = useMemo(() => {
    if (!showLyrics || !lines.length) return []
    const windowSize = 3
    const start = Math.max(0, currentLine - 1)
    return lines.slice(start, start + windowSize)
  }, [showLyrics, lines, currentLine])

  const panel = (
    <div
      className="relative w-full max-w-[460px] max-h-[78vh] overflow-y-auto rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-xl"
    >
      <AnimatePresence>{status && <StatusToast message={status} />}</AnimatePresence>

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-border/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <BubbleGlyph size={34} />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-foreground">Mini player</div>
              <div className="text-xs text-muted-foreground">
                {currentTrack ? 'YouTube audio' : 'Paste a link to start'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label="Minimize to screen view"
              title="Minimize"
              className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setViewState('screen')}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              aria-label="Close mini player"
              title="Close"
              className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setViewState('collapsed')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="p-4 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium truncate flex-1">
              {currentTrack?.title || 'Nothing playing'}
            </div>
            {tracks.length > 0 && (
              <span className="text-[10px] text-muted-foreground/60 tabular-nums flex-shrink-0">
                {currentIndex + 1}/{tracks.length}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {currentTrack?.artist || currentTrack?.url || 'Add a YouTube URL or ID'}
          </div>
        </div>

        {/* Screen area (video + lyrics overlay) */}
        <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <button
                  className={cn(
                    'flex items-center justify-center gap-1 rounded-full px-2 py-1 text-[11px] min-w-[62px] transition-colors',
                    showVideo ? 'bg-foreground text-background' : 'bg-foreground/10 text-foreground'
                  )}
                  onClick={() => {
                    toggleVideo()
                  showStatus(showVideo ? 'Video off' : 'Video on')
                  log('toggle video', !showVideo)
                }}
              >
                <Video className="h-3.5 w-3.5" />
                Video
              </button>
              <button
                className={cn(
                  'flex items-center justify-center gap-1 rounded-full px-2 py-1 text-[11px] min-w-[62px] transition-colors',
                  showLyrics ? 'bg-foreground text-background' : 'bg-foreground/10 text-foreground'
                )}
                onClick={() => {
                  toggleLyrics()
                  showStatus(showLyrics ? 'Lyrics hidden' : 'Lyrics on')
                  log('toggle lyrics', !showLyrics)
                }}
              >
                <Captions className="h-3.5 w-3.5" />
                Lyrics
              </button>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {loopCurrent ? 'Loop track' : loopAll ? 'Loop all' : 'No loop'} ·{' '}
            {isShuffled ? 'Shuffle' : 'In order'}
          </div>
        </div>

        <div 
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 h-[220px] shadow-lg"
        >
          {/* Background gradient when no video - album art style */}
          {(!showVideo || !currentTrack || !trackUrl) && (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(120,119,198,0.15),transparent_50%),radial-gradient(ellipse_at_80%_80%,rgba(255,119,198,0.1),transparent_50%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03),transparent_70%)]" />
              {/* Music note icon when no video */}
              {currentTrack && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center backdrop-blur-sm">
                    <Music2 className="h-10 w-10 text-white/30" />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Embedded ReactPlayer - visual only (audio handled by persistent player) */}
          {hasInteracted && currentTrack && trackUrl && (
            <div className={cn(
              'absolute inset-0 transition-opacity duration-300 overflow-hidden',
              showVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
            )}>
              {/* Scale up the player to crop out YouTube branding */}
              <div className="absolute inset-[-15%] scale-[1.15]">
                <ReactPlayer
                  url={trackUrl}
                  playing={isPlaying}
                  controls={false}
                  width="100%"
                  height="100%"
                  muted={true}
                  loop={loopCurrent}
                  volume={0}
                  playsinline={true}
                  config={{
                    youtube: {
                      playerVars: {
                        modestbranding: 1,
                        rel: 0,
                        showinfo: 0,
                        iv_load_policy: 3,
                        fs: 0,
                        disablekb: 1,
                        playsinline: 1,
                        controls: 0,
                        cc_load_policy: 0,
                        autohide: 1,
                      },
                    },
                  }}
                />
              </div>
              {/* Transparent overlay to block YouTube hover controls */}
              <div className="absolute inset-0 z-[5]" />
              {/* Gradient overlay for better aesthetics */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none z-[6]" />
              {/* Extra dark overlay when lyrics are shown */}
              {showLyrics && (
                <div className="absolute inset-0 bg-black/30 pointer-events-none z-[7]" />
              )}
            </div>
          )}

          {/* Title/status bar - show when video is hidden */}
          {!showVideo && currentTrack && (
            <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-4 py-2.5 text-[12px] text-white/90 bg-gradient-to-b from-black/50 to-transparent z-10">
              <span className="flex items-center gap-2">
                <span className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center text-[10px]',
                  isPlaying ? 'bg-emerald-500/80 text-white' : 'bg-white/20 text-white/80'
                )}>
                  {isPlaying ? '▶' : '⏸'}
                </span>
                <span className="truncate max-w-[200px] font-medium">{currentTrack?.title || '—'}</span>
              </span>
              <span className="text-white/60 text-[11px]">{currentTrack?.artist || ''}</span>
            </div>
          )}

          {/* Lyrics overlay - ryos style with text shadows and glow */}
          {showLyrics && (
            <div className="absolute inset-0 flex flex-col justify-end items-center gap-1.5 px-5 pb-5 text-center pointer-events-none z-10">
              {lyricsLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[13px] text-white/80 font-medium"
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-pulse" />
                    Loading lyrics
                  </span>
                </motion.div>
              )}
              {lyricsError && !lyricsLoading && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[12px] text-amber-200/90 font-medium"
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
                >
                  {lyricsError}
                </motion.div>
              )}
              <AnimatePresence mode="popLayout">
                {!lyricsLoading && !lyricsError && screenLines.map((line) => {
                  const isActive = lines.indexOf(line) === currentLine
                  const position = lines.indexOf(line) - currentLine
                  return (
                    <motion.div
                      key={`${line.startTimeMs}`}
                      layoutId={`lyric-${line.startTimeMs}`}
                      initial={{ opacity: 0, y: 12, scale: 0.92, filter: 'blur(4px)' }}
                      animate={{ 
                        opacity: isActive ? 1 : Math.abs(position) === 1 ? 0.45 : 0.2,
                        y: 0, 
                        scale: isActive ? 1 : 0.92,
                        filter: isActive ? 'blur(0px)' : 'blur(0.5px)'
                      }}
                      exit={{ opacity: 0, y: -12, scale: 0.88, filter: 'blur(4px)' }}
                      transition={{ 
                        type: 'spring', 
                        stiffness: 280, 
                        damping: 28,
                        opacity: { duration: 0.25 },
                        filter: { duration: 0.2 }
                      }}
                      className={cn(
                        'text-white whitespace-pre-wrap break-words leading-snug max-w-full',
                        isActive ? 'text-[16px] font-semibold tracking-tight' : 'text-[13px] font-medium'
                      )}
                      style={{
                        textShadow: isActive 
                          ? '0 0 20px rgba(255,255,255,0.5), 0 0 40px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.9)'
                          : '0 2px 4px rgba(0,0,0,0.9)'
                      }}
                    >
                      {line.words}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Status message */}
          <AnimatePresence>
            {status && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-[11px] font-semibold text-white shadow z-20"
              >
                {status}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="relative h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
          <div 
            className="absolute inset-y-0 left-0 bg-foreground/80 rounded-full transition-all duration-100"
            style={{ width: `${effectiveDuration > 0 ? (sliderValue / effectiveDuration) * 100 : 0}%` }}
          />
          <input
            type="range"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            min={0}
            max={effectiveDuration || 1}
            value={sliderValue}
            onChange={(e) => setSeeking(Number(e.target.value))}
            onMouseUp={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground font-medium tabular-nums">
            {formatTime(sliderValue)}
          </div>
          <div className="text-[10px] text-muted-foreground font-medium tabular-nums">
            -{formatTime(Math.max(0, effectiveDuration - sliderValue))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <ControlButton
          active={isShuffled}
          icon={Shuffle}
          onClick={() => {
            toggleShuffle()
            showStatus(isShuffled ? 'Shuffle off' : 'Shuffle on')
          }}
          label="Toggle shuffle"
        />
        <button
          className="h-10 w-10 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center"
          onClick={previousTrack}
          disabled={disabled}
          aria-label="Previous"
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          className={cn(
            'h-12 w-12 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg',
            !disabled && isPlaying ? 'opacity-100' : 'opacity-90'
          )}
          onClick={() => {
            if (disabled || !trackUrl) return
            // Simply toggle the isPlaying state - ReactPlayer will handle the rest via its playing prop
            setIsPlaying(!isPlaying)
            log(!isPlaying ? 'play click' : 'pause click')
          }}
          disabled={disabled}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button
          className="h-10 w-10 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center"
          onClick={nextTrack}
          disabled={disabled}
          aria-label="Next"
        >
          <SkipForward className="h-5 w-5" />
        </button>
        <ControlButton
          active={loopCurrent || loopAll}
          icon={loopCurrent ? Repeat1 : Repeat}
          onClick={() => {
            // Cycle: no loop → loop all → loop current → no loop
            if (!loopAll && !loopCurrent) {
              toggleLoopAll()
              showStatus('Loop all')
            } else if (loopAll && !loopCurrent) {
              toggleLoopAll()
              toggleLoopCurrent()
              showStatus('Loop track')
            } else {
              toggleLoopCurrent()
              showStatus('Loop off')
            }
          }}
          label="Toggle loop"
        />
      </div>

      {showLyrics && currentTrack && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Lyric offset</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => {
              adjustLyricOffset(currentTrack.id, -200)
              showStatus('Lyrics -0.2s')
            }}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => {
              adjustLyricOffset(currentTrack.id, 200)
              showStatus('Lyrics +0.2s')
            }}
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {(currentTrack.lyricOffset ?? 0) / 1000}s
          </span>
        </div>
      )}

      {/* Simplified bottom section with tabs */}
      <div className="space-y-3">
        {/* Tab buttons */}
        <div className="flex gap-1 p-1 rounded-xl bg-foreground/5">
          <button
            onClick={() => setActiveTab('add')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all',
              activeTab === 'add' 
                ? 'bg-background shadow-sm text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Link2 className="h-3.5 w-3.5" />
            Add
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all',
              activeTab === 'library' 
                ? 'bg-background shadow-sm text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Search className="h-3.5 w-3.5" />
            Library
            {tracks.length > 0 && (
              <span className="text-[10px] text-muted-foreground">({tracks.length})</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('playlists')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-all',
              activeTab === 'playlists' 
                ? 'bg-background shadow-sm text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ListMusic className="h-3.5 w-3.5" />
            Playlists
          </button>
        </div>

        {/* Tab content - fixed height container */}
        <div className="h-[200px] relative">
          <AnimatePresence mode="wait">
            {activeTab === 'add' && (
              <motion.div
                key="add"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex flex-col justify-start pt-2 space-y-4"
              >
                <div className="flex gap-2">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder="Paste YouTube link..."
                    className="flex-1 rounded-xl border border-border/70 bg-foreground/5 px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:bg-background transition-colors"
                  />
                  <Button 
                    onClick={handleAdd} 
                    disabled={pendingAdd || !url.trim()} 
                    className="px-4"
                  >
                    {pendingAdd ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Supports YouTube videos, playlists, and shorts
                </p>
              </motion.div>
            )}

            {activeTab === 'library' && (
              <motion.div
                key="library"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={selectedPlaylist ? "Search in playlist..." : "Search your library..."}
                      className="w-full rounded-xl border border-border/70 bg-foreground/5 pl-9 pr-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:bg-background transition-colors"
                    />
                  </div>
                  {selectedPlaylist && (
                    <button
                      onClick={() => {
                        setSelectedPlaylist(null)
                        selectPlaylist(null)
                      }}
                      className="flex-shrink-0 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Show all
                    </button>
                  )}
                </div>
                
                {selectedPlaylist && (
                  <div className="text-xs text-muted-foreground flex-shrink-0">
                    Viewing: <span className="font-medium text-foreground">{playlists.find(p => p.id === selectedPlaylist)?.name}</span>
                  </div>
                )}
                
                <div className="flex-1 overflow-y-auto rounded-xl min-h-0">
                  {displayTracks.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      {search ? 'No matches found' : selectedPlaylist ? 'Playlist is empty' : 'Your library is empty'}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {displayTracks.map((t) => (
                        <div
                          key={t.id}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors group',
                            t.id === currentTrack?.id 
                              ? 'bg-foreground/10' 
                              : 'hover:bg-foreground/5'
                          )}
                        >
                          <button
                            onClick={() => {
                              playTrack(t.id)
                              showStatus('Playing')
                            }}
                            className="flex items-center gap-3 flex-1 min-w-0"
                          >
                            <div className={cn(
                              'h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0',
                              t.id === currentTrack?.id ? 'bg-foreground text-background' : 'bg-foreground/10'
                            )}>
                              {t.id === currentTrack?.id && isPlaying ? (
                                <span className="text-xs">▶</span>
                              ) : (
                                <Music2 className="h-3.5 w-3.5" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{t.title}</div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {t.artist || 'Unknown artist'}
                              </div>
                            </div>
                          </button>
                          {selectedPlaylist ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                removeTrackFromPlaylist(t.id, selectedPlaylist)
                                toast.success('Removed from playlist')
                              }}
                              className="flex-shrink-0 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                              title="Remove from playlist"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'playlists' && (
              <motion.div
                key="playlists"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex flex-col gap-3"
              >
                {/* Quick playlist selector */}
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none flex-shrink-0">
                  <button
                    onClick={() => {
                      setSelectedPlaylist(null)
                      selectPlaylist(null)
                    }}
                    className={cn(
                      'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                      !selectedPlaylist 
                        ? 'bg-foreground text-background' 
                        : 'bg-foreground/10 hover:bg-foreground/15'
                    )}
                  >
                  All ({tracks.length})
                </button>
                {playlists.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPlaylist(p.id)
                      selectPlaylist(p.id)
                      setActiveTab('library') // Switch to library to show filtered tracks
                    }}
                    className={cn(
                      'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                      selectedPlaylist === p.id 
                        ? 'bg-foreground text-background' 
                        : 'bg-foreground/10 hover:bg-foreground/15'
                    )}
                  >
                    {p.name} ({p.trackIds.length})
                  </button>
                ))}
              </div>

              {/* New playlist form */}
              {showNewPlaylist ? (
                <div className="flex gap-2">
                  <input
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newPlaylistName.trim()) {
                        const p = createPlaylist(newPlaylistName.trim())
                        setNewPlaylistName('')
                        setShowNewPlaylist(false)
                        setSelectedPlaylist(p.id)
                        selectPlaylist(p.id)
                      }
                    }}
                    placeholder="Playlist name..."
                    className="flex-1 rounded-lg border border-border/70 bg-foreground/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newPlaylistName.trim()) return
                      const p = createPlaylist(newPlaylistName.trim())
                      setNewPlaylistName('')
                      setShowNewPlaylist(false)
                      setSelectedPlaylist(p.id)
                      selectPlaylist(p.id)
                    }}
                    disabled={!newPlaylistName.trim()}
                  >
                    Create
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewPlaylist(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setShowNewPlaylist(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New playlist
                  </button>
                  {selectedPlaylist && currentTrack && (
                    <>
                      <span className="text-muted-foreground/30">·</span>
                      <button
                        onClick={() => {
                          addTrackToPlaylist(currentTrack.id, selectedPlaylist)
                          toast.success('Added to playlist')
                        }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add current track
                      </button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
      </div>
    </div>
  )


  // Minimized view - compact now playing with progress and controls
  const minimizedView = (
    <motion.div
      key="minimized"
      layoutId="player-panel"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={cn(
        'rounded-2xl border border-border/70 bg-background/95 shadow-xl backdrop-blur-xl overflow-hidden',
        isMobile ? 'w-[280px]' : 'w-[300px]'
      )}
    >
      {/* Header with expand/collapse */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-foreground/[0.02]">
        <button 
          onClick={() => setViewState('screen')}
          className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
        >
          <div className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0',
            isPlaying ? 'bg-emerald-500/20 text-emerald-500' : 'bg-foreground/10 text-muted-foreground'
          )}>
            <Music2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">
              {currentTrack?.title || 'Nothing playing'}
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {currentTrack?.artist || '—'}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => setViewState('screen')}
            className="h-7 w-7 rounded-lg hover:bg-foreground/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Show video/lyrics"
            title="Show video/lyrics"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewState('collapsed')}
            className="h-7 w-7 rounded-lg hover:bg-foreground/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Collapse"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="px-3 pt-2">
        <div className="relative h-1 w-full rounded-full bg-foreground/10 overflow-hidden">
          <div 
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-all duration-100',
              isPlaying ? 'bg-emerald-500' : 'bg-foreground/60'
            )}
            style={{ width: `${effectiveDuration > 0 ? (sliderValue / effectiveDuration) * 100 : 0}%` }}
          />
          <input
            type="range"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            min={0}
            max={effectiveDuration || 1}
            value={sliderValue}
            onChange={(e) => setSeeking(Number(e.target.value))}
            onMouseUp={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[9px] text-muted-foreground tabular-nums">
            {formatTime(sliderValue)}
          </span>
          <span className="text-[9px] text-muted-foreground tabular-nums">
            -{formatTime(Math.max(0, effectiveDuration - sliderValue))}
          </span>
        </div>
      </div>

      {/* Compact controls */}
      <div className="flex items-center justify-center gap-2 px-3 pb-3 pt-1">
        <button
          onClick={previousTrack}
          disabled={disabled}
          className="h-8 w-8 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center transition-colors disabled:opacity-40"
          aria-label="Previous"
        >
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={disabled}
          className={cn(
            'h-10 w-10 rounded-full flex items-center justify-center shadow-md transition-all disabled:opacity-40',
            isPlaying 
              ? 'bg-emerald-500 text-white hover:bg-emerald-600' 
              : 'bg-foreground text-background hover:opacity-90'
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>
        <button
          onClick={nextTrack}
          disabled={disabled}
          className="h-8 w-8 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center transition-colors disabled:opacity-40"
          aria-label="Next"
        >
          <SkipForward className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  )

  // Screen view - video/lyrics display with controls
  const screenView = (
    <motion.div
      key="screen"
      layoutId="player-panel"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className={cn(
        'rounded-2xl border border-border/70 bg-background/95 shadow-xl backdrop-blur-xl overflow-hidden',
        isMobile ? 'w-[300px]' : 'w-[340px]'
      )}
    >
      {/* Video/Lyrics screen */}
      <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 aspect-video shadow-inner">
        {/* Background gradient when no video */}
        {(!showVideo || !currentTrack || !trackUrl) && (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(120,119,198,0.15),transparent_50%),radial-gradient(ellipse_at_80%_80%,rgba(255,119,198,0.1),transparent_50%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03),transparent_70%)]" />
            {currentTrack && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center backdrop-blur-sm">
                  <Music2 className="h-8 w-8 text-white/30" />
                </div>
              </div>
            )}
          </>
        )}

        {/* ReactPlayer for video */}
        {hasInteracted && currentTrack && trackUrl && (
          <div className={cn(
            'absolute inset-0 transition-opacity duration-300 overflow-hidden',
            showVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}>
            <div className="absolute inset-[-15%] scale-[1.15]">
              <ReactPlayer
                url={trackUrl}
                playing={isPlaying}
                controls={false}
                width="100%"
                height="100%"
                muted={true}
                loop={loopCurrent}
                volume={0}
                playsinline={true}
                config={{
                  youtube: {
                    playerVars: {
                      modestbranding: 1,
                      rel: 0,
                      showinfo: 0,
                      iv_load_policy: 3,
                      fs: 0,
                      disablekb: 1,
                      playsinline: 1,
                      controls: 0,
                    },
                  },
                }}
              />
            </div>
            <div className="absolute inset-0 z-[5]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none z-[6]" />
            {showLyrics && <div className="absolute inset-0 bg-black/30 pointer-events-none z-[7]" />}
          </div>
        )}

        {/* Lyrics overlay */}
        {showLyrics && (
          <div className="absolute inset-0 flex flex-col justify-end items-center gap-1 px-4 pb-4 text-center pointer-events-none z-10">
            {lyricsLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[12px] text-white/80 font-medium"
                style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-pulse" />
                  Loading lyrics
                </span>
              </motion.div>
            )}
            {lyricsError && !lyricsLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[11px] text-amber-200/90 font-medium"
                style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
              >
                {lyricsError}
              </motion.div>
            )}
            <AnimatePresence mode="popLayout">
              {!lyricsLoading && !lyricsError && screenLines.map((line) => {
                const isActive = lines.indexOf(line) === currentLine
                const position = lines.indexOf(line) - currentLine
                return (
                  <motion.div
                    key={`${line.startTimeMs}`}
                    layoutId={`lyric-screen-${line.startTimeMs}`}
                    initial={{ opacity: 0, y: 10, scale: 0.92 }}
                    animate={{ 
                      opacity: isActive ? 1 : Math.abs(position) === 1 ? 0.45 : 0.2,
                      y: 0, 
                      scale: isActive ? 1 : 0.92,
                    }}
                    exit={{ opacity: 0, y: -10, scale: 0.88 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                    className={cn(
                      'text-white whitespace-pre-wrap break-words leading-snug max-w-full',
                      isActive ? 'text-[14px] font-semibold' : 'text-[12px] font-medium'
                    )}
                    style={{
                      textShadow: isActive 
                        ? '0 0 20px rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.9)'
                        : '0 2px 4px rgba(0,0,0,0.9)'
                    }}
                  >
                    {line.words}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Navigation buttons overlay */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
          <button
            onClick={() => setViewState('expanded')}
            className="h-7 w-7 rounded-lg bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/80 hover:text-white transition-colors backdrop-blur-sm"
            aria-label="Open full player"
            title="Full player"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewState('minimized')}
            className="h-7 w-7 rounded-lg bg-black/40 hover:bg-black/60 flex items-center justify-center text-white/80 hover:text-white transition-colors backdrop-blur-sm"
            aria-label="Minimize"
            title="Minimize"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-3 pt-2">
        <div className="relative h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
          <div 
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-all duration-100',
              isPlaying ? 'bg-emerald-500' : 'bg-foreground/60'
            )}
            style={{ width: `${effectiveDuration > 0 ? (sliderValue / effectiveDuration) * 100 : 0}%` }}
          />
          <input
            type="range"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            min={0}
            max={effectiveDuration || 1}
            value={sliderValue}
            onChange={(e) => setSeeking(Number(e.target.value))}
            onMouseUp={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
            disabled={disabled}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {formatTime(sliderValue)}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            -{formatTime(Math.max(0, effectiveDuration - sliderValue))}
          </span>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-2 px-3 pb-3 pt-1">
        <button
          onClick={() => toggleShuffle()}
          className={cn(
            'h-8 w-8 rounded-full flex items-center justify-center transition-colors',
            isShuffled ? 'bg-foreground text-background' : 'bg-foreground/5 hover:bg-foreground/10'
          )}
          aria-label="Toggle shuffle"
        >
          <Shuffle className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={previousTrack}
          disabled={disabled}
          className="h-9 w-9 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center transition-colors disabled:opacity-40"
          aria-label="Previous"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={disabled}
          className={cn(
            'h-11 w-11 rounded-full flex items-center justify-center shadow-md transition-all disabled:opacity-40',
            isPlaying 
              ? 'bg-emerald-500 text-white hover:bg-emerald-600' 
              : 'bg-foreground text-background hover:opacity-90'
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>
        <button
          onClick={nextTrack}
          disabled={disabled}
          className="h-9 w-9 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center transition-colors disabled:opacity-40"
          aria-label="Next"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            if (!loopAll && !loopCurrent) {
              toggleLoopAll()
            } else if (loopAll && !loopCurrent) {
              toggleLoopAll()
              toggleLoopCurrent()
            } else {
              toggleLoopCurrent()
            }
          }}
          className={cn(
            'h-8 w-8 rounded-full flex items-center justify-center transition-colors',
            loopCurrent || loopAll ? 'bg-foreground text-background' : 'bg-foreground/5 hover:bg-foreground/10'
          )}
          aria-label="Toggle loop"
        >
          {loopCurrent ? <Repeat1 className="h-3.5 w-3.5" /> : <Repeat className="h-3.5 w-3.5" />}
        </button>
      </div>
    </motion.div>
  )

  const bubbleButton = (
    <motion.button
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.05 }}
      onClick={() => {
        activatePlayer()
        // Single click cycles: collapsed -> minimized -> collapsed
        // To get to expanded, use the expand button in minimized view
        if (viewState === 'collapsed') {
          setViewState('minimized')
        } else if (viewState === 'minimized') {
          setViewState('collapsed')
        }
      }}
      className={cn(
        'relative rounded-full flex items-center justify-center transition-all duration-300',
        isMobile ? 'h-12 w-12' : 'h-14 w-14',
        // Base styling
        'shadow-xl',
        // Playing state - vibrant green glow
        isPlaying && currentTrack && [
          'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600',
          'border-2 border-emerald-300/50',
          'shadow-emerald-500/40 shadow-2xl',
          'ring-4 ring-emerald-400/20',
        ],
        // Paused with track - subtle indication
        currentTrack && !isPlaying && [
          'bg-gradient-to-br from-zinc-800 via-zinc-850 to-zinc-900',
          'border-2 border-zinc-600/50',
          'shadow-zinc-900/50',
          'ring-2 ring-zinc-500/20',
        ],
        // No track - neutral state
        !currentTrack && [
          'bg-gradient-to-br from-zinc-800 to-zinc-900',
          'border border-zinc-700/50',
          'shadow-zinc-900/30',
        ]
      )}
      aria-label="Mini player"
      title={currentTrack ? (isPlaying ? 'Now playing - Click to minimize' : 'Paused - Click to open') : 'Open mini player'}
    >
      {/* Animated ring for playing state */}
      {isPlaying && currentTrack && (
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
        isPlaying && currentTrack
          ? "bg-white/20 backdrop-blur-sm"
          : currentTrack
            ? "bg-zinc-700/50"
            : "bg-zinc-800/50"
      )}>
        {isPlaying && currentTrack ? (
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <Music2 className={cn("text-white", isMobile ? "h-4 w-4" : "h-5 w-5")} />
          </motion.div>
        ) : (
          <Music2 className={cn(
            isMobile ? "h-4 w-4" : "h-5 w-5",
            currentTrack ? "text-zinc-300" : "text-zinc-400"
          )} />
        )}
      </div>
      
      {/* Playing indicator dot */}
      {currentTrack && (
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

  // Return null if not signed in or if the mini player is disabled
  if (!isAuthenticated || !enabled) return null

  // Mobile: use drawer positioned at top-right corner (away from input box at bottom)
  if (isMobile) {
    return (
      <>
        {/* Persistent player outside drawer - keeps playing when closed */}
        {hasInteracted && currentTrack && trackUrl && (
          <div className="sr-only pointer-events-none" aria-hidden="true">
            <ReactPlayer
              ref={playerRef}
              url={trackUrl}
              playing={isPlaying}
              controls={false}
              width={1}
              height={1}
              onEnded={handleTrackEnd}
              onProgress={handleProgress}
              onDuration={handleDuration}
              onPlay={handlePlay}
              onPause={handlePause}
              onReady={handleReady}
              loop={loopCurrent}
              volume={1}
              playsinline={true}
              config={{
                youtube: {
                  playerVars: {
                    modestbranding: 1,
                    rel: 0,
                    showinfo: 0,
                    iv_load_policy: 3,
                    fs: 0,
                    disablekb: 1,
                    playsinline: 1,
                    controls: 0,
                    cc_load_policy: 0,
                    autohide: 1,
                  },
                },
              }}
            />
          </div>
        )}
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
            <Drawer.Root
              open={viewState === 'expanded'}
              onOpenChange={(isOpen) => setViewState(isOpen ? 'expanded' : 'collapsed')}
            >
              <Drawer.Trigger asChild>{bubbleButton}</Drawer.Trigger>
              <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70]" />
                <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[70] outline-none">
                  <VisuallyHidden>
                    <Drawer.Title>Mini Music Player</Drawer.Title>
                    <Drawer.Description>
                      Play music from YouTube with lyrics and playlists
                    </Drawer.Description>
                  </VisuallyHidden>
                <div className="bg-background rounded-t-3xl border-t border-border/50 shadow-xl">
                  <Drawer.Handle className="mx-auto mt-3 mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
                  <div className="max-h-[90vh] overflow-y-auto px-5 pb-safe-bottom pt-1">
                    {/* Reuse panel content without wrapper animation */}
                    <AnimatePresence>{status && <StatusToast message={status} />}</AnimatePresence>

                    {/* Compact header with track info */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="relative flex-shrink-0">
                        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center overflow-hidden border border-white/10">
                          {currentTrack ? (
                            <Music2 className="h-6 w-6 text-white/50" />
                          ) : (
                            <Music2 className="h-6 w-6 text-white/30" />
                          )}
                        </div>
                        {isPlaying && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {currentTrack?.title || 'Nothing playing'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {currentTrack?.artist || 'Add a YouTube URL to start'}
                        </div>
                      </div>
                    </div>

                    {/* Screen area with video/lyrics toggle */}
                    <div className="space-y-2 mb-3">
                      {/* Video/Lyrics screen */}
                      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 aspect-video max-h-[180px] shadow-lg">
                        {(!showVideo || !currentTrack || !trackUrl) && (
                          <>
                            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(120,119,198,0.15),transparent_50%)]" />
                            {currentTrack && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center">
                                  <Music2 className="h-8 w-8 text-white/30" />
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {hasInteracted && currentTrack && trackUrl && (
                          <div className={cn(
                            'absolute inset-0 transition-opacity duration-300 overflow-hidden',
                            showVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
                          )}>
                            <div className="absolute inset-[-15%] scale-[1.15]">
                              {/* Visual-only player for video display - audio handled by persistent player */}
                              <ReactPlayer
                                ref={visualPlayerRef}
                                url={trackUrl}
                                playing={isPlaying}
                                controls={false}
                                width="100%"
                                height="100%"
                                muted={true}
                                loop={loopCurrent}
                                volume={0}
                                playsinline={true}
                                config={{
                                  youtube: {
                                    playerVars: {
                                      modestbranding: 1,
                                      rel: 0,
                                      showinfo: 0,
                                      iv_load_policy: 3,
                                      fs: 0,
                                      disablekb: 1,
                                      playsinline: 1,
                                      controls: 0,
                                    },
                                  },
                                }}
                              />
                            </div>
                            <div className="absolute inset-0 z-[5]" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none z-[6]" />
                            {showLyrics && <div className="absolute inset-0 bg-black/30 pointer-events-none z-[7]" />}
                          </div>
                        )}

                        {/* Lyrics */}
                        {showLyrics && (
                          <div className="absolute inset-0 flex flex-col justify-end items-center gap-1 px-4 pb-4 text-center pointer-events-none z-10">
                            <AnimatePresence mode="popLayout">
                              {screenLines.map((line) => {
                                const isActive = lines.indexOf(line) === currentLine
                                return (
                                  <motion.div
                                    key={`${line.startTimeMs}`}
                                    layoutId={`lyric-m-${line.startTimeMs}`}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: isActive ? 1 : 0.4, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className={cn(
                                      'text-white',
                                      isActive ? 'text-base font-semibold' : 'text-sm'
                                    )}
                                    style={{ textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}
                                  >
                                    {line.words}
                                  </motion.div>
                                )
                              })}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                      
                      {/* Video/Lyrics/Synthwave toggle buttons inside screen area */}
                      <div className="flex items-center justify-center gap-2 mt-2">
                        <button
                          className={cn(
                            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                            showVideo ? 'bg-foreground text-background' : 'bg-foreground/10 text-muted-foreground'
                          )}
                          onClick={() => toggleVideo()}
                        >
                          <Video className="h-3.5 w-3.5" />
                          Video
                        </button>
                        <button
                          className={cn(
                            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                            showLyrics ? 'bg-foreground text-background' : 'bg-foreground/10 text-muted-foreground'
                          )}
                          onClick={() => toggleLyrics()}
                        >
                          <Captions className="h-3.5 w-3.5" />
                          Lyrics
                        </button>
                      </div>
                    </div>

                    {/* Progress bar - more compact */}
                    <div className="space-y-1 mb-3">
                      <div className="relative h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
                        <div 
                          className="absolute inset-y-0 left-0 bg-foreground/80 rounded-full transition-all duration-75"
                          style={{ width: `${effectiveDuration > 0 ? (sliderValue / effectiveDuration) * 100 : 0}%` }}
                        />
                        <input
                          type="range"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-none"
                          min={0}
                          max={effectiveDuration || 1}
                          value={sliderValue}
                          onChange={(e) => setSeeking(Number(e.target.value))}
                          onTouchEnd={(e) => onSeekCommit(Number((e.target as HTMLInputElement).value))}
                          disabled={disabled}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
                        <span>{formatTime(sliderValue)}</span>
                        <span>-{formatTime(Math.max(0, effectiveDuration - sliderValue))}</span>
                      </div>
                    </div>

                    {/* Playback controls - tighter spacing */}
                    <div className="flex items-center justify-center gap-3 mb-4">
                      <button
                        onClick={() => toggleShuffle()}
                        className={cn('h-9 w-9 rounded-full flex items-center justify-center transition-colors', isShuffled ? 'bg-foreground text-background' : 'bg-foreground/10')}
                      >
                        <Shuffle className="h-4 w-4" />
                      </button>
                      <button onClick={previousTrack} disabled={disabled} className="h-11 w-11 rounded-full bg-foreground/10 flex items-center justify-center active:scale-95 transition-transform">
                        <SkipBack className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        disabled={disabled}
                        className="h-14 w-14 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                      >
                        {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
                      </button>
                      <button onClick={nextTrack} disabled={disabled} className="h-11 w-11 rounded-full bg-foreground/10 flex items-center justify-center active:scale-95 transition-transform">
                        <SkipForward className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => {
                          // Cycle: no loop → loop all → loop current → no loop
                          if (!loopAll && !loopCurrent) {
                            toggleLoopAll()
                            showStatus('Loop all')
                          } else if (loopAll && !loopCurrent) {
                            toggleLoopAll()
                            toggleLoopCurrent()
                            showStatus('Loop track')
                          } else {
                            toggleLoopCurrent()
                            showStatus('Loop off')
                          }
                        }}
                        className={cn('h-9 w-9 rounded-full flex items-center justify-center transition-colors', loopCurrent || loopAll ? 'bg-foreground text-background' : 'bg-foreground/10')}
                      >
                        {loopCurrent ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Tabs - more compact */}
                    <div className="space-y-2 pb-4">
                      <div className="flex gap-0.5 p-0.5 rounded-lg bg-foreground/5">
                        <button
                          onClick={() => setActiveTab('add')}
                          className={cn('flex-1 py-2 rounded-md text-xs font-medium transition-all', activeTab === 'add' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setActiveTab('library')}
                          className={cn('flex-1 py-2 rounded-md text-xs font-medium transition-all', activeTab === 'library' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                        >
                          Library
                        </button>
                        <button
                          onClick={() => setActiveTab('playlists')}
                          className={cn('flex-1 py-2 rounded-md text-xs font-medium transition-all', activeTab === 'playlists' ? 'bg-background shadow-sm' : 'text-muted-foreground')}
                        >
                          Playlists
                        </button>
                      </div>

                      {/* Tab content - compact height */}
                      <div className="h-[200px] relative">
                        {activeTab === 'add' && (
                          <div className="absolute inset-0 flex flex-col justify-start pt-1 space-y-2">
                            <div className="flex gap-2">
                              <input
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="Paste YouTube link..."
                                className="flex-1 rounded-lg border border-border/70 bg-foreground/5 px-3 py-2.5 text-sm"
                              />
                              <Button onClick={handleAdd} disabled={pendingAdd || !url.trim()} size="sm" className="px-4">
                                {pendingAdd ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                              </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              YouTube videos, playlists & shorts
                            </p>
                          </div>
                        )}

                        {activeTab === 'library' && (
                          <div className="absolute inset-0 flex flex-col gap-2">
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <input
                                  value={search}
                                  onChange={(e) => setSearch(e.target.value)}
                                  placeholder={selectedPlaylist ? "Search playlist..." : "Search..."}
                                  className="w-full rounded-lg border border-border/70 bg-foreground/5 pl-8 pr-3 py-2 text-sm"
                                />
                              </div>
                              {selectedPlaylist && (
                                <button
                                  onClick={() => { setSelectedPlaylist(null); selectPlaylist(null) }}
                                  className="flex-shrink-0 px-2 py-1.5 text-xs text-muted-foreground rounded-md bg-foreground/5"
                                >
                                  All
                                </button>
                              )}
                            </div>
                            {selectedPlaylist && (
                              <div className="text-[10px] text-muted-foreground flex-shrink-0 px-1">
                                {playlists.find(p => p.id === selectedPlaylist)?.name}
                              </div>
                            )}
                            <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y space-y-0.5 min-h-0 -mx-1 px-1">
                              {displayTracks.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                                  {search ? 'No matches' : selectedPlaylist ? 'Empty playlist' : 'Library empty'}
                                </div>
                              ) : (
                                displayTracks.map((t) => (
                                  <div
                                    key={t.id}
                                    className={cn(
                                      'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left',
                                      t.id === currentTrack?.id ? 'bg-foreground/10' : 'active:bg-foreground/5'
                                    )}
                                  >
                                    <button
                                      onClick={() => { playTrack(t.id); showStatus('Playing') }}
                                      className="flex-1 min-w-0 text-left"
                                    >
                                      <div className="truncate text-sm font-medium">{t.title}</div>
                                      <div className="truncate text-[10px] text-muted-foreground">{t.artist || 'Unknown'}</div>
                                    </button>
                                    {selectedPlaylist && (
                                      <button
                                        onClick={() => {
                                          removeTrackFromPlaylist(t.id, selectedPlaylist)
                                          toast.success('Removed')
                                        }}
                                        className="flex-shrink-0 p-1.5 text-muted-foreground active:text-destructive"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {activeTab === 'playlists' && (
                          <div className="absolute inset-0 flex flex-col gap-2">
                            <div className="flex gap-1.5 overflow-x-auto pb-1 flex-shrink-0 scrollbar-none -mx-1 px-1">
                              <button
                                onClick={() => { setSelectedPlaylist(null); selectPlaylist(null); setActiveTab('library') }}
                                className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors', !selectedPlaylist ? 'bg-foreground text-background' : 'bg-foreground/10')}
                              >
                                All
                              </button>
                              {playlists.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => { setSelectedPlaylist(p.id); selectPlaylist(p.id); setActiveTab('library') }}
                                  className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors', selectedPlaylist === p.id ? 'bg-foreground text-background' : 'bg-foreground/10')}
                                >
                                  {p.name} ({p.trackIds.length})
                                </button>
                              ))}
                            </div>
                            {showNewPlaylist ? (
                              <div className="flex gap-2 flex-shrink-0">
                                <input
                                  value={newPlaylistName}
                                  onChange={(e) => setNewPlaylistName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newPlaylistName.trim()) {
                                      const p = createPlaylist(newPlaylistName.trim())
                                      setNewPlaylistName('')
                                      setShowNewPlaylist(false)
                                      setSelectedPlaylist(p.id)
                                      selectPlaylist(p.id)
                                    }
                                  }}
                                  placeholder="Playlist name..."
                                  className="flex-1 rounded-lg border border-border/70 bg-foreground/5 px-3 py-2 text-sm"
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    if (!newPlaylistName.trim()) return
                                    const p = createPlaylist(newPlaylistName.trim())
                                    setNewPlaylistName('')
                                    setShowNewPlaylist(false)
                                    setSelectedPlaylist(p.id)
                                    selectPlaylist(p.id)
                                  }}
                                  disabled={!newPlaylistName.trim()}
                                >
                                  Create
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setShowNewPlaylist(false)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => setShowNewPlaylist(true)}
                                  className="flex items-center gap-1.5 text-xs text-muted-foreground active:text-foreground transition-colors"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  New playlist
                                </button>
                                {selectedPlaylist && currentTrack && (
                                  <>
                                    <span className="text-muted-foreground/30">·</span>
                                    <button
                                      onClick={() => {
                                        addTrackToPlaylist(currentTrack.id, selectedPlaylist)
                                        toast.success('Added to playlist')
                                      }}
                                      className="flex items-center gap-1.5 text-xs text-muted-foreground active:text-foreground transition-colors"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      Add current
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Drawer.Content>
            </Drawer.Portal>
            </Drawer.Root>

            {/* All player views for mobile - using single AnimatePresence with mode='wait' */}
            <AnimatePresence mode="wait">
              {viewState === 'screen' && screenView}
              {viewState === 'minimized' && minimizedView}
            </AnimatePresence>
          </div>
        </motion.div>
      </>
    )
  }

  // Desktop: use floating panel with minimized state
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
      {/* Persistent audio player for desktop - keeps playing across all view states */}
      {hasInteracted && currentTrack && trackUrl && (
        <div className="sr-only pointer-events-none" aria-hidden="true">
          <ReactPlayer
            ref={playerRef}
            url={trackUrl}
            playing={isPlaying}
            controls={false}
            width={1}
            height={1}
            onEnded={handleTrackEnd}
            onProgress={handleProgress}
            onDuration={handleDuration}
            onPlay={handlePlay}
            onPause={handlePause}
            onReady={handleReady}
            loop={loopCurrent}
            volume={1}
            playsinline={true}
            config={{
              youtube: {
                playerVars: {
                  modestbranding: 1,
                  rel: 0,
                  showinfo: 0,
                  iv_load_policy: 3,
                  fs: 0,
                  disablekb: 1,
                  playsinline: 1,
                  controls: 0,
                  cc_load_policy: 0,
                  autohide: 1,
                },
              },
            }}
          />
        </div>
      )}

      <div
        className={cn(
          'flex gap-3',
          isDesktopTop ? 'flex-col' : 'flex-col-reverse',
          desktopAlignmentClass
        )}
      >
        {bubbleButton}

        {/* All player views - using single AnimatePresence with mode='wait' to prevent layout shifts */}
        <AnimatePresence mode="wait">
          {viewState === 'expanded' && (
            <motion.div
              key="expanded"
              layoutId="player-panel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
            >
              {panel}
            </motion.div>
          )}
          {viewState === 'screen' && screenView}
          {viewState === 'minimized' && minimizedView}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
