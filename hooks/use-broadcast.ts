'use client'

import { useState, useEffect, useCallback } from 'react'

interface Slide {
  title: string
  text: string
  image: string
}

interface Broadcast {
  id: string
  slides: Slide[]
  createdAt: string
}

const LAST_SEEN_BROADCAST_KEY = 'lastSeenBroadcastId'
const POLLING_INTERVAL = 30000 // 30 seconds

export function useBroadcast() {
  const [isOpen, setIsOpen] = useState(false)
  const [payload, setPayload] = useState<{ slides: Slide[] } | null>(null)

  const fetchLatestBroadcast = useCallback(async () => {
    try {
      const response = await fetch('/api/broadcast/latest', {
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new Error('Failed to fetch latest broadcast')
      }

      const latestBroadcast: Broadcast | null = await response.json()

      if (latestBroadcast) {
        const lastSeenId = localStorage.getItem(LAST_SEEN_BROADCAST_KEY)

        if (latestBroadcast.id !== lastSeenId) {
          setPayload({ slides: latestBroadcast.slides })
          setIsOpen(true)
          localStorage.setItem(LAST_SEEN_BROADCAST_KEY, latestBroadcast.id)
        }
      }
    } catch (error) {
      console.error('Error fetching broadcast:', error)
    }
  }, [])

  useEffect(() => {
    // Fetch immediately on mount
    fetchLatestBroadcast()

    // Then poll every 30 seconds
    const intervalId = setInterval(fetchLatestBroadcast, POLLING_INTERVAL)

    return () => clearInterval(intervalId)
  }, [fetchLatestBroadcast])

  const onClose = () => {
    setIsOpen(false)
    setPayload(null)
  }

  return { isOpen, onClose, payload }
}
