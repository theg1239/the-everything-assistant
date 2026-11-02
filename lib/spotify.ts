import * as z from 'zod'
import { prisma } from '@/lib/prisma'
import type { Account } from '@/prisma/generated/client'

/** Lenient field: a wrong type is treated as absent rather than failing the whole payload. */
const optionalOf = <T extends z.ZodType>(schema: T) => schema.nullish().catch(undefined)

const spotifyTokenResponseSchema = z.object({
  access_token: optionalOf(z.string()),
  refresh_token: optionalOf(z.string()),
  expires_in: optionalOf(z.number()),
  scope: optionalOf(z.string()),
  token_type: optionalOf(z.string()),
  error: optionalOf(z.string()),
  error_description: optionalOf(z.string()),
})

const spotifyErrorBodySchema = z.object({
  error: optionalOf(z.object({ message: optionalOf(z.string()) })),
})

const spotifyPlaybackStateSchema = z.object({
  is_playing: optionalOf(z.boolean()),
  progress_ms: optionalOf(z.number()),
  item: optionalOf(
    z.object({
      type: optionalOf(z.string()),
      id: optionalOf(z.string()),
      name: optionalOf(z.string()),
      duration_ms: optionalOf(z.number()),
      album: optionalOf(
        z.object({
          name: optionalOf(z.string()),
          images: optionalOf(z.array(z.object({ url: optionalOf(z.string()) }))),
        })
      ),
      artists: optionalOf(z.array(z.object({ name: optionalOf(z.string()) }))),
      external_urls: optionalOf(z.object({ spotify: optionalOf(z.string()) })),
    })
  ),
  device: optionalOf(
    z.object({
      id: optionalOf(z.string()),
      name: optionalOf(z.string()),
      type: optionalOf(z.string()),
      volume_percent: optionalOf(z.number()),
    })
  ),
})

export type SpotifyPlaybackState = z.infer<typeof spotifyPlaybackStateSchema>

/** Parses a JSON body leniently; unparseable or non-object bodies become `{}`. */
const readJsonBody = async <T extends z.ZodType>(
  response: Response,
  schema: T
): Promise<z.infer<T> | Record<string, never>> => {
  const parsed = schema.safeParse(await response.json().catch(() => ({})))
  return parsed.success ? parsed.data : {}
}

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

  const json = await readJsonBody(res, spotifyTokenResponseSchema)

  if (!res.ok) {
    throw new SpotifyTokenError(
      json?.error_description || json?.error || 'Failed to refresh Spotify access token'
    )
  }

  const expiresAt = Math.floor(Date.now() / 1000) + (json?.expires_in ?? 3600)

  const updated = await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: json?.access_token ?? undefined,
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

/** Raw `GET /me` payload; callers validate the fields they surface. */
export async function fetchSpotifyProfile(userId: string): Promise<unknown> {
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

export async function getCurrentPlayback(userId: string): Promise<SpotifyPlaybackState | null> {
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
    if (!refreshed.access_token) {
      throw new SpotifyTokenError('Spotify access token missing after refresh')
    }
    response = await fetchState(refreshed.access_token)
  }

  if (response.status === 204) return null

  const body: unknown = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorBody = spotifyErrorBodySchema.safeParse(body)
    throw new SpotifyApiError(
      (errorBody.success && errorBody.data.error?.message) || 'Failed to fetch playback',
      response.status
    )
  }

  const state = spotifyPlaybackStateSchema.safeParse(body)
  return state.success ? state.data : {}
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
    if (!refreshed.access_token) {
      throw new SpotifyTokenError('Spotify access token missing after refresh')
    }
    response = await buildRequest(refreshed.access_token)
  }

  if (!response.ok && response.status !== 204) {
    const json = await readJsonBody(response, spotifyErrorBodySchema)
    throw new SpotifyApiError(json.error?.message || 'Spotify command failed', response.status)
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

export function mapPlaybackToSimplified(
  state: SpotifyPlaybackState | null
): SimplifiedPlayback | null {
  if (!state) return null

  const item = state.item?.type === 'track' ? state.item : undefined

  const track = item
    ? {
        id: item.id ?? undefined,
        name: item.name ?? undefined,
        album: item.album?.name ?? undefined,
        artists: item.artists?.map(a => a.name).join(', '),
        albumArt:
          item.album?.images?.[1]?.url ||
          item.album?.images?.[0]?.url ||
          item.album?.images?.[2]?.url ||
          undefined,
        externalUrl: item.external_urls?.spotify ?? undefined,
      }
    : undefined

  return {
    isPlaying: Boolean(state.is_playing),
    progressMs: state.progress_ms ?? 0,
    durationMs: item ? (item.duration_ms ?? 0) : 0,
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
