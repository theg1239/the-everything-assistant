import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'

export interface Track {
  id: string
  url: string
  title: string
  artist?: string
  album?: string
  duration?: number
  lyricOffset?: number
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
}

type LibraryState = 'uninitialized' | 'loaded' | 'cleared'

interface MiniPlayerState {
  enabled: boolean
  tracks: Track[]
  playlists: Playlist[]
  activePlaylistId: string | null
  currentIndex: number
  isPlaying: boolean
  loopAll: boolean
  loopCurrent: boolean
  isShuffled: boolean
  progressMs: number
  durationMs: number
  showVideo: boolean
  showLyrics: boolean
  showSynthwave: boolean
  statusMessage: string | null
  libraryState: LibraryState
  initializing: boolean
  setEnabled: (enabled: boolean) => void
  setProgress: (ms: number) => void
  setDuration: (ms: number) => void
  setCurrentIndex: (index: number) => void
  setIsPlaying: (playing: boolean) => void
  togglePlay: () => void
  toggleShuffle: () => void
  toggleLoopCurrent: () => void
  toggleLoopAll: () => void
  toggleVideo: () => void
  toggleLyrics: () => void
  toggleSynthwave: () => void
  setStatusMessage: (msg: string | null) => void
  adjustLyricOffset: (trackId: string, deltaMs: number) => void
  initializeLibrary: () => Promise<void>
  nextTrack: () => void
  previousTrack: () => void
  addTrackFromUrl: (urlOrId: string) => Promise<Track | null>
  playTrack: (trackId: string) => void
  createPlaylist: (name: string) => Playlist
  selectPlaylist: (id: string | null) => void
  addTrackToPlaylist: (trackId: string, playlistId: string) => void
  removeTrackFromPlaylist: (trackId: string, playlistId: string) => void
}

const storeLog = (...args: unknown[]) => {
  if (typeof console !== 'undefined') {
    // eslint-disable-next-line no-console
    console.debug('[MiniStore]', ...args)
  }
}

const extractVideoId = (input: string): string | null => {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input
  try {
    const url = new URL(input)
    if (url.hostname === 'os.ryo.lu' && url.pathname.startsWith('/ipod/')) {
      return url.pathname.split('/')[2] || null
    }
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      const vParam = url.searchParams.get('v')
      if (vParam) return vParam
      if (url.hostname === 'youtu.be') return url.pathname.slice(1) || null
      const pathMatch = url.pathname.match(/\/(?:embed\/|v\/)?([a-zA-Z0-9_-]{11})/)
      if (pathMatch) return pathMatch[1]
    }
    return null
  } catch {
    return null
  }
}

async function fetchDefaultTracks() {
  try {
    const res = await fetch('/data/songs.json')
    const data = (await res.json()) as { videos?: unknown[] } | unknown[]
    const videos: unknown[] = Array.isArray(data) ? data : data?.videos ?? []

    const tracks: Track[] = []
    for (const video of videos) {
      if (!video || typeof video !== 'object') continue
      const v = video as Record<string, unknown>
      const id = typeof v.id === 'string' ? v.id : undefined
      const url = typeof v.url === 'string' ? v.url : undefined
      const title = typeof v.title === 'string' ? v.title : undefined
      if (!id || !url || !title) continue
      tracks.push({
        id,
        url,
        title,
        artist: typeof v.artist === 'string' ? v.artist : undefined,
        album: typeof v.album === 'string' ? v.album : '',
      })
    }

    return tracks
  } catch (e) {
    console.error('Failed to load default ipod videos', e)
    return [] as Track[]
  }
}

