'use client'

import { useState, useRef, useEffect, memo, useCallback, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useMemory } from '@/contexts/memory-context'
import { VirtualizedMessages } from '@/components/virtualized-messages'
import { motion } from 'framer-motion'
import { Download, Plus, ChevronDown, GraduationCap } from 'lucide-react'
import { HamburgerButton } from '@/components/hamburger-button'
import { Button } from '@/components/ui/button'
import { SuggestedQuestions } from '@/components/suggested-questions'
import { FollowUpSuggestions } from '@/components/follow-up-suggestions'
import { ChatHeader } from '@/components/chat-header'
import { MobilePdfDockButton, DesktopPdfDockButton } from '@/components/pdf-dock'
import { MultimodalInput } from '@/components/multimodal-input'
import Hub, { type HubActionHandlers } from '@/components/hub/hub'
import { HubStoreProvider } from '@/components/hub/hub-store'
import { HUB_COMMANDS } from '@/types/hub'
import type { PersonalHubState, HubVTOPCommand } from '@/types/hub'
import { extractTitleFromContent, generateUUID } from '@/lib/utils'
import UpsellBanner from '@/components/upsell-banner'
import { VTOPToolHandler } from '@/components/vtop-tool-handler'
import { VTOPProvider, useVTOP } from '@/contexts/vtop-context'
import { RateLimitProvider, useRateLimit } from '@/contexts/rate-limit-context'
import { RateLimitErrorDisplay } from '@/components/rate-limit-error-display'
import { OnboardingDialog } from '@/components/onboarding-dialog'
import { useOnboarding } from '@/hooks/use-onboarding'
import { toast } from 'sonner'
import { readJson } from '@/lib/http'
import type { UserPreferencesResponse } from '@/types/preferences'
import ScrollToTopButton from '@/components/scroll-to-top-button'
import { cn } from '@/lib/utils'
import { useThrottle } from '@/hooks/use-debounce'
import { useAutoResume } from '@/hooks/use-auto-resume'
import { useSidebar } from '@/contexts/sidebar-context'
import { StreamingErrorDisplay } from '@/components/streaming-error-display'
import { DynamicLoadingIndicator } from '@/components/dynamic-loading-indicator'
import {
  HUB_BRIEFING_ACTION_EVENT,
  HUB_BRIEFING_ACTION_PARAM,
  HUB_BRIEFING_TRIGGER_PARAM,
  HUB_BRIEFING_TRIGGER_VALUE,
} from '@/lib/hub/constants'
import { useChatStore } from '@/hooks/use-chat-store'

type Message = LegacyMessage

type MutableAppMessage = AppUIMessage & {
  content?: string
  toolInvocations?: any[]
}

interface ChatSummaryResponse {
  title?: string
  messages?: LegacyMessage[]
}

const useViewportHeight = () => {
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    const setVh = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        requestAnimationFrame(() => {
          const vh = window.innerHeight * 0.01
          document.documentElement.style.setProperty('--vh', `${vh}px`)
          const viewport = window.visualViewport
          const height = viewport ? viewport.height : window.innerHeight
          document.documentElement.style.setProperty('--app-height', `${height}px`)
          if (mainRef.current) {
            mainRef.current.style.height = `calc(var(--vh, 1vh) * 100)`
          }
          if (
            window.innerWidth <= 768 &&
            (!window.visualViewport || window.visualViewport.scale <= 1)
          ) {
            window.scrollTo(0, 0)
          }
        })
      }, 25)
    }

    const handleVisualViewportChange = () => setVh()

    setVh()
    window.addEventListener('resize', setVh, { passive: true })
    window.addEventListener('orientationchange', () => setTimeout(setVh, 50), { passive: true }) // Reduced from 100ms to 50ms
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange)
    }

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', setVh)
      window.removeEventListener('orientationchange', () => setTimeout(setVh, 50)) // Updated to match the above
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange)
      }
    }
  }, [])

  return mainRef
}

import { MemoryWithId } from '@/hooks/use-memories'
import {
  legacyMessageToUiMessage,
  legacyMessagesToUiMessages,
  uiMessageToLegacyMessage,
  uiMessagesToLegacyMessages,
  type LegacyMessage,
  type AppUIMessage,
} from '@/lib/ai-message-conversion'

const getLegacyMessageText = (message: LegacyMessage | null | undefined): string =>
  message?.content ?? ''

function memoryToMessage(memory: MemoryWithId): Message {
  return {
    id: memory.id,
    content: memory.content,
    role: 'system',
    createdAt: memory.createdAt,
    metadata: {
      memory: true,
      importance: memory.importance,
      tags: memory.tags,
    },
  }
}

const EMPTY_HUB_STATE: PersonalHubState = {
  isLinked: false,
  snapshots: [],
  lastSyncedAt: null,
}

const HUB_COMMAND_LOOKUP = new Set<HubVTOPCommand>(HUB_COMMANDS)

const areHubActionsEqual = (a?: HubActionHandlers, b?: HubActionHandlers) => {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.refreshState === b.refreshState &&
    a.syncCore === b.syncCore &&
    a.refreshVTOP === b.refreshVTOP &&
    a.runTool === b.runTool
  )
}

interface ChatInterfaceProps {
  initialMessages?: Message[]
  chatId?: string
  autoResume?: boolean
  initialHubState?: PersonalHubState
  hubActions?: HubActionHandlers
}

const DAILY_BRIEFING_STORAGE_KEY = 'ea.hub.daily-briefing-date'

