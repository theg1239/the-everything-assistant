'use client'

import dynamic from 'next/dynamic'

/*
 * Root-layout widgets that render nothing during SSR / first paint (the dialogs
 * open from effects; the mini player is a floating bubble). Loading them as
 * client-only chunks keeps their code (react-player, vaul, framer-motion
 * drawers, broadcast slides) out of the JS every route needs before hydration.
 */

export const SpotifyBubble = dynamic(() => import('@/components/spotify-bubble'), { ssr: false })

export const PWAInstallDialog = dynamic(
  () => import('@/components/pwa-install-dialog').then(mod => mod.PWAInstallDialog),
  { ssr: false }
)

export const GlobalBroadcastDialog = dynamic(
  () => import('@/components/global-broadcast-dialog').then(mod => mod.GlobalBroadcastDialog),
  { ssr: false }
)
