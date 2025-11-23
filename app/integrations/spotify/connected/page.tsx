'use client'

import { useEffect } from 'react'

export default function SpotifyConnectedPage() {
  useEffect(() => {
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'spotify-connected' }, '*')
      }
      const timer = window.setTimeout(() => {
        window.close()
      }, 1200)
      return () => window.clearTimeout(timer)
    } catch (error) {
      console.error('spotify connected page error', error)
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="rounded-2xl border border-border bg-card/90 p-6 text-center shadow-xl space-y-2">
        <div className="text-lg font-semibold">Spotify connected</div>
        <p className="text-sm text-muted-foreground">You can close this tab and head back to the app.</p>
      </div>
    </div>
  )
}
