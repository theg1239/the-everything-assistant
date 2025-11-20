'use client'

import { useEffect } from 'react'
import { useChat, type UseChatHelpers } from '@ai-sdk/react'
import type { ChatTransport } from 'ai'
import type { MutableRefObject, Dispatch, SetStateAction } from 'react'
import type { AppUIMessage } from '@/lib/ai-message-conversion'

type ChatEngineRefs = {
  fallbackChatIdRef?: MutableRefObject<string>
  currentChatIdRef?: MutableRefObject<string | undefined>
  currentChatPathRef?: MutableRefObject<string | undefined>
}

export interface UseChatEngineOptions {
  resolvedChatId?: string
  initialUiMessages: AppUIMessage[]
  autoResume?: boolean
  chatTransport: ChatTransport<AppUIMessage>
  pathname?: string | null
  router?: any
  setOptimisticChatId?: (id?: string) => void
  setResolvedChatId?: (id: string) => void
  refs?: ChatEngineRefs
  chatCreatedEventDispatched?: boolean
  setChatCreatedEventDispatched?: (value: boolean) => void
  setLastAssistantMessage?: (message: string) => void
  userPreferences?: any
  setShowFollowUpSuggestions?: (value: boolean) => void
  isFirstMessageInNewChat?: boolean
  setIsFirstMessageInNewChat?: (value: boolean) => void
  setUiMessages?: Dispatch<SetStateAction<AppUIMessage[]>>
  setErrorMessage?: (value: string | null) => void
  initialTitle?: string
}

export function useChatEngine({
  resolvedChatId,
  initialUiMessages,
  autoResume = true,
  chatTransport,
  pathname,
  setResolvedChatId,
  refs,
  setLastAssistantMessage,
  userPreferences,
  setShowFollowUpSuggestions,
  setIsFirstMessageInNewChat,
  setErrorMessage,
}: UseChatEngineOptions): UseChatHelpers<AppUIMessage> {
  const chat = useChat<AppUIMessage>({
    id: resolvedChatId ?? refs?.fallbackChatIdRef?.current,
    messages: initialUiMessages,
    transport: chatTransport,
    resume: autoResume,
    experimental_throttle: 80,
    onFinish: ({ messages }) => {
      const lastAssistant = [...messages].reverse().find(message => message.role === 'assistant')
      if (lastAssistant && typeof lastAssistant.content === 'string') {
        setLastAssistantMessage?.(lastAssistant.content.slice(0, 400))
        if (userPreferences?.followUpSuggestions) {
          setShowFollowUpSuggestions?.(true)
        }
      }
      setIsFirstMessageInNewChat?.(false)
    },
    onError: error => {
      setErrorMessage?.(error?.message ?? 'An unexpected error occurred')
    },
  })

  useEffect(() => {
    if (chat.id && setResolvedChatId) {
      setResolvedChatId(chat.id)
    }
    if (refs?.currentChatIdRef) {
      refs.currentChatIdRef.current = chat.id
    }
  }, [chat.id, refs?.currentChatIdRef, setResolvedChatId])

  useEffect(() => {
    if (refs?.currentChatPathRef && pathname) {
      refs.currentChatPathRef.current = pathname
    }
  }, [pathname, refs?.currentChatPathRef])

  return chat
}
