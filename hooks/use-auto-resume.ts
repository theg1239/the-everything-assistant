'use client'

import { useEffect } from 'react'
import type { LegacyMessage } from '@/lib/ai-message-conversion'

export interface UseAutoResumeParams {
  autoResume: boolean
  initialMessages: LegacyMessage[]
  resumeStream?: () => Promise<void>
}

export function useAutoResume({ autoResume, initialMessages, resumeStream }: UseAutoResumeParams) {
  useEffect(() => {
    if (!autoResume) return
    if (!resumeStream) return

    const mostRecentMessage = initialMessages.at(-1)

    if (mostRecentMessage?.role === 'user') {
      resumeStream().catch(error => {
        console.error('Failed to resume chat stream:', error)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