function PureChatInterfaceComponent({
  initialMessages = [],
  chatId,
  autoResume = false,
  initialHubState,
  hubActions,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const showFullChat = useChatStore(state => state.showFullChat)
  const setShowFullChat = useChatStore(state => state.setShowFullChat)
  const selectedTool = useChatStore(state => state.selectedTool)
  const setSelectedTool = useChatStore(state => state.setSelectedTool)
  const lastUserMessage = useChatStore(state => state.lastUserMessage)
  const setLastUserMessage = useChatStore(state => state.setLastUserMessage)
  const resetChatStore = useChatStore(state => state.reset)
  const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()
  const [hubOpen, setHubOpen] = useState(false)
  const [pendingBriefingAction, setPendingBriefingAction] = useState<HubVTOPCommand | null>(null)
  const [showDailyBriefingLabel, setShowDailyBriefingLabel] = useState(false)
  const hubSeed = initialHubState ?? EMPTY_HUB_STATE
  const hubActionHandlers = useMemo<HubActionHandlers>(() => {
    if (hubActions) return hubActions
    return {
      refreshState: async () => hubSeed,
      syncCore: async () => hubSeed,
      refreshVTOP: async () => {
        throw new Error('hub actions are unavailable in this context')
      },
      runTool: async () => {
        throw new Error('hub actions are unavailable in this context')
      },
    }
  }, [hubActions, hubSeed])
  const [vtopLoading, setVtopLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hasUserInitiatedConversation, setHasUserInitiatedConversation] = useState(false)
  const [isInitialRender, setIsInitialRender] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [isFirstMessageInNewChat, setIsFirstMessageInNewChat] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const [showFollowUpSuggestions, setShowFollowUpSuggestions] = useState(false)
  const [lastAssistantMessage, setLastAssistantMessage] = useState<string>('')
  const [userPreferences, setUserPreferences] = useState<any>({ followUpSuggestions: true })
  const [chatCreatedEventDispatched, setChatCreatedEventDispatched] = useState(false)
  const [maximizedArtifact, setMaximizedArtifact] = useState<any>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [optimisticChatId, setOptimisticChatId] = useState<string | undefined>(chatId)
  const fallbackChatIdRef = useRef<string>(chatId ?? generateUUID())
  useEffect(() => {
    if (chatId) {
      fallbackChatIdRef.current = chatId
    }
  }, [chatId])
  useEffect(() => {
    if (!chatId && optimisticChatId) {
      fallbackChatIdRef.current = optimisticChatId
    }
  }, [chatId, optimisticChatId])
  const persistedChatId = chatId ?? optimisticChatId
  const resolvedChatId = persistedChatId ?? fallbackChatIdRef.current
  const currentChatIdRef = useRef<string | undefined>(chatId)
  const { updateToolResult, clearToolResult } = useVTOP()
  const { rateLimitError, clearRateLimitError, checkForRateLimitError } = useRateLimit()
  const { data: session } = useSession()
  const memory = useMemory()
  const { showOnboarding, closeOnboarding } = useOnboarding()

  const mainRef = useViewportHeight()

  useEffect(() => {
    setShowFullChat(initialMessages.length > 0)
  }, [initialMessages.length, setShowFullChat])

  const [vtopDisclaimer, setVtopDisclaimer] = useState<{
    toolCallId: string
    command: string
    message: string
  } | null>(null)

  useEffect(() => {
    const onBeforeInstallPrompt = (e: any) => {
      try {
        e.preventDefault()
      } catch {}
      setDeferredPrompt(e)
      setCanInstall(true)
    }

    const onAppInstalled = () => {
      setIsInstalled(true)
      setCanInstall(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener)
    window.addEventListener('appinstalled', onAppInstalled as EventListener)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener)
      window.removeEventListener('appinstalled', onAppInstalled as EventListener)
    }
  }, [])

  useEffect(() => {
    const handleShare = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail
      if (!detail?.text) return
      setShowFullChat(true)
      setInput(detail.text)
    }
    window.addEventListener('hubShareToChat', handleShare as EventListener)
    return () => window.removeEventListener('hubShareToChat', handleShare as EventListener)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateLabel = () => {
      const now = new Date()
      const todayKey = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now
        .getDate()
        .toString()
        .padStart(2, '0')}`}`
      const lastSeen = window.localStorage.getItem(DAILY_BRIEFING_STORAGE_KEY)
      setShowDailyBriefingLabel(!lastSeen || lastSeen !== todayKey)
    }
    updateLabel()
    const seenListener = () => updateLabel()
    const resetListener = () => updateLabel()
    window.addEventListener('ea.dailyBriefingSeen', seenListener)
    window.addEventListener('ea.dailyBriefingReset', resetListener)
    return () => {
      window.removeEventListener('ea.dailyBriefingSeen', seenListener)
      window.removeEventListener('ea.dailyBriefingReset', resetListener)
    }
  }, [])

  useEffect(() => {
    if (!searchParams) return
    const trigger = searchParams.get(HUB_BRIEFING_TRIGGER_PARAM)
    const actionValue = searchParams.get(HUB_BRIEFING_ACTION_PARAM)
    const shouldOpen = trigger === HUB_BRIEFING_TRIGGER_VALUE || Boolean(actionValue)
    if (!shouldOpen) return
    setHubOpen(true)
    if (actionValue && HUB_COMMAND_LOOKUP.has(actionValue as HubVTOPCommand)) {
      setPendingBriefingAction(actionValue as HubVTOPCommand)
    }
    const params = new URLSearchParams(searchParams.toString())
    params.delete(HUB_BRIEFING_TRIGGER_PARAM)
    params.delete(HUB_BRIEFING_ACTION_PARAM)
    const next = params.toString()
    const nextUrl = next ? `${pathname}?${next}` : pathname
    router.replace(nextUrl, { scroll: false })
  }, [searchParams, pathname, router])

  useEffect(() => {
    if (!pendingBriefingAction || !hubOpen) return
    const timeout = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(HUB_BRIEFING_ACTION_EVENT, {
          detail: { command: pendingBriefingAction },
        })
      )
      setPendingBriefingAction(null)
    }, 400)
    return () => window.clearTimeout(timeout)
  }, [pendingBriefingAction, hubOpen])

  const handleInstallClick = async () => {
    if (deferredPrompt && deferredPrompt.prompt) {
      try {
        await deferredPrompt.prompt()
        const choiceResult = await deferredPrompt.userChoice
        if (choiceResult && choiceResult.outcome === 'accepted') {
          setIsInstalled(true)
        }
      } catch (err) {
      } finally {
        setDeferredPrompt(null)
        setCanInstall(false)
      }
      return
    }

    window.dispatchEvent(new CustomEvent('showPwaInstallHint'))
  }

  useEffect(() => {
    const onDisclaimer = (e: any) => {
      const d = e?.detail
      if (!d) return
      setVtopDisclaimer({ toolCallId: d.toolCallId, command: d.command, message: d.message })
    }
    window.addEventListener('vtopCredentialsDisclaimer', onDisclaimer as EventListener)
    return () =>
      window.removeEventListener('vtopCredentialsDisclaimer', onDisclaimer as EventListener)
  }, [])

  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    const checkMobile = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const isMobileNow = window.innerWidth <= 768
        if (isMobileNow !== isMobile) {
          setIsMobile(isMobileNow)
        }
      }, 100)
    }
    const checkZoom = () => {
      if (window.visualViewport) {
        const scale = window.visualViewport.scale || 1
        const isZoomedNow = scale > 1.1
        if (isZoomedNow !== isZoomed) {
          setIsZoomed(isZoomedNow)
        }
      }
    }
    checkMobile()
    checkZoom()
    window.addEventListener('resize', checkMobile, { passive: true })
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', checkZoom, { passive: true })
    }
    if (window.innerWidth <= 768 && document.readyState === 'complete') {
      setTimeout(() => window.scrollTo(0, 0), 50)
    }
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', checkMobile)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', checkZoom)
      }
    }
  }, [isMobile, isZoomed])

  useEffect(() => {
    currentChatIdRef.current = resolvedChatId
  }, [resolvedChatId])
  useEffect(() => {
    const hasUser = initialMessages.some(m => m.role === 'user')
    setHasUserInitiatedConversation(hasUser)
    setIsFirstMessageInNewChat(initialMessages.length === 0)
  }, [initialMessages])

  useEffect(() => {
    const loadPreferences = async () => {
      if (!session?.user?.email) return
      try {
        const response = await fetch('/api/user/preferences')
        if (response.ok) {
          const data = await readJson<UserPreferencesResponse>(response)
          setUserPreferences(data.preferences)
        }
      } catch (error) {
        console.error('Error loading user preferences:', error)
      }
    }
    if (session?.user?.email) {
      loadPreferences()
    }
  }, [session?.user?.email])

  const initialUiMessages = useMemo(
    () => legacyMessagesToUiMessages(initialMessages),
    [initialMessages]
  )

  const chatTransport = useMemo(() => {
    return new DefaultChatTransport<AppUIMessage>({
      api: '/api/chat',
      credentials: 'same-origin',
      prepareSendMessagesRequest: ({ messages: outgoingMessages, body, ...rest }) => {
        const messagesWithMetadata =
          selectedTool && outgoingMessages.length > 0
            ? outgoingMessages.map((msg, index, array) =>
                index === array.length - 1
                  ? {
                      ...msg,
                      metadata: { ...(msg.metadata || {}), preferredTool: selectedTool },
                    }
                  : msg
              )
            : outgoingMessages
        return {
          ...rest,
          body: {
            ...(body || {}),
            messages: messagesWithMetadata,
            id: resolvedChatId,
            ...(selectedTool ? { preferredTool: selectedTool } : {}),
          },
        }
      },
    })
  }, [resolvedChatId, selectedTool])

  const {
    messages: uiMessages = [],
    sendMessage,
    stop,
    setMessages: setUiMessages,
    error,
    status,
    resumeStream,
  } = useChat<AppUIMessage>({
    id: resolvedChatId,
    messages: initialUiMessages,
    experimental_throttle: 25,
    transport: chatTransport,
    resume: autoResume ?? true,
    onFinish: ({ message }) => {
      const currentChatId = currentChatIdRef.current
      const metadata = (message.metadata || {}) as Record<string, any>

      const metadataChatId = (metadata.chatId as string) || resolvedChatId
      const metadataChatPath =
        typeof metadata.chatPath === 'string' && metadata.chatPath.length > 0
          ? metadata.chatPath
          : metadataChatId
            ? `/chat/${metadataChatId}`
            : undefined

      const shouldNavigate =
        Boolean(metadataChatPath) && metadataChatPath !== pathname && !chatCreatedEventDispatched

      if (metadataChatId && shouldNavigate) {
        setOptimisticChatId(metadataChatId)
        fallbackChatIdRef.current = metadataChatId
        currentChatIdRef.current = metadataChatId
        setChatCreatedEventDispatched(true)
        const targetPath = metadataChatPath!
        router.push(targetPath)
        window.history.replaceState({}, '', targetPath)
        window.dispatchEvent(
          new CustomEvent('newChatCreated', {
            detail: {
              id: metadataChatId,
              title: extractTitleFromContent(messages[0]?.content || 'New Chat'),
              path: targetPath,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          })
        )
      } else if (!shouldNavigate && metadataChatId && !chatCreatedEventDispatched) {
        setOptimisticChatId(metadataChatId)
        fallbackChatIdRef.current = metadataChatId
        currentChatIdRef.current = metadataChatId
        setChatCreatedEventDispatched(true)
      }

      if (message.role === 'assistant') {
        const legacyMessage = uiMessageToLegacyMessage(message)
        if (legacyMessage.content) {
          setLastAssistantMessage(getLegacyMessageText(legacyMessage))
          if (userPreferences.followUpSuggestions !== false) {
            setShowFollowUpSuggestions(true)
          }
        }
      }
      if ((currentChatId || metadata.chatId) && isFirstMessageInNewChat) {
        setIsFirstMessageInNewChat(false)
        const checkTitleUpdate = async (attempt = 1, maxAttempts = 3) => {
          try {
            const targetChatId = currentChatId || metadata.chatId
            if (!targetChatId) return
            const response = await fetch(`/api/chats/${targetChatId}`)
            if (!response.ok) {
              throw new Error('Failed to load chat metadata')
            }
            const chatData = await readJson<ChatSummaryResponse>(response)
            if (chatData.title && chatData.title !== 'New Chat') {
              window.dispatchEvent(
                new CustomEvent('chatTitleUpdated', {
                  detail: { chatId: targetChatId, title: chatData.title },
                })
              )
            } else if (attempt < maxAttempts) {
              setTimeout(() => checkTitleUpdate(attempt + 1, maxAttempts), 2000)
            }
          } catch (error) {
            if (attempt < maxAttempts) {
              setTimeout(() => checkTitleUpdate(attempt + 1, maxAttempts), 2000)
            }
          }
        }
        setTimeout(() => checkTitleUpdate(), 3000)
      }
    },
    onError: err => {
      const errorMessage = err.message || err.toString()
      const hasResponseBody = typeof err === 'object' && err !== null && 'responseBody' in err
      const responseBody = hasResponseBody ? (err as any).responseBody : ''

      const isGeminiStreamingError =
        errorMessage.includes('contents.parts must not be empty') ||
        errorMessage.includes('INVALID_ARGUMENT') ||
        errorMessage.includes('GenerateContentRequest.contents') ||
        errorMessage.includes('streamGenerateContent') ||
        (typeof responseBody === 'string' &&
          responseBody.includes('contents.parts must not be empty'))

      const localRateLimitDetected =
        /rate limit|too many requests|quota exceeded|rate_limited/i.test(
          String(errorMessage || responseBody || '')
        )

      let isRateLimit = false
      try {
        isRateLimit = checkForRateLimitError(err)
      } catch (e) {
      }

      const contextRateLimit = !!rateLimitError?.isRateLimit

      try {
        // eslint-disable-next-line no-console
      } catch {}

      if (!localRateLimitDetected && !isRateLimit && !contextRateLimit && !isGeminiStreamingError) {
        toast.error('Something went wrong. Please try again.')
      }
    },
  })

  const messages = useMemo(() => uiMessagesToLegacyMessages(uiMessages), [uiMessages])

  const setMessages = useCallback(
    (next: Message[] | ((prev: Message[]) => Message[])) => {
      setUiMessages(prevUi => {
        const prevLegacy = uiMessagesToLegacyMessages(prevUi)
        const resolved = typeof next === 'function' ? next(prevLegacy) : next
        return legacyMessagesToUiMessages(resolved)
      })
    },
    [setUiMessages]
  )

  const isLoading = status === 'submitted' || status === 'streaming'

  useAutoResume({
    autoResume: autoResume ?? true,
    initialMessages,
    resumeStream,
  })

  const scrollToBottom = useCallback(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!messagesEndRef.current) return
    const container = contentRef.current?.parentElement
    const scrollBehavior: ScrollBehavior = isLoading || prefersReducedMotion ? 'auto' : 'smooth'
    if (container && isMobile) {
      container.scrollTo({ top: container.scrollHeight, behavior: scrollBehavior })
    } else {
      messagesEndRef.current.scrollIntoView({ behavior: scrollBehavior, block: 'end' })
    }
    setIsAtBottom(true)
  }, [isMobile, isLoading])

  const checkScrollPosition = useCallback(() => {
    const container = contentRef.current?.parentElement
    if (!container) return

    const threshold = 100
    const isAtBottomNow =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    setIsAtBottom(isAtBottomNow)
  }, [])

  useEffect(() => {
    const container = contentRef.current?.parentElement
    if (!container) return

    const handleScroll = () => {
      checkScrollPosition()
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [checkScrollPosition])

  useEffect(() => {
    const container = contentRef.current?.parentElement
    const contentNode = contentRef.current
    if (!container || !contentNode || typeof window === 'undefined') return

    let rafId: number | null = null
    const scheduleCheck = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        checkScrollPosition()
        rafId = null
      })
    }

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => scheduleCheck()) : null
    resizeObserver?.observe(container)
    resizeObserver?.observe(contentNode)

    const mutationObserver =
      typeof MutationObserver !== 'undefined' ? new MutationObserver(() => scheduleCheck()) : null
    mutationObserver?.observe(contentNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'data-state'],
    })
    scheduleCheck()

    return () => {
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [checkScrollPosition])

  useEffect(() => {
    if (isLoading) {
      setAutoScrollEnabled(false)
    } else {
      setAutoScrollEnabled(true)
    }
  }, [isLoading])

  useEffect(() => {
    if (initialMessages.length > 0 && showFullChat) {
      const container = contentRef.current?.parentElement
      if (container) {
        container.scrollTop = container.scrollHeight
      } else if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' })
      }
      setIsAtBottom(true)
    }
  }, [initialMessages.length, showFullChat])

  const throttledScrollToBottom = useThrottle(scrollToBottom, 50)

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTypingField =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!isTypingField) {
          e.preventDefault()
          const textarea = document.querySelector<HTMLTextAreaElement>(
            'textarea[aria-label="Message input"]'
          )
          textarea?.focus()
        }
      }

      if (e.key === 'Escape') {
        const active = document.activeElement as HTMLElement | null
        if (active && active.tagName === 'TEXTAREA') {
          ;(active as HTMLTextAreaElement).blur()
        }
      }
    }

    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  useEffect(() => {
    if (isInitialRender) {
      setIsInitialRender(false)

      if (isMobile) {
        setTimeout(() => {
          window.scrollTo(0, 0)
        }, 100)
      }
    }
  }, [isInitialRender, isMobile])

  useEffect(() => {
    if (!isInitialRender && messages.length > 0 && messages[messages.length - 1].role === 'user') {
      throttledScrollToBottom()
    }
  }, [messages, isLoading, isInitialRender, throttledScrollToBottom])

  useEffect(() => {
    if (!isInitialRender && messages.length > 0 && isLoading && autoScrollEnabled) {
      throttledScrollToBottom()
    }
  }, [messages, isLoading, isInitialRender, throttledScrollToBottom, autoScrollEnabled])

  useEffect(() => {
    if (isLoading && !isInitialRender && autoScrollEnabled) {
      const targetNode = contentRef.current
      if (!targetNode) return

      const observer = new MutationObserver(throttledScrollToBottom)

      observer.observe(targetNode, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: false,
      })

      return () => {
        observer.disconnect()
      }
    }
  }, [isLoading, isInitialRender, throttledScrollToBottom, autoScrollEnabled])

  useEffect(() => {
    if (isMobile && !isInitialRender && messages.length > 0 && autoScrollEnabled) {
      const timeoutId = setTimeout(() => {
        throttledScrollToBottom()
      }, 200)

      return () => clearTimeout(timeoutId)
    }
  }, [messages.length, isMobile, isInitialRender, throttledScrollToBottom, autoScrollEnabled])

  useEffect(() => {
    if (error) {
      const errorMessage = error.message || error.toString()
      const hasResponseBody = typeof error === 'object' && error !== null && 'responseBody' in error
      const responseBody = hasResponseBody ? (error as any).responseBody : ''

      const isGeminiStreamingError =
        errorMessage.includes('contents.parts must not be empty') ||
        errorMessage.includes('INVALID_ARGUMENT') ||
        errorMessage.includes('GenerateContentRequest') ||
        (typeof responseBody === 'string' &&
          responseBody.includes('contents.parts must not be empty'))

      if (isGeminiStreamingError) {
        setErrorMessage('An error occurred. Please start a new chat.')
        setUiMessages(prev =>
          prev.map((msg, idx) =>
            idx === prev.length - 1 && msg.role === 'assistant'
              ? { ...msg, content: '', error: 'streaming_error' }
              : msg
          )
        )
        return
      }

      const isRateLimit = checkForRateLimitError(error)
      try {
        // eslint-disable-next-line no-console
        console.debug('[Chat] error effect - isRateLimit:', isRateLimit, 'error:', error)
      } catch {}
      if (isRateLimit) return
    }
  }, [error, checkForRateLimitError])

  const handleFormSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const trimmed = input.trim()
      if (!trimmed) return

      setShowFollowUpSuggestions(false)
      setLastUserMessage(trimmed)

      if (!showFullChat) {
        setShowFullChat(true)
        setIsFirstMessageInNewChat(true)
      }
      setErrorMessage(null)
      clearRateLimitError()
      setHasUserInitiatedConversation(true)

      try {
        await sendMessage({ text: trimmed })
        setInput('')
      } catch (err) {
        console.error('Error submitting message:', err)
        setErrorMessage('Failed to send message. Please try again.')
      }
    },
    [
      input,
      showFullChat,
      clearRateLimitError,
      setShowFollowUpSuggestions,
      setLastUserMessage,
      setErrorMessage,
      setHasUserInitiatedConversation,
      sendMessage,
    ]
  )

  const handleSuggestedQuestion = useCallback(
    async (question: string) => {
      setInput('')
      setShowFollowUpSuggestions(false)
      setLastUserMessage(question)

      if (!showFullChat) {
        setShowFullChat(true)
        setIsFirstMessageInNewChat(true)
      }
      setErrorMessage(null)
      clearRateLimitError()
      setHasUserInitiatedConversation(true)

      try {
        await sendMessage({ text: question })
      } catch (err) {
        console.error('Error sending suggested question:', err)
        setErrorMessage('Failed to send message. Please try again.')
      }
    },
    [
      showFullChat,
      clearRateLimitError,
      setInput,
      setShowFollowUpSuggestions,
      setLastUserMessage,
      setErrorMessage,
      setHasUserInitiatedConversation,
      sendMessage,
    ]
  )

  const handleToolSelection = (toolId: string) => {
    setSelectedTool(toolId)
  }

  const resetToHome = () => {
    if (window.location.pathname !== '/') {
      try {
        window.history.replaceState({}, '', '/')
      } catch {}
      router.push('/')
      setUiMessages([])
      resetChatStore()
      setInput('')
      setHasUserInitiatedConversation(false)
      setIsFirstMessageInNewChat(false)
      setShowFollowUpSuggestions(false)
      setLastAssistantMessage('')
      setOptimisticChatId(undefined)
      setChatCreatedEventDispatched(false)
      setErrorMessage(null)
      clearRateLimitError()
      clearToolResult('')
    } else {
      router.push('/')
    }
  }

  const createCanvasFromMessage = (content: string) => {
    setHubOpen(true)
  }

  const handleLoginClick = () => {
    const command = 'attendance'
    window.dispatchEvent(
      new CustomEvent('vtopLoginTrigger', {
        detail: { command, linkOnly: true },
      })
    )
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('vtopOpenCredentials', {
          detail: { command },
        })
      )
    }, 30)
  }

  const handlePlacementSearch = (company: string) => {
    sendMessage({ text: `Get placement information for ${company}` }).catch(error => {
      console.error('Error sending placement search request:', error)
      setErrorMessage('Failed to send message. Please try again.')
    })
  }

  const handleVTOPCredentials = async (
    credentials: { username: string; encryptedPassword: string },
    originalToolCall: any
  ) => {
    try {
      setVtopLoading(true)
      const command = originalToolCall?.args?.command || originalToolCall?.result?.command
      if (!command) {
        console.error('No command found in original tool call')
        setVtopLoading(false)
        return
      }
      const toolCallId = originalToolCall.toolCallId || Date.now().toString()
      clearToolResult(toolCallId)

      const updatedMessagesForLoading = messages.map((message: any) => {
        if (message.toolInvocations) {
          const updatedToolInvocations = message.toolInvocations.map((toolInvocation: any) => {
            if (toolInvocation.toolCallId && toolCallId) {
              return {
                ...toolInvocation,
                toolCallId: toolCallId,
                state: 'call',
                result: undefined,
              }
            }
            return toolInvocation
          })
          return {
            ...message,
            toolInvocations: updatedToolInvocations,
          }
        }
        return message
      })

      setUiMessages(prev => {
        const base = [...updatedMessagesForLoading]
        if (base.length === 0) return base
        const last = base[base.length - 1]
        const toolInvocationPayload = {
          toolCallId: toolCallId,
          toolName: 'queryVTOP',
          args: { command, username: credentials.username },
          state: 'call',
          result: undefined,
        }
        if (last.role === 'assistant') {
          const exists = last.toolInvocations?.some((t: any) => t.toolCallId === toolCallId)
          if (!exists) {
            base[base.length - 1] = {
              ...last,
              toolInvocations: [...(last.toolInvocations || []), toolInvocationPayload],
            }
          } else {
            base[base.length - 1] = {
              ...last,
              toolInvocations: last.toolInvocations.map((t: any) =>
                t.toolCallId === toolCallId ? { ...t, state: 'call', result: undefined } : t
              ),
            }
          }
        } else {
          base.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            role: 'assistant',
            content: '',
            toolInvocations: [toolInvocationPayload],
          })
        }
        return base
      })

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: legacyMessagesToUiMessages(messages),
          directToolCall: {
            toolName: 'queryVTOP',
            args: {
              command,
              username: credentials.username,
              password: credentials.encryptedPassword,
              ...originalToolCall.args,
            },
            toolCallId: toolCallId,
          },
          id: resolvedChatId,
        }),
      })

      if (response.ok) {
        const responseText = await response.text()

        function parseVTOPResponse(raw: string) {
          if (!raw || typeof raw !== 'string') {
            throw new Error('Empty response')
          }

          const trimmed = raw.trim()

          if (/^[\[{]/.test(trimmed)) {
            try {
              return JSON.parse(trimmed)
            } catch (e: any) {
            }
          }

          const lines = raw.replace(/\r/g, '').split('\n')
          const frameHeader = /^([a-z0-9]):(.*)$/i

          type Frame = { prefix: string; payload: string }
          const frames: Frame[] = []

          let current: Frame | null = null

          const flush = () => {
            if (current) {
              current.payload = current.payload.replace(/\n$/, '')
              frames.push(current)
              current = null
            }
          }

          for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i]
            const line = rawLine // keep exact spacing; payload might be HTML
            const m = line.match(frameHeader)

            if (m) {
              flush()
              current = { prefix: m[1], payload: m[2] ?? '' }
              if (i < lines.length - 1) current.payload += '\n' // preserve newline after first line
            } else {
              if (current) {
                current.payload += line + (i < lines.length - 1 ? '\n' : '')
              } else {
              }
            }
          }
          flush()

          const safeParseJSON = (s: string) => {
            const t = s.trim()
            if (!/^[\[{]/.test(t)) throw new Error('Not JSON')
            try {
              return JSON.parse(t)
            } catch (_) {
              const firstBrace = t.indexOf('{')
              const lastBrace = t.lastIndexOf('}')
              const firstBracket = t.indexOf('[')
              const lastBracket = t.lastIndexOf(']')
              const sliceObject =
                firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
                  ? t.slice(firstBrace, lastBrace + 1)
                  : null
              const sliceArray =
                firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket
                  ? t.slice(firstBracket, lastBracket + 1)
                  : null
              const candidate = sliceObject ?? sliceArray
              if (!candidate) throw new Error('JSON extract failed')
              return JSON.parse(candidate)
            }
          }

          const decodePossibleJSONString = (s: string) => {
            const t = s.trim()
            if (t.startsWith('"') && t.endsWith('"') && !t.includes('\n')) {
              try {
                return JSON.parse(t) // unescapes \n, \", etc.
              } catch {
              }
            }
            if (t.startsWith('"') && t.endsWith('"')) {
              return t.slice(1, -1)
            }
            return s
          }

          const toolFrames: any[] = []
          const textChunks: string[] = []

          for (const f of frames) {
            const payload = f.payload ?? ''

            if (f.prefix === 'a' || f.prefix === '9' || f.prefix === 'e') {
              const trimmedPayload = payload.trim()
              try {
                const parsed = safeParseJSON(trimmedPayload)
                if (f.prefix === 'a') toolFrames.push(parsed)
              } catch {
              }
            } else if (f.prefix === '0') {
              textChunks.push(decodePossibleJSONString(payload))
            } else {
            }
          }

          const chosen =
            [...toolFrames].reverse().find(x => x && typeof x === 'object' && 'result' in x) ??
            [...toolFrames].reverse().find(x => x) // fallback to any 'a' frame

          if (chosen && chosen.result !== undefined) {
            return { result: chosen.result }
          }
          if (chosen) {
            return { result: chosen } // sometimes the object itself is the result
          }
          if (textChunks.length) {
            return { result: { success: true, output: textChunks.join('\n') } }
          }

          throw new Error('No parsable tool frames found in streaming response')
        }

        let result: any
        try {
          result = parseVTOPResponse(responseText)
        } catch (err) {
          console.error('VTOP parse error. Raw response begins with:', responseText.slice(0, 180))
          console.error(err)
          toast.error('Error processing VTOP response. Please try again.')
          setVtopLoading(false)
          return
        }

        if (toolCallId) {
          updateToolResult(toolCallId, command, result.result)
        }
        const updatedMessages = (uiMessages as MutableAppMessage[]).map(message => {
          if (message.toolInvocations) {
            const updatedToolInvocations = message.toolInvocations.map((toolInvocation: any) => {
              if (toolInvocation.toolCallId && toolInvocation.toolCallId === toolCallId) {
                return {
                  ...toolInvocation,
                  result: result.result,
                  state: 'result',
                }
              }
              return toolInvocation
            })

            const updatedParts = message.parts
              ? message.parts.map((part: any) => {
                  if (
                    part.type === 'tool-invocation' &&
                    part.toolInvocation?.toolCallId === toolCallId
                  ) {
                    return {
                      ...part,
                      toolInvocation: {
                        ...part.toolInvocation,
                        result: result.result,
                        state: 'result',
                      },
                    }
                  }
                  return part
                })
              : message.parts

            return {
              ...message,
              toolInvocations: updatedToolInvocations,
              parts: updatedParts,
            }
          }
          return message
        })
        setUiMessages([...updatedMessages] as AppUIMessage[])

        try {
          const formattedContent =
            (result.result && (result.result.formatted_content || result.result.summary)) || ''
          if (formattedContent) {
            setUiMessages(prev => {
              const mutablePrev = prev as MutableAppMessage[]
              const idx = mutablePrev.findIndex(
                m =>
                  m.role === 'assistant' &&
                  m.toolInvocations?.some((t: any) => t.toolCallId === toolCallId)
              )
              if (idx !== -1) {
                const clone = mutablePrev.map(message => ({ ...message })) as MutableAppMessage[]
                const target = clone[idx]
                const existingContent = target.content || ''
                if (existingContent.trim() === '') {
                  clone[idx] = { ...target, content: formattedContent }
                } else if (!existingContent.includes(formattedContent.slice(0, 30))) {
                  clone[idx] = {
                    ...target,
                    content: `${existingContent}\n\n${formattedContent}`.trim(),
                  }
                }
                return clone as AppUIMessage[]
              }
              const newAssistantMsg = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                role: 'assistant',
                content: formattedContent,
                toolInvocations: [
                  {
                    toolCallId: toolCallId,
                    toolName: 'queryVTOP',
                    args: { command },
                    result: result.result,
                    state: 'result',
                  },
                ],
              } as MutableAppMessage
              return [...mutablePrev, newAssistantMsg] as AppUIMessage[]
            })
            try {
              setLastAssistantMessage(
                formattedContent.length > 400 ? formattedContent.slice(0, 400) : formattedContent
              )
            } catch {}
          }
          if (!showFullChat) setShowFullChat(true)
          setTimeout(() => {
            try {
              const container = contentRef.current?.parentElement
              if (container) container.scrollTop = container.scrollHeight
            } catch {}
          }, 50)
        } catch (uiUpdateErr) {
          console.warn('Non-fatal UI update issue after VTOP parse:', uiUpdateErr)
        }

        if (
          result.result &&
          result.result.success !== false &&
          (result.result.data || result.result.output)
        ) {
          if (chatId) {
            setTimeout(async () => {
              try {
                const refreshResponse = await fetch(`/api/chats/${chatId}`)
                if (!refreshResponse.ok) {
                  throw new Error('Failed to refresh conversation after VTOP data retrieval')
                }
                const chatData = await readJson<ChatSummaryResponse>(refreshResponse)
                if (chatData.messages) {
                  setUiMessages(legacyMessagesToUiMessages(chatData.messages))
                }
              } catch (error) {
                console.warn('Failed to refresh conversation after VTOP data retrieval:', error)
              }
            }, 500)
          }
        } else if (result.result && result.result.success === false) {
          const errorMessage =
            result.result.error || result.result.message || 'Unknown error occurred'
          if (
            errorMessage.includes('Invalid LoginId/Password') ||
            errorMessage.includes('Login failed')
          ) {
            toast.error('Invalid VTOP credentials. Please check your username and password.')
          }
        }
        setVtopLoading(false)
      } else {
        const errorText = await response.text()
        console.error('VTOP API Error:', response.status, errorText)
        toast.error('Failed to retrieve VTOP data. Please try again.')
        setVtopLoading(false)
      }
    } catch (error) {
      console.error('Error executing VTOP tool:', error)
      toast.error('An error occurred while retrieving VTOP data. Please try again.')
      setVtopLoading(false)
    }
  }

  useEffect(() => {
    if (persistedChatId) {
      window.scrollTo(0, 0)

      setTimeout(() => {
        window.scrollTo(0, 0)
      }, 100)
    }
  }, [persistedChatId])

  useEffect(() => {
    if (persistedChatId) {
      const forceScrollToTop = () => {
        window.scrollTo(0, 0)
      }

      forceScrollToTop()

      const timeoutId = setTimeout(forceScrollToTop, 50)

      return () => {
        clearTimeout(timeoutId)
      }
    }
  }, [persistedChatId])

  useEffect(() => {
    if (showFullChat && isMobile && isFirstMessageInNewChat) {
      setTimeout(() => {
        window.scrollTo(0, 0)
      }, 50)
    }
  }, [showFullChat, isMobile, isFirstMessageInNewChat])

  useEffect(() => {
    if (!persistedChatId) {
      setChatCreatedEventDispatched(false)
    }
  }, [persistedChatId])

  useEffect(() => {
    if (messages && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage && lastMessage.toolInvocations) {
        for (const tool of lastMessage.toolInvocations) {
          if (tool.toolName === 'queryVTOP' && tool.state === 'result' && tool.toolCallId) {
            const toolResult = (tool as any).result
            if (toolResult) {
              const command = toolResult.command || tool.args?.command || 'unknown'
              updateToolResult(tool.toolCallId, command, toolResult)
            }
          }
        }
      }
    }
  }, [messages, updateToolResult])

  let hubLayout: ReactNode

  if (!showFullChat) {
    hubLayout = (
      <VTOPToolHandler
        toolInvocations={messages[messages.length - 1]?.toolInvocations}
        onCredentialsSubmit={handleVTOPCredentials}
      >
        <UpsellBanner />
        <OnboardingDialog isOpen={showOnboarding} onClose={closeOnboarding} />
        <Hub
          isOpen={hubOpen}
          actions={hubActionHandlers}
          onLink={handleLoginClick}
          onClose={() => {
            setHubOpen(false)
          }}
        />
        <div
          className={cn(
            'flex flex-col h-[100dvh] bg-transparent text-foreground relative overflow-hidden mobile-viewport-fix transition-[padding] duration-200 ease-in-out',
            sidebarOpen && 'md:pl-[280px] md:pr-10'
          )}
          style={{ overflowX: 'hidden' }}
        >
          <div className="relative z-10 flex flex-col h-full">
            <header className="flex-shrink-0 sticky top-0 z-40">
              <div className="flex h-14 items-center px-4 gap-2">
                {!sidebarOpen && <HamburgerButton onClick={toggleSidebar} className="md:hidden" />}
              </div>
            </header>
            <div className="flex-1 flex flex-col items-center justify-center px-4 space-y-8 overflow-y-auto overflow-fix pt-6 md:pt-0">
              <ChatHeader />
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
                className="w-full max-w-3xl"
              >
                <MultimodalInput
                  input={input}
                  setInput={setInput}
                  handleSubmit={handleFormSubmit}
                  isLoading={isLoading}
                  onToolSelect={handleToolSelection}
                  selectedTool={selectedTool || 'general'}
                  placeholder="ask anything..."
                />{' '}
              </motion.div>

              <div className="w-full max-w-5xl flex justify-center -mt-3">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
                >
                  <button
                    onClick={() => {
                      setHubOpen(true)
                      if (showDailyBriefingLabel && typeof window !== 'undefined') {
                        window.setTimeout(() => {
                          try {
                            window.localStorage.removeItem(DAILY_BRIEFING_STORAGE_KEY)
                            window.dispatchEvent(new CustomEvent('ea.dailyBriefingReset'))
                          } catch (error) {
                            console.warn('failed to reset daily briefing flag', error)
                          }
                        }, 50)
                      }
                      setShowDailyBriefingLabel(false)
                    }}
                    aria-label="Open hub"
                    className="hub-gradient-btn"
                    style={{ minWidth: '320px', paddingLeft: '32px', paddingRight: '32px' }}
                  >
                    <span className="hub-gradient-inner">
                      <GraduationCap className="h-4 w-4 mr-2" />
                      <span>{showDailyBriefingLabel ? 'daily briefing' : 'hub'}</span>
                    </span>
                  </button>
                </motion.div>

                <style jsx>{`
                  .hub-gradient-btn {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    height: 40px;
                    padding: 0 14px;
                    border-radius: 9999px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    cursor: pointer;
                    color: var(--card-foreground);
                    background: linear-gradient(
                      90deg,
                      rgba(110, 231, 249, 0.25) 0%,
                      rgba(167, 139, 250, 0.25) 25%,
                      rgba(244, 114, 182, 0.25) 50%,
                      rgba(245, 158, 11, 0.25) 75%,
                      rgba(110, 231, 249, 0.25) 100%
                    );
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
                    transition:
                      transform 160ms ease,
                      box-shadow 200ms ease,
                      border-color 200ms ease;
                    overflow: hidden;
                  }
                  .hub-gradient-btn::before {
                    content: '';
                    position: absolute;
                    inset: -2px;
                    border-radius: inherit;
                    background: linear-gradient(90deg, #6ee7f9, #a78bfa, #f472b6, #f59e0b, #6ee7f9);
                    background-size: 200% 200%;
                    filter: blur(10px);
                    opacity: 0.45;
                    z-index: 0;
                    animation: hub-shine 5s linear infinite;
                  }
                  .hub-gradient-btn:hover {
                    transform: translateY(-1px) scale(1.02);
                    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
                    border-color: rgba(255, 255, 255, 0.12);
                  }
                  .hub-gradient-inner {
                    position: relative;
                    z-index: 1;
                    display: inline-flex;
                    align-items: center;
                    font-size: 0.9rem;
                    line-height: 1;
                    font-weight: 500;
                    color: hsl(var(--foreground));
                  }
                  .hub-gradient-inner :global(svg) {
                    color: hsl(var(--foreground));
                  }
                  .hub-gradient-btn::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    background: radial-gradient(
                      120% 120% at 50% 100%,
                      rgba(255, 255, 255, 0.06) 0%,
                      transparent 55%
                    );
                    z-index: 1;
                    pointer-events: none;
                  }
                  @keyframes hub-shine {
                    0% {
                      background-position: 0% 50%;
                    }
                    50% {
                      background-position: 100% 50%;
                    }
                    100% {
                      background-position: 0% 50%;
                    }
                  }
                `}</style>
              </div>

              {errorMessage && <StreamingErrorDisplay message={errorMessage} />}

              <RateLimitErrorDisplay />

              <DynamicLoadingIndicator
                messages={messages}
                isLoading={isLoading || vtopLoading}
                showForFirstMessage={true}
              />

              <SuggestedQuestions
                isFirstMessage={true}
                onQuestionClick={handleSuggestedQuestion}
                sidebarOpen={sidebarOpen}
              />
            </div>
          </div>
        </div>
      </VTOPToolHandler>
    )
  } else {
    hubLayout = (
      <VTOPToolHandler
        toolInvocations={messages[messages.length - 1]?.toolInvocations}
        onCredentialsSubmit={handleVTOPCredentials}
      >
        <UpsellBanner />
        <OnboardingDialog isOpen={showOnboarding} onClose={closeOnboarding} />
        <Hub
          isOpen={hubOpen}
          actions={hubActionHandlers}
          onLink={handleLoginClick}
          onClose={() => {
            setHubOpen(false)
          }}
        />
        <div
          ref={mainRef}
          className={cn(
            'flex flex-col h-[calc(var(--vh,1vh)*100)] bg-transparent text-foreground overflow-hidden mobile-viewport-fix transition-[padding] duration-200 ease-in-out',
            sidebarOpen && 'md:pl-[280px] md:pr-10'
          )}
          style={{
            height: 'var(--app-height, 100vh)',
            position: 'relative',
            width: '100%',
            overflowX: 'hidden',
          }}
        >
          <header
            className={cn(
              'flex-shrink-0 sticky top-0 z-40 bg-black/20 backdrop-blur-sm border-b border-border/50 chat-page-header',
              isMobile && 'mobile-header-sticky'
            )}
          >
            <div className="flex h-14 items-center px-4 gap-2">
              {!sidebarOpen && (
                <>
                  <HamburgerButton onClick={toggleSidebar} className="md:block" />
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (window.location.pathname !== '/') {
                        try {
                          window.history.replaceState({}, '', '/')
                        } catch {}
                        router.replace('/')
                        setUiMessages([])
                        setInput('')
                        setShowFullChat(false)
                        setHasUserInitiatedConversation(false)
                        setIsFirstMessageInNewChat(false)
                        setShowFollowUpSuggestions(false)
                        setLastAssistantMessage('')
                        setLastUserMessage('')
                        setOptimisticChatId(undefined)
                        setChatCreatedEventDispatched(false)
                        setErrorMessage(null)
                        clearRateLimitError()
                        clearToolResult('')
                      } else {
                        router.push('/')
                      }
                    }}
                    className="h-9 ml-auto"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    new chat
                  </Button>
                </>
              )}
              {canInstall && !isInstalled && (
                <Button
                  variant="ghost"
                  onClick={handleInstallClick}
                  className="h-9 ml-2 hidden md:inline-flex"
                >
                  <Download className="h-4 w-4 mr-2" />
                  install app
                </Button>
              )}
              {canInstall && !isInstalled && (
                <Button variant="ghost" onClick={handleInstallClick} className="h-9 ml-2 md:hidden">
                  <Download className="h-4 w-4 mr-2" />
                  install
                </Button>
              )}
              <div className="hidden md:block ml-2">
                <DesktopPdfDockButton />
              </div>
              <div className="ml-2 md:hidden">
                <MobilePdfDockButton />
              </div>
            </div>
          </header>{' '}
          <div className="flex-1 relative overflow-hidden">
            <div
              className={cn(
                'absolute inset-0 overflow-y-auto chat-content',
                isMobile && 'mobile-chat-container',
                isMobile && isFirstMessageInNewChat && 'mobile-prevent-auto-scroll'
              )}
            >
              {' '}
              <div
                ref={contentRef}
                className={cn('max-w-3xl mx-auto px-4 space-y-6', isMobile ? 'pt-2 pb-6' : 'pt-5')}
              >
                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 text-center"
                  >
                    {errorMessage}
                  </motion.div>
                )}
                <RateLimitErrorDisplay />{' '}

                <VirtualizedMessages
                  messages={messages.filter((msg: any) => {
                    if (msg.role === 'assistant') {
                      if (
                        (!msg.content || (msg.content as string).trim() === '') &&
                        msg.toolInvocations?.some((t: any) => t.toolName === 'knowledgeBase')
                      ) {
                        return msg.toolInvocations.some(
                          (t: any) =>
                            t.toolName === 'knowledgeBase' &&
                            t.state === 'result' &&
                            t.result?.chunks
                        )
                      }

                      if (
                        (!msg.content || (msg.content as string).trim() === '') &&
                        msg.toolInvocations?.length > 0
                      ) {
                        const hasVisibleToolCalls = msg.toolInvocations.some(
                          (t: any) => t.toolName !== 'knowledgeBase' && t.toolName !== 'saveMemory'
                        )
                        return hasVisibleToolCalls
                      }
                    }
                    return true
                  })}
                  chatId={persistedChatId ?? resolvedChatId}
                  isLoading={isLoading}
                  onCreateCanvas={createCanvasFromMessage}
                  onLoginClick={handleLoginClick}
                  onPlacementSearch={handlePlacementSearch}
                  maximizedItem={maximizedArtifact}
                  setMaximizedItem={setMaximizedArtifact}
                />
                <DynamicLoadingIndicator
                  messages={messages}
                  isLoading={isLoading || vtopLoading}
                  isAssistantStreaming={status === 'streaming'}
                />
                <div
                  ref={messagesEndRef}
                  className={isLoading ? 'h-20' : 'h-0'}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
          <ScrollToTopButton />
          <div
            className={cn(
              'flex-shrink-0 sticky bottom-0 z-30',
              isMobile ? 'input-area mobile-input-area' : 'input-area'
            )}
            style={isMobile ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
          >
            {!isMobile && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.1) 70%, rgba(0, 0, 0, 0.2) 100%)',
                  borderTop: 'none',
                }}
              ></div>
            )}
            {!maximizedArtifact && (
              <div className="relative z-10">
                <FollowUpSuggestions
                  lastAssistantMessage={lastAssistantMessage}
                  lastUserMessage={lastUserMessage}
                  isVisible={showFollowUpSuggestions && !isLoading}
                  onSuggestionClick={handleSuggestedQuestion}
                  onDismiss={() => setShowFollowUpSuggestions(false)}
                  isMobile={isMobile}
                />
                <MultimodalInput
                  input={input}
                  setInput={setInput}
                  handleSubmit={handleFormSubmit}
                  isLoading={isLoading}
                  placeholder="ask anything..."
                  stop={stop}
                  onToolSelect={handleToolSelection}
                  selectedTool={selectedTool || 'general'}
                />
                <div className="px-2 sm:px-4 pb-0.5">
                  <p className="text-[10px] sm:text-xs text-muted-foreground text-center leading-tight">
                    the assistant can make mistakes. please verify information.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        {!isAtBottom &&
          !showFollowUpSuggestions &&
          typeof window !== 'undefined' &&
          createPortal(
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-40"
              style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={scrollToBottom}
                className="h-10 w-10 rounded-full bg-background/80 hover:bg-background/90 border-0 shadow-sm backdrop-blur-sm"
                aria-label="Scroll to latest message"
              >
                <ChevronDown className="h-5 w-5 text-foreground/70" />
              </Button>
            </motion.div>,
            document.body
          )}
      </VTOPToolHandler>
    )
  }

  return <HubStoreProvider initialState={hubSeed}>{hubLayout}</HubStoreProvider>
}

