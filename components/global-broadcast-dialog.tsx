'use client'

import { useState, useEffect } from 'react'
import { BroadcastDialog } from '@/components/broadcast-dialog'
import { useOnboarding } from '@/hooks/use-onboarding'
import type { LatestBroadcastResponse } from '@/types/api/broadcast'

interface GlobalBroadcastDialogProps {
  latestBroadcast: LatestBroadcastResponse | null
}

function getBroadcastId(broadcast: LatestBroadcastResponse | null) {
  if (!broadcast) return 'none'
  return broadcast.id || broadcast.createdAt
}

export function GlobalBroadcastDialog({ latestBroadcast }: GlobalBroadcastDialogProps) {
  const [open, setOpen] = useState(false)
  const { showOnboarding } = useOnboarding()

  useEffect(() => {
    if (!latestBroadcast || showOnboarding) {
      setOpen(false)
      return
    }

    const id = getBroadcastId(latestBroadcast)
    const seen = typeof window !== 'undefined' ? localStorage.getItem('seen-broadcast-id') : null
    if (seen !== id) {
      setOpen(true)
    } else {
      setOpen(false)
    }
  }, [latestBroadcast, showOnboarding])

  const handleClose = () => {
    const id = getBroadcastId(latestBroadcast)
    if (typeof window !== 'undefined') {
      localStorage.setItem('seen-broadcast-id', id)
    }
    setOpen(false)
  }

  if (!latestBroadcast || showOnboarding) return null

  return <BroadcastDialog isOpen={open} onClose={handleClose} payload={latestBroadcast} />
}
