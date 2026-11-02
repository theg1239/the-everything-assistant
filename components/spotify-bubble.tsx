'use client'

import { lazy, Suspense, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'

import { useMiniPlayerStore } from '@/lib/stores/useMiniPlayerStore'
import { useMediaQuery } from '@/hooks/use-media-query'
import {
  BubbleContainer,
  getTrackUrl,
  renderBubbleButton,
  selectCurrentTrack,
  useBubbleLayout,
  type ViewState,
} from '@/components/spotify/bubble-shared'

// The player (react-player, vaul drawer, lyrics, panels) is only fetched once the bubble is
// used or playback starts (prefetched on hover/touch/focus of the bubble); until then only the
// bubble itself is rendered, exactly as the player renders it while collapsed.
const loadSpotifyPlayer = () => import('@/components/spotify/spotify-player')
const SpotifyPlayer = lazy(loadSpotifyPlayer)

const prefetchSpotifyPlayer = () => {
  void loadSpotifyPlayer()
}

export default function SpotifyBubble() {
  const { data: session } = useSession()
  const isAuthenticated = Boolean(session?.user)
  const enabled = useMiniPlayerStore((s) => s.enabled)
  const isPlaying = useMiniPlayerStore((s) => s.isPlaying)
  const tracksLength = useMiniPlayerStore((s) => s.tracks.length)
  const currentIndex = useMiniPlayerStore((s) => s.currentIndex)
  const setIsPlaying = useMiniPlayerStore((s) => s.setIsPlaying)
  const currentTrack = useMiniPlayerStore(selectCurrentTrack)

  const isMobile = useMediaQuery('(max-width: 640px)')
  const layout = useBubbleLayout(isMobile)

  // View states: collapsed (bubble), minimized (compact view), screen (video/lyrics), expanded (full panel)
  const [viewState, setViewState] = useState<ViewState>('collapsed')
  // The player is mounted from the first interaction (or playback start) on.
  const [hasInteracted, setHasInteracted] = useState(false)
  const playerMounted = hasInteracted || isPlaying

  // Playback started elsewhere (e.g. the music tool) also activates the player, permanently.
  useEffect(() => {
    if (isPlaying) setHasInteracted(true)
  }, [isPlaying])

  useEffect(() => {
    if (!getTrackUrl(currentTrack) && currentTrack) {
      toast.error('Track URL missing')
      setIsPlaying(false)
      console.warn('[MiniPlayer] No trackUrl for track:', currentTrack)
    }
  }, [currentTrack, setIsPlaying])

  // Ensure a current track is selected
  useEffect(() => {
    if (tracksLength > 0 && currentIndex < 0) {
      // pick first track
      useMiniPlayerStore.setState({ currentIndex: 0 })
    }
    if (tracksLength === 0) {
      setIsPlaying(false)
    }
  }, [tracksLength, currentIndex, setIsPlaying])

  // Return null if not signed in or if the mini player is disabled
  if (!isAuthenticated || !enabled) return null

  const hasTrack = Boolean(currentTrack)
  const bubbleButton = renderBubbleButton({
    isMobile,
    isPlaying,
    hasTrack,
    onIntent: prefetchSpotifyPlayer,
    onClick: () => {
      setHasInteracted(true)
      // Single click cycles: collapsed -> minimized -> collapsed
      // To get to expanded, use the expand button in minimized view
      setViewState((v) => (v === 'collapsed' ? 'minimized' : v === 'minimized' ? 'collapsed' : v))
    },
  })

  if (isMobile) {
    // On mobile the bubble is the drawer trigger. Until the drawer exists (player not loaded yet),
    // a tap opens it directly, which is what the trigger would do.
    const directBubbleButton = renderBubbleButton({
      isMobile,
      isPlaying,
      hasTrack,
      onIntent: prefetchSpotifyPlayer,
      onClick: () => {
        setHasInteracted(true)
        setViewState('expanded')
      },
    })
    return (
      <BubbleContainer layout={layout} isMobile>
        {playerMounted ? (
          <Suspense fallback={directBubbleButton}>
            <SpotifyPlayer
              isMobile
              viewState={viewState}
              setViewState={setViewState}
              bubbleButton={bubbleButton}
            />
          </Suspense>
        ) : (
          directBubbleButton
        )}
      </BubbleContainer>
    )
  }

  return (
    <BubbleContainer layout={layout} isMobile={false}>
      {bubbleButton}
      {playerMounted && (
        <Suspense fallback={null}>
          <SpotifyPlayer
            isMobile={false}
            viewState={viewState}
            setViewState={setViewState}
            bubbleButton={bubbleButton}
          />
        </Suspense>
      )}
    </BubbleContainer>
  )
}