const PureChatInterface = memo(PureChatInterfaceComponent, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.autoResume === nextProps.autoResume &&
    prevProps.initialHubState === nextProps.initialHubState &&
    areHubActionsEqual(prevProps.hubActions, nextProps.hubActions) &&
    prevProps.initialMessages?.length === nextProps.initialMessages?.length &&
    (prevProps.initialMessages?.every(
      (msg, index) => msg.id === nextProps.initialMessages?.[index]?.id
    ) ??
      true)
  )
})

export const ChatInterface = memo(
  ({
    initialMessages = [],
    chatId,
    autoResume = true,
    initialHubState,
    hubActions,
  }: ChatInterfaceProps) => {
    return (
      <RateLimitProvider>
        <VTOPProvider>
          <PureChatInterface
            initialMessages={initialMessages}
            chatId={chatId}
            autoResume={autoResume}
            initialHubState={initialHubState}
            hubActions={hubActions}
          />
        </VTOPProvider>
      </RateLimitProvider>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.chatId === nextProps.chatId &&
      prevProps.autoResume === nextProps.autoResume &&
      prevProps.initialHubState === nextProps.initialHubState &&
      areHubActionsEqual(prevProps.hubActions, nextProps.hubActions) &&
      prevProps.initialMessages?.length === nextProps.initialMessages?.length &&
      (prevProps.initialMessages?.every(
        (msg, index) => msg.id === nextProps.initialMessages?.[index]?.id
      ) ??
        true)
    )
  }
)
