'use client'

import type { UseChatHelpers } from '@ai-sdk/react'
import { useEffect, useRef } from 'react'
import { useDataStream } from '@/components/data-stream-provider'
import type { AppUIMessage } from '@/lib/ai-message-conversion'
import { isRecord } from '@/lib/json'

const MESSAGE_ROLES: ReadonlySet<unknown> = new Set(['system', 'user', 'assistant'])

/** Shallow structural check for a UI message replayed by the stream-resume endpoint. */
const isAppUIMessage = (value: unknown): value is AppUIMessage =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  MESSAGE_ROLES.has(value.role) &&
  Array.isArray(value.parts)

export type UseAutoResumeParams = {
  autoResume: boolean
  initialMessages: AppUIMessage[]
  resumeStream: UseChatHelpers<AppUIMessage>['resumeStream']
  setMessages?: UseChatHelpers<AppUIMessage>['setMessages']
}

/**
 * Re-attaches to an in-flight chat stream after reloads or network hiccups.
 * Adapted from Scira's `useAutoResume`.
 *
 * - On mount, if the last message is from the user and `autoResume` is on, we
 *   kick off `resumeStream()` to continue from the server's buffered state.
 * - When `setMessages` is provided, also subscribes to `data-appendMessage`
 *   data-stream parts so that a server-side replay can push the final
 *   assistant message back into the transcript.
 */
export function useAutoResume({
  autoResume,
  initialMessages,
  resumeStream,
  setMessages,
}: UseAutoResumeParams) {
  const { dataStream } = useDataStream()
  const hasAttemptedAutoResumeRef = useRef(false)

  useEffect(() => {
    if (!autoResume) return
    if (hasAttemptedAutoResumeRef.current) return
    hasAttemptedAutoResumeRef.current = true

    const mostRecentMessage = initialMessages.at(-1)

    if (mostRecentMessage?.role === 'user') {
      void resumeStream()
    }
  }, [autoResume, initialMessages, resumeStream])

  useEffect(() => {
    if (!setMessages) return
    if (!dataStream || dataStream.length === 0) return

    const dataPart = dataStream[0]

    if (dataPart?.type === 'data-appendMessage') {
      try {
        const message: unknown = JSON.parse(String(dataPart.data))
        if (!isAppUIMessage(message)) throw new Error('appended message has an unexpected shape')
        setMessages([...initialMessages, message])
      } catch (err) {
        console.warn('useAutoResume: failed to parse appended message', err)
      }
    }
  }, [dataStream, initialMessages, setMessages])
}
