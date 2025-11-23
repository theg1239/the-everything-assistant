'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  SpotifyApiError,
  SpotifyNotLinkedError,
  fetchSpotifyProfile,
  formatSpotifyScopes,
  getCurrentPlayback,
  getSpotifyAccount,
  hasRequiredScopes,
  isSpotifyEnabled,
  mapPlaybackToSimplified,
  sendSpotifyCommand,
} from '@/lib/spotify'
import { prisma } from '@/lib/prisma'
import type { SpotifyPlaybackResponse, SpotifyStatusResponse } from '@/types/spotify'

async function requireSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    throw new Error('unauthorized')
  }
  return session
}

export async function getSpotifyStatusAction(): Promise<SpotifyStatusResponse> {
  const enabled = isSpotifyEnabled()
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return { enabled, connected: false }
    }

    if (!enabled) {
      return {
        enabled: false,
        connected: false,
        reason: 'Spotify credentials are not configured',
      }
    }

    const account = await getSpotifyAccount(session.user.id)
    if (!account) {
      return { enabled: true, connected: false }
    }

    let profile: any = null
    try {
      const rawProfile: any = await fetchSpotifyProfile(session.user.id)
      profile = {
        id: rawProfile?.id,
        displayName: rawProfile?.display_name ?? rawProfile?.id,
        email: rawProfile?.email,
        product: rawProfile?.product,
      }
    } catch (error) {
      profile = null
    }

    return {
      enabled: true,
      connected: true,
      profile,
      scopes: formatSpotifyScopes(account.scope),
      hasRequiredScopes: hasRequiredScopes(account.scope),
      expiresAt: account.expires_at ?? null,
    }
  } catch (error) {
    console.error('spotify status action error', error)
    return { enabled, connected: false, reason: 'Unable to determine status' }
  }
}

export async function getSpotifyPlaybackAction(): Promise<SpotifyPlaybackResponse> {
  const enabled = isSpotifyEnabled()
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return { enabled, connected: false }
  }

  if (!enabled) {
    return { enabled: false, connected: false, error: 'Spotify is not configured' }
  }

  try {
    const state: any = await getCurrentPlayback(session.user.id)
    const playback = mapPlaybackToSimplified(state)
    return { enabled: true, connected: true, playback, timestamp: Date.now() }
  } catch (error) {
    if (error instanceof SpotifyNotLinkedError) {
      return { enabled: true, connected: false }
    }
    if (error instanceof SpotifyApiError) {
      return {
        enabled: true,
        connected: true,
        error: error.message,
        playback: null,
      }
    }
    console.error('spotify playback action error', error)
    return { enabled: true, connected: true, error: 'Unexpected error' }
  }
}

export async function controlSpotifyAction(
  action: 'play' | 'pause' | 'next' | 'previous' | 'toggle' | 'seek',
  positionMs?: number
) {
  const session = await requireSession()

  if (action === 'toggle') {
    const state = await getCurrentPlayback(session.user.id)
    const isPlaying = Boolean(state?.is_playing)
    await sendSpotifyCommand(session.user.id, isPlaying ? 'pause' : 'play')
    return { ok: true, state: isPlaying ? 'paused' : 'playing' }
  }

  if (action === 'seek') {
    if (typeof positionMs !== 'number') {
      throw new Error('positionMs is required for seek')
    }
    await sendSpotifyCommand(session.user.id, 'seek', positionMs)
    return { ok: true }
  }

  await sendSpotifyCommand(session.user.id, action)
  return { ok: true }
}

export async function disconnectSpotifyAction() {
  const session = await requireSession()
  await prisma.account.deleteMany({ where: { userId: session.user.id, provider: 'spotify' } })
  return { ok: true }
}
