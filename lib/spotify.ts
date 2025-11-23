import { prisma } from '@/lib/prisma'
import type { Account } from '@/prisma/generated/client'

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'
const REQUIRED_SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
]

export class SpotifyNotLinkedError extends Error {
  constructor(message = 'Spotify account not linked') {
    super(message)
    this.name = 'SpotifyNotLinkedError'
  }
}

export class SpotifyTokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpotifyTokenError'
  }
}

export class SpotifyApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'SpotifyApiError'
    this.status = status
  }
}

export const isSpotifyEnabled = () =>
  Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)

export const hasRequiredScopes = (scopeString?: string | null) => {
  if (!scopeString) return false
  const scopes = scopeString.split(' ').filter(Boolean)
  return REQUIRED_SCOPES.every(scope => scopes.includes(scope))
}

export const formatSpotifyScopes = (scopeString?: string | null) =>
  scopeString?.split(' ').filter(Boolean) ?? []

export async function getSpotifyAccount(userId: string) {
  return prisma.account.findFirst({ where: { userId, provider: 'spotify' } })
}

export async function refreshSpotifyAccessToken(account: Account) {
  if (!isSpotifyEnabled()) {
    throw new SpotifyTokenError('Spotify credentials are not configured')
  }

  if (!account.refresh_token) {
    throw new SpotifyTokenError('No Spotify refresh token available')
  }

  const basicAuth = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
    }),
  })

  const json: any = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new SpotifyTokenError(
      json?.error_description || json?.error || 'Failed to refresh Spotify access token'
    )
  }

  const expiresAt = Math.floor(Date.now() / 1000) + (json?.expires_in ?? 3600)

  const updated = await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: json?.access_token,
      expires_at: expiresAt,
      refresh_token: json?.refresh_token ?? account.refresh_token,
      scope: json?.scope ?? account.scope,
      token_type: json?.token_type ?? account.token_type,
    },
  })

  return updated
}

export async function ensureSpotifyAccess(userId: string) {
  const account = await getSpotifyAccount(userId)
  if (!account || !account.access_token) return null

  const expiryMs = account.expires_at ? account.expires_at * 1000 : null
  const isExpired = expiryMs ? expiryMs <= Date.now() + 60_000 : false

  if (!isExpired) {
    return { token: account.access_token, account }
  }

  const refreshed = await refreshSpotifyAccessToken(account)

  if (!refreshed.access_token) {
    throw new SpotifyTokenError('Spotify access token missing after refresh')
  }

  return { token: refreshed.access_token, account: refreshed }
}

export async function fetchSpotifyProfile(userId: string) {
  const auth = await ensureSpotifyAccess(userId)
  if (!auth?.token) throw new SpotifyNotLinkedError()

  const response = await fetch(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    cache: 'no-store',
  })

  if (response.status === 401 && auth.account) {
    const refreshed = await refreshSpotifyAccessToken(auth.account)
    const retry = await fetch(`${SPOTIFY_API_BASE}/me`, {
      headers: { Authorization: `Bearer ${refreshed.access_token}` },
      cache: 'no-store',
    })
    if (!retry.ok) throw new SpotifyApiError('Failed to load Spotify profile', retry.status)
    return retry.json()
  }

  if (!response.ok) {
    throw new SpotifyApiError('Failed to load Spotify profile', response.status)
  }

  return response.json()
}

export async function getCurrentPlayback(userId: string) {
  const auth = await ensureSpotifyAccess(userId)
  if (!auth?.token) throw new SpotifyNotLinkedError()

  const fetchState = async (token: string) =>
    fetch(`${SPOTIFY_API_BASE}/me/player`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

  let response = await fetchState(auth.token)

  if (response.status === 401 && auth.account) {
    const refreshed = await refreshSpotifyAccessToken(auth.account)
    response = await fetchState(refreshed.access_token!)
  }

  if (response.status === 204) return null

  const json: any = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new SpotifyApiError(json?.error?.message || 'Failed to fetch playback', response.status)
  }

  return json
}

export async function sendSpotifyCommand(
  userId: string,
  action: 'next' | 'previous' | 'play' | 'pause' | 'seek',
  positionMs?: number
) {
  const auth = await ensureSpotifyAccess(userId)
  if (!auth?.token) throw new SpotifyNotLinkedError()

  const buildRequest = (token: string) => {
    let url = ''
    let method: 'POST' | 'PUT' = 'POST'

    switch (action) {
      case 'next':
        url = `${SPOTIFY_API_BASE}/me/player/next`
        break
      case 'previous':
        url = `${SPOTIFY_API_BASE}/me/player/previous`
        break
      case 'pause':
        url = `${SPOTIFY_API_BASE}/me/player/pause`
        method = 'PUT'
        break
      case 'play':
        url = `${SPOTIFY_API_BASE}/me/player/play`
        method = 'PUT'
        break
      case 'seek':
        url = `${SPOTIFY_API_BASE}/me/player/seek?position_ms=${positionMs ?? 0}`
        method = 'PUT'
        break
    }

    return fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    })
  }

  let response = await buildRequest(auth.token)

  if (response.status === 401 && auth.account) {
    const refreshed = await refreshSpotifyAccessToken(auth.account)
    response = await buildRequest(refreshed.access_token!)
  }

  if (!response.ok && response.status !== 204) {
    const json: any = await response.json().catch(() => ({}))
    throw new SpotifyApiError(json?.error?.message || 'Spotify command failed', response.status)
  }

  return true
}

export type SimplifiedPlayback = {
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

export function mapPlaybackToSimplified(state: any): SimplifiedPlayback | null {
  if (!state) return null

  const item = state.item
  const isTrack = item && item.type === 'track'

  const track = isTrack
    ? {
        id: item.id,
        name: item.name,
        album: item.album?.name,
        artists: item.artists?.map((a: any) => a.name).join(', '),
        albumArt:
          item.album?.images?.[1]?.url || item.album?.images?.[0]?.url || item.album?.images?.[2]?.url,
        externalUrl: item.external_urls?.spotify,
      }
    : undefined

  return {
    isPlaying: Boolean(state.is_playing),
    progressMs: state.progress_ms ?? 0,
    durationMs: isTrack ? item.duration_ms ?? 0 : 0,
    track,
    device: state.device
      ? {
          id: state.device.id,
          name: state.device.name,
          type: state.device.type,
          volume: state.device.volume_percent,
        }
      : undefined,
  }
}