async function fetchTrackMetadata(videoId: string) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
  let title = `Video ${videoId}`
  let artist: string | undefined
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`
    const resp = await fetch(oembedUrl)
    if (resp.ok) {
      const data = (await resp.json()) as { title?: string; author_name?: string }
      title = data.title || title
      artist = data.author_name || artist
    }
  } catch (e) {
    console.warn('oembed lookup failed', e)
  }
  return { title, artist, url: youtubeUrl, id: videoId }
}

const CURRENT_VERSION = 0

export const useMiniPlayerStore = create<MiniPlayerState>()(
  persist(
    (set, get) => ({
      enabled: true,
      tracks: [],
      playlists: [],
      activePlaylistId: null,
      currentIndex: -1,
      isPlaying: false,
      loopAll: true,
      loopCurrent: false,
      isShuffled: true,
      progressMs: 0,
      durationMs: 0,
      showVideo: true,
      showLyrics: true,
      showSynthwave: false,
      statusMessage: null,
      libraryState: 'uninitialized',
      initializing: false,
      setEnabled: (enabled) => set({ enabled }),
      setProgress: (ms) => set({ progressMs: ms }),
      setDuration: (ms) => set({ durationMs: ms }),
      setCurrentIndex: (index) =>
        set((state) => {
          if (index < 0 || index >= state.tracks.length) return state
          return { currentIndex: index, progressMs: 0 }
        }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
      toggleShuffle: () => set((s) => ({ isShuffled: !s.isShuffled })),
      toggleLoopCurrent: () => set((s) => ({ loopCurrent: !s.loopCurrent })),
      toggleLoopAll: () => set((s) => ({ loopAll: !s.loopAll })),
      toggleVideo: () => set((s) => ({ showVideo: !s.showVideo })),
      toggleLyrics: () => set((s) => ({ showLyrics: !s.showLyrics })),
      toggleSynthwave: () => set((s) => ({ showSynthwave: !s.showSynthwave })),
      setStatusMessage: (msg) => set({ statusMessage: msg }),
      adjustLyricOffset: (trackId, deltaMs) =>
        set((state) => {
          const tracks = state.tracks.map((t) =>
            t.id === trackId ? { ...t, lyricOffset: (t.lyricOffset ?? 0) + deltaMs } : t
          )
          return { tracks }
        }),
      initializeLibrary: async () => {
        const state = get()
        if (state.initializing) return
        if (state.tracks.length === 0) {
          storeLog('initializeLibrary -> fetching defaults')
          set({ initializing: true })
          const tracks = await fetchDefaultTracks()
          storeLog('initializeLibrary defaults loaded', tracks.length)
          set({
            tracks,
            currentIndex: tracks.length ? 0 : -1,
            activePlaylistId: null,
            libraryState: 'loaded',
            initializing: false,
          })
          return
        }
        if (state.libraryState !== 'uninitialized') return
        set({ initializing: true })
        const tracks = await fetchDefaultTracks()
        set({
          tracks,
          currentIndex: tracks.length ? 0 : -1,
          activePlaylistId: null,
          libraryState: 'loaded',
          initializing: false,
        })
      },
      nextTrack: () =>
        set((state) => {
          if (!state.tracks.length) return state
          if (state.loopCurrent) return { isPlaying: true }
          storeLog('nextTrack', { currentIndex: state.currentIndex })
          const activeTrackIds = state.activePlaylistId
            ? state.playlists.find((p) => p.id === state.activePlaylistId)?.trackIds || []
            : null

          const availableIndices = (activeTrackIds && activeTrackIds.length
            ? activeTrackIds
            : state.tracks.map((t) => t.id)
          )
            .map((id) => state.tracks.findIndex((t) => t.id === id))
            .filter((idx) => idx >= 0)

          if (!availableIndices.length) return state

          const total = availableIndices.length
          const currentPos = availableIndices.indexOf(state.currentIndex)
          let nextIndex: number
          if (state.isShuffled) {
            const choices = availableIndices.filter((i) => i !== state.currentIndex)
            nextIndex = choices.length
              ? choices[Math.floor(Math.random() * choices.length)]
              : state.currentIndex
          } else {
            const nextPos = (currentPos + 1) % total
            nextIndex = availableIndices[nextPos]
          }
          return { currentIndex: nextIndex, isPlaying: true, progressMs: 0 }
        }),
      previousTrack: () =>
        set((state) => {
          if (!state.tracks.length) return state
          storeLog('previousTrack', { currentIndex: state.currentIndex })
          const activeTrackIds = state.activePlaylistId
            ? state.playlists.find((p) => p.id === state.activePlaylistId)?.trackIds || []
            : null
          const availableIndices = (activeTrackIds && activeTrackIds.length
            ? activeTrackIds
            : state.tracks.map((t) => t.id)
          )
            .map((id) => state.tracks.findIndex((t) => t.id === id))
            .filter((idx) => idx >= 0)
          if (!availableIndices.length) return state

          const total = availableIndices.length
          const currentPos = availableIndices.indexOf(state.currentIndex)

          if (state.isShuffled) {
            const choices = availableIndices.filter((i) => i !== state.currentIndex)
            const prevIndex = choices.length
              ? choices[Math.floor(Math.random() * choices.length)]
              : state.currentIndex
            return { currentIndex: prevIndex, isPlaying: true, progressMs: 0 }
          }

          const prevPos = (currentPos - 1 + total) % total
          const prevIndex = availableIndices[prevPos]
          return { currentIndex: prevIndex, isPlaying: true, progressMs: 0 }
        }),
      addTrackFromUrl: async (urlOrId: string) => {
        const videoId = extractVideoId(urlOrId.trim())
        if (!videoId) throw new Error('Enter a valid YouTube link or video ID')
        storeLog('addTrackFromUrl', urlOrId, '->', videoId)
        const meta = await fetchTrackMetadata(videoId)
        const track: Track = {
          id: meta.id,
          url: meta.url,
          title: meta.title,
          artist: meta.artist,
        }
        const existing = get().tracks
        const already = existing.findIndex((t) => t.id === track.id)
        if (already !== -1) {
          set({ currentIndex: already, isPlaying: true, progressMs: 0 })
          return track
        }
        set({ tracks: [track, ...existing], currentIndex: 0, isPlaying: true, progressMs: 0 })
        storeLog('added new track', track)
        return track
      },
      playTrack: (trackId: string) => {
        set((state) => {
          const idx = state.tracks.findIndex((t) => t.id === trackId)
          if (idx === -1) return state
          storeLog('playTrack', trackId)
          return { currentIndex: idx, isPlaying: true, progressMs: 0 }
        })
      },
      createPlaylist: (name: string) => {
        const playlist: Playlist = { id: nanoid(8), name: name.trim() || 'Untitled', trackIds: [] }
        set((state) => ({ playlists: [...state.playlists, playlist], activePlaylistId: playlist.id }))
        return playlist
      },
      selectPlaylist: (id: string | null) => {
        set((state) => {
          if (!id) return { activePlaylistId: null, currentIndex: state.tracks.length ? 0 : -1 }
          const playlist = state.playlists.find((p) => p.id === id)
          if (!playlist) return state
          const firstIndex = playlist.trackIds
            .map((tid) => state.tracks.findIndex((t) => t.id === tid))
            .find((idx) => idx >= 0) ?? -1
          return { activePlaylistId: id, currentIndex: firstIndex }
        })
      },
      addTrackToPlaylist: (trackId, playlistId) => {
        set((state) => {
          const playlists = state.playlists.map((p) => {
            if (p.id !== playlistId) return p
            if (p.trackIds.includes(trackId)) return p
            return { ...p, trackIds: [...p.trackIds, trackId] }
          })
          return { playlists }
        })
      },
      removeTrackFromPlaylist: (trackId, playlistId) => {
        set((state) => {
          const playlists = state.playlists.map((p) =>
            p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((id) => id !== trackId) } : p
          )
          return { playlists }
        })
      },
    }),
    {
      name: 'mini-player-store',
      version: CURRENT_VERSION,
      partialize: (state) => ({
        tracks: state.tracks,
        playlists: state.playlists,
        activePlaylistId: state.activePlaylistId,
        currentIndex: state.currentIndex,
        loopAll: state.loopAll,
        loopCurrent: state.loopCurrent,
        isShuffled: state.isShuffled,
        libraryState: state.libraryState,
        showVideo: state.showVideo,
        showLyrics: state.showLyrics,
      }),
      migrate: (state) => state as any,
    }
  )
)

export const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = `${totalSeconds % 60}`.padStart(2, '0')
  return `${minutes}:${seconds}`
}
