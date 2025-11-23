'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { signIn } from 'next-auth/react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, SkipBack, SkipForward, X, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SpotifyPlayback, SpotifyStatusResponse } from '@/types/spotify'
import { useSession } from 'next-auth/react'
import {
  controlSpotifyAction,
  disconnectSpotifyAction,
  getSpotifyPlaybackAction,
  getSpotifyStatusAction,
} from '@/app/actions/spotify'
import { useTransition } from 'react'

const POLL_INTERVAL = 9000

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = `${totalSeconds % 60}`.padStart(2, '0')
  return `${minutes}:${seconds}`
}

const SpotifyGlyph = ({ size = 24 }: { size?: number }) => (
  <svg
    viewBox="0 0 168 168"
    width={size}
    height={size}
    role="img"
    aria-hidden
    focusable="false"
  >
    <circle cx="84" cy="84" r="84" fill="#1DB954" />
    <path
      fill="#fff"
      d="M119.9 116.8a5.02 5.02 0 0 1-6.91 1.71c-18.9-11.55-42.74-14.14-71.03-7.69a5.02 5.02 0 1 1-2.31-9.77c31.45-7.43 58.45-4.39 80.25 9.05a5.02 5.02 0 0 1 2 6.7Zm8.96-21.06a6.28 6.28 0 0 1-8.65 2.14c-21.08-13.05-53.2-16.86-78.22-9.35a6.28 6.28 0 1 1-3.15-12.12c28.28-7.35 63.42-3.1 87.54 11.43a6.28 6.28 0 0 1 2.48 7.9Zm.89-23.02c-24.4-14.48-61.17-15.81-83.15-9.07a7.54 7.54 0 0 1-4.57-14.42c25.07-7.94 66.08-6.38 93.97 10.2a7.54 7.54 0 1 1-7.25 13.29Z"
    />
  </svg>
)

