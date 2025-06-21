'use client'

import { useEffect } from 'react'
import type { Message } from 'ai'
import type { UseChatHelpers } from 'ai/react'

export interface UseAutoResumeParams {
  autoResume: boolean
  initialMessages: Message[]
  experimental_resume: UseChatHelpers['experimental_resume']
  data: UseChatHelpers['data']
  setMessages: UseChatHelpers['setMessages']
}

export interface DataPart {
  type: string
  message?: string
  [key: string]: any
}

export function useAutoResume({
  autoResume,
  initialMessages,
  experimental_resume,
  data,
  setMessages,
}: UseAutoResumeParams) {
  useEffect(() => {
    if (!autoResume) return

    const mostRecentMessage = initialMessages.at(-1)

    if (mostRecentMessage?.role === 'user') {
      experimental_resume()
    }

    // we intentionally run this once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!data) return
    if (data.length === 0) return

    const dataPart = data[0] as DataPart

    if (dataPart.type === 'append-message') {
      if (dataPart.message) {
        try {
          const message = JSON.parse(dataPart.message) as Message
          setMessages([...initialMessages, message])
        } catch (error) {
          console.error('Failed to parse resume message:', error)
        }
      }
    }
  }, [data, initialMessages, setMessages])
}
