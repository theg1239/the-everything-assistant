export type SpotifyProfile = {
  id?: string
  displayName?: string
  email?: string
  product?: string
}

export type SpotifyStatusResponse = {
  enabled: boolean
  connected: boolean
  hasRequiredScopes?: boolean
  expiresAt?: number | null
  profile?: SpotifyProfile | null
  scopes?: string[]
  reason?: string
}

export type SpotifyPlayback = {
  isPlaying: boolean
  progressMs: number
  durationMs: number
  track?: {
    id?: string
    name?: string
    album?: string
    artists?: string
    albumArt?: string
    externalUrl?: string
  }
  device?: {
    id?: string | null
    name?: string | null
    type?: string | null
    volume?: number | null
  }
}

export type SpotifyPlaybackResponse = {
  enabled: boolean
  connected: boolean
  playback?: SpotifyPlayback | null
  error?: string
  timestamp?: number
}