export function SpotifyBubble() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<SpotifyStatusResponse | null>(null)
  const [playback, setPlayback] = useState<SpotifyPlayback | null>(null)
  const [progress, setProgress] = useState(0)
  const [seekValue, setSeekValue] = useState<number | null>(null)
  const [command, setCommand] = useState<null | string>(null)
  const [pending, startTransition] = useTransition()

  const connected = Boolean(status?.enabled && status.connected)

  const loadStatus = useCallback(async () => {
    if (!session?.user) return
    try {
      const data = await getSpotifyStatusAction()
      setStatus(data)
      if (!data.connected) {
        setPlayback(null)
      }
    } catch (error) {
      console.error('spotify status error', error)
    }
  }, [session?.user])

  const loadPlayback = useCallback(async () => {
    if (!connected) return
    try {
      const data = await getSpotifyPlaybackAction()
      if (data.error) {
        throw new Error(data.error)
      }
      setPlayback(data.playback ?? null)
      setProgress(data.playback?.progressMs ?? 0)
    } catch (error: any) {
      console.error('spotify playback error', error)
      toast.error(error?.message || 'Unable to reach Spotify')
    }
  }, [connected])

  useEffect(() => {
    if (session?.user) {
      loadStatus()
    } else {
      setStatus(null)
      setPlayback(null)
    }
  }, [session?.user, loadStatus])

  useEffect(() => {
    const onFocus = () => loadStatus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadStatus])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'spotify-connected') {
        loadStatus()
        loadPlayback()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [loadPlayback, loadStatus])

  useEffect(() => {
    if (!connected) return
    loadPlayback()
    const id = window.setInterval(loadPlayback, POLL_INTERVAL)
    return () => window.clearInterval(id)
  }, [connected, loadPlayback])

  useEffect(() => {
    if (!playback?.isPlaying) return
    const id = window.setInterval(() => {
      setProgress(prev => {
        const next = prev + 1000
        return playback.durationMs ? Math.min(next, playback.durationMs) : next
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [playback?.isPlaying, playback?.durationMs])

  useEffect(() => {
    setProgress(playback?.progressMs ?? 0)
  }, [playback?.progressMs, playback?.track?.id])

  const handleConnect = async () => {
    if (!status?.enabled) {
      toast.error('Spotify integration is disabled on this deployment')
      return
    }

    await signIn('spotify', { callbackUrl: '/integrations/spotify/connected' })
  }

  const handleDisconnect = async () => {
    startTransition(async () => {
      try {
        await disconnectSpotifyAction()
        setStatus(current => (current ? { ...current, connected: false } : current))
        setPlayback(null)
        toast.success('Disconnected Spotify')
      } catch (error) {
        toast.error('Could not disconnect Spotify')
      }
    })
  }

  const handleControl = async (
    action: 'play' | 'pause' | 'next' | 'previous' | 'toggle' | 'seek',
    positionMs?: number
  ) => {
    if (!connected) return
    setCommand(action)
    startTransition(async () => {
      try {
        await controlSpotifyAction(action, positionMs)
        await loadPlayback()
      } catch (error: any) {
        toast.error(error?.message || 'Something went wrong with Spotify')
      } finally {
        setCommand(null)
      }
    })
  }

  const showWidget = useMemo(() => {
    if (!session?.user) return false
    if (!status) return false
    return status.enabled && (status.connected || status.reason || status.enabled)
  }, [session?.user, status])

  if (!showWidget) return null

  const displayPlayback = playback && playback.track

  return (
    <div className="fixed bottom-5 right-4 z-[60] flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="w-[320px] max-w-[90vw] rounded-2xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-md p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center shadow-inner">
                  <SpotifyGlyph size={22} />
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-foreground">Spotify mini</div>
                  <div className="text-xs text-muted-foreground">
                    {status?.connected
                      ? status.profile?.displayName || 'Connected'
                      : status?.enabled
                        ? 'Tap to connect'
                        : status?.reason || 'Unavailable'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status?.connected && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleDisconnect}
                    disabled={pending}
                  >
                    Disconnect
                  </button>
                )}
                <button
                  aria-label="Close Spotify controls"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-foreground/5"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!status?.enabled && (
              <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-3 py-2 rounded-xl">
                <AlertTriangle className="h-4 w-4" />
                Spotify credentials are missing on this deploy.
              </div>
            )}

            {status?.enabled && !status.connected && (
              <div className="rounded-xl border border-dashed border-border/60 bg-background/70 p-4 space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Connect Spotify to see what&apos;s playing and control playback without leaving chat.
                </p>
                <Button size="sm" className="w-full" onClick={handleConnect}>
                  Connect Spotify
                </Button>
              </div>
            )}

            {status?.enabled && status.connected && (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="h-16 w-16 rounded-xl bg-muted overflow-hidden flex items-center justify-center">
                    {displayPlayback?.albumArt ? (
                      <Image
                        src={displayPlayback.albumArt}
                        alt={displayPlayback.name ?? 'Album art'}
                        width={64}
                        height={64}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="text-muted-foreground text-xs">No art</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-sm font-semibold truncate">
                      {displayPlayback?.name ?? 'Nothing playing'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {displayPlayback?.artists ?? 'Start a song on Spotify'}
                    </div>
                    <div className="text-[11px] text-muted-foreground/80 truncate">
                      {playback?.device?.name ? `Device • ${playback.device.name}` : 'No active device'}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="text-[11px] text-muted-foreground w-10 text-left">
                      {formatTime(seekValue ?? progress)}
                    </div>
                    <input
                      type="range"
                      className="w-full h-1.5 accent-green-500"
                      min={0}
                      max={playback?.durationMs || 0}
                      value={seekValue ?? progress}
                      onChange={e => setSeekValue(Number(e.target.value))}
                      onMouseUp={e => {
                        const value = Number((e.target as HTMLInputElement).value)
                        setProgress(value)
                        setSeekValue(null)
                        handleControl('seek', value)
                      }}
                      onTouchEnd={e => {
                        const value = Number((e.target as HTMLInputElement).value)
                        setProgress(value)
                        setSeekValue(null)
                        handleControl('seek', value)
                      }}
                      disabled={!playback?.durationMs}
                    />
                    <div className="text-[11px] text-muted-foreground w-10 text-right">
                      {formatTime(playback?.durationMs || 0)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4">
                  <button
                    className="h-10 w-10 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center"
                    onClick={() => handleControl('previous')}
                    disabled={!!command || pending}
                    aria-label="Previous"
                  >
                    <SkipBack className="h-5 w-5" />
                  </button>
                  <button
                    className={cn(
                      'h-12 w-12 rounded-full bg-green-500 text-black flex items-center justify-center shadow-lg',
                      command === 'toggle' || command === 'play' || command === 'pause'
                        ? 'opacity-80'
                        : 'hover:brightness-110'
                    )}
                    onClick={() => handleControl('toggle')}
                    disabled={pending}
                    aria-label={playback?.isPlaying ? 'Pause' : 'Play'}
                  >
                    {playback?.isPlaying ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    className="h-10 w-10 rounded-full bg-foreground/5 hover:bg-foreground/10 flex items-center justify-center"
                    onClick={() => handleControl('next')}
                    disabled={!!command || pending}
                    aria-label="Next"
                  >
                    <SkipForward className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.96 }}
        whileHover={{ scale: 1.02 }}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'relative h-12 w-12 rounded-full shadow-lg flex items-center justify-center bg-white',
          connected ? 'ring-2 ring-emerald-400/70' : 'ring-1 ring-foreground/20'
        )}
        aria-pressed={open}
        aria-label="Spotify controls"
      >
        <SpotifyGlyph size={26} />
        <span
          className={cn(
            'absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border border-background',
            connected ? 'bg-emerald-400' : 'bg-gray-400'
          )}
        />
      </motion.button>
    </div>
  )
}

export default SpotifyBubble
