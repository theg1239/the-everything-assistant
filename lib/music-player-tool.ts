import { tool } from 'ai'
import * as z from 'zod/v3';

export type MusicPlayerToolState = {
  isPlaying: boolean
  currentTrack: { id: string; title: string; artist: string } | null
  progress: string
  duration: string
  progressPercent: number
  trackPosition: string | null
  loopMode: 'none' | 'all' | 'current'
  shuffle: boolean
  trackCount: number
  tracks: Array<{ id: string; title: string; artist: string }>
}

export function createMusicPlayerTool(playerState?: MusicPlayerToolState | null) {
  return {
    musicPlayer: tool({
      description: `Control and query the mini music player. Use this tool to:
- Get information about what song is currently playing
- Search for songs in the user's library
- Play, pause, skip to next/previous track
- Play a specific song by searching for it
- Toggle shuffle, loop modes

The music player plays YouTube videos as audio with an optional video view. The user can minimize it to a floating bubble.`,
      inputSchema: z.object({
        action: z
          .enum([
            'getStatus',
            'search',
            'play',
            'pause',
            'togglePlay',
            'next',
            'previous',
            'playTrack',
            'toggleShuffle',
            'toggleLoop',
            'setLoopMode',
          ])
          .describe(
            'Action to perform: getStatus (current playback info), search (find songs), play/pause/togglePlay (playback control), next/previous (skip tracks), playTrack (play specific song), toggleShuffle, toggleLoop, setLoopMode'
          ),
        query: z
          .string()
          .optional()
          .describe(
            'Search query for "search" or "playTrack" actions. Can be song title, artist name, or partial match.'
          ),
        trackId: z
          .string()
          .optional()
          .describe('Specific track ID to play (for playTrack action when ID is known)'),
        loopMode: z
          .enum(['none', 'all', 'current'])
          .optional()
          .describe('Loop mode to set: none (no loop), all (loop playlist), current (loop single track)'),
      }),
      execute: async ({ action, query, trackId, loopMode }) => {
        switch (action) {
          case 'getStatus': {
            if (!playerState) {
              return {
                success: true,
                action: 'getStatus',
                clientAction: 'GET_STATUS',
                status: 'unknown',
                message: 'Music player state is not available. Open the music player to load tracks.',
              }
            }

            if (!playerState.currentTrack) {
              return {
                success: true,
                action: 'getStatus',
                clientAction: 'GET_STATUS',
                status: 'idle',
                isPlaying: false,
                currentTrack: null,
                trackCount: playerState.trackCount,
                message: 'No track is currently loaded in the music player.',
              }
            }

            return {
              success: true,
              action: 'getStatus',
              clientAction: 'GET_STATUS',
              status: playerState.isPlaying ? 'playing' : 'paused',
              isPlaying: playerState.isPlaying,
              currentTrack: playerState.currentTrack,
              progress: playerState.progress,
              duration: playerState.duration,
              progressPercent: playerState.progressPercent,
              trackPosition: playerState.trackPosition,
              loopMode: playerState.loopMode,
              shuffle: playerState.shuffle,
              trackCount: playerState.trackCount,
              message: playerState.isPlaying
                ? `Now playing: "${playerState.currentTrack.title}" by ${playerState.currentTrack.artist} (${playerState.progress} / ${playerState.duration})`
                : `Paused: "${playerState.currentTrack.title}" by ${playerState.currentTrack.artist}`,
            }
          }

          case 'search': {
            if (!query) {
              return {
                success: false,
                action: 'search',
                error: 'Search query required',
                message: 'Please provide a search term to find songs.',
              }
            }

            if (!playerState?.tracks?.length) {
              return {
                success: true,
                action: 'search',
                query,
                searchResults: [],
                totalResults: 0,
                message: 'No tracks loaded in the music player to search.',
              }
            }

            const q = query.toLowerCase()
            const results = playerState.tracks.filter(t => 
              t.title.toLowerCase().includes(q) ||
              t.artist.toLowerCase().includes(q)
            )

            return {
              success: true,
              action: 'search',
              query,
              clientAction: 'SEARCH',
              searchResults: results.slice(0, 10),
              totalResults: results.length,
              message: results.length > 0 
                ? `Found ${results.length} track${results.length > 1 ? 's' : ''} matching "${query}"`
                : `No tracks found matching "${query}"`,
            }
          }

          case 'play': {
            return {
              success: true,
              action: 'play',
              clientAction: 'PLAY',
              message: 'Resuming playback.',
            }
          }

          case 'pause': {
            return {
              success: true,
              action: 'pause',
              clientAction: 'PAUSE',
              message: 'Pausing playback.',
            }
          }

          case 'togglePlay': {
            return {
              success: true,
              action: 'togglePlay',
              clientAction: 'TOGGLE_PLAY',
              message: 'Toggling playback.',
            }
          }

          case 'next': {
            return {
              success: true,
              action: 'next',
              clientAction: 'NEXT',
              message: 'Skipping to next track.',
            }
          }

          case 'previous': {
            return {
              success: true,
              action: 'previous',
              clientAction: 'PREVIOUS',
              message: 'Going to previous track.',
            }
          }

          case 'playTrack': {
            if (trackId) {
              return {
                success: true,
                action: 'playTrack',
                trackId,
                clientAction: 'PLAY_TRACK',
                message: `Playing track with ID: ${trackId}`,
              }
            }

            if (!query) {
              return {
                success: false,
                action: 'playTrack',
                error: 'Track ID or search query required',
                message: 'Please specify which song to play by name or ID.',
              }
            }

            if (playerState?.tracks?.length) {
              const q = query.toLowerCase()
              
              const exactTitle = playerState.tracks.find(t => t.title.toLowerCase() === q)
              if (exactTitle) {
                return {
                  success: true,
                  action: 'playTrack',
                  trackId: exactTitle.id,
                  clientAction: 'PLAY_TRACK',
                  matchedTrack: exactTitle,
                  message: `Playing: "${exactTitle.title}" by ${exactTitle.artist}`,
                }
              }

              const containsTitle = playerState.tracks.find(t => t.title.toLowerCase().includes(q))
              if (containsTitle) {
                return {
                  success: true,
                  action: 'playTrack',
                  trackId: containsTitle.id,
                  clientAction: 'PLAY_TRACK',
                  matchedTrack: containsTitle,
                  message: `Playing: "${containsTitle.title}" by ${containsTitle.artist}`,
                }
              }

              const artistMatch = playerState.tracks.find(t => t.artist.toLowerCase().includes(q))
              if (artistMatch) {
                return {
                  success: true,
                  action: 'playTrack',
                  trackId: artistMatch.id,
                  clientAction: 'PLAY_TRACK',
                  matchedTrack: artistMatch,
                  message: `Playing: "${artistMatch.title}" by ${artistMatch.artist}`,
                }
              }
            }

            return {
              success: true,
              action: 'playTrack',
              query,
              clientAction: 'SEARCH_AND_PLAY',
              message: `Searching for and playing: "${query}"`,
            }
          }

          case 'toggleShuffle': {
            return {
              success: true,
              action: 'toggleShuffle',
              clientAction: 'TOGGLE_SHUFFLE',
              message: 'Toggling shuffle mode.',
            }
          }

          case 'toggleLoop': {
            return {
              success: true,
              action: 'toggleLoop',
              clientAction: 'TOGGLE_LOOP',
              message: 'Cycling loop mode.',
            }
          }

          case 'setLoopMode': {
            if (!loopMode) {
              return {
                success: false,
                action: 'setLoopMode',
                error: 'Loop mode required',
                message: 'Please specify loop mode: none, all, or current.',
              }
            }
            return {
              success: true,
              action: 'setLoopMode',
              loopMode,
              clientAction: 'SET_LOOP_MODE',
              message: `Setting loop mode to: ${loopMode === 'none' ? 'off' : loopMode === 'all' ? 'loop all' : 'loop current track'}`,
            }
          }

          default:
            return {
              success: false,
              error: 'Unknown action',
              message: 'Invalid music player action.',
            }
        }
      },
    }),
  }
}
