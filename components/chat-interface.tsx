'use client'

import { useState, useRef, useEffect, memo, useCallback, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { useStore } from 'zustand'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { VirtualizedMessages } from '@/components/virtualized-messages'
import type { MaximizedItem } from '@/components/message-bubble'
import { motion } from 'framer-motion'
import { Download, Plus, ChevronDown, GraduationCap, Share, LogIn } from 'lucide-react'
import { HamburgerButton } from '@/components/hamburger-button'
import { Button } from '@/components/ui/button'
import { SuggestedQuestions } from '@/components/suggested-questions'
import { FollowUpSuggestions } from '@/components/follow-up-suggestions'
import { ChatHeader } from '@/components/chat-header'
import { MobilePdfDockButton, DesktopPdfDockButton } from '@/components/pdf-dock'
import { MultimodalInput } from '@/components/multimodal-input'
import type { HubActionHandlers } from '@/components/hub/hub'
import { HubStoreProvider } from '@/components/hub/hub-store'
import { ShareModal } from '@/components/share-modal'
import { HUB_COMMANDS } from '@/types/hub'
import type { PersonalHubState, HubVTOPCommand } from '@/types/hub'
import { extractTitleFromContent, generateUUID } from '@/lib/utils'
import UpsellBanner from '@/components/upsell-banner'
import { VTOPToolHandler } from '@/components/vtop-tool-handler'
import { VTOPProvider, useVTOP } from '@/contexts/vtop-context'
import { RateLimitProvider, useRateLimit } from '@/contexts/rate-limit-context'
import { RateLimitErrorDisplay } from '@/components/rate-limit-error-display'
import { useOnboarding } from '@/hooks/use-onboarding'
import { toast } from 'sonner'
import { readJson } from '@/lib/http'
import { userPreferencesResponseSchema, type UserPreferences } from '@/types/preferences'
import { chatDetailResponseSchema, chatTitleResponseSchema } from '@/types/api/chats'
import ScrollToTopButton from '@/components/scroll-to-top-button'
import { cn } from '@/lib/utils'
import { useThrottle } from '@/hooks/use-debounce'
import { useAutoResume } from '@/hooks/use-auto-resume'
import { useOptimizedScroll } from '@/hooks/use-optimized-scroll'
import { useSidebar } from '@/contexts/sidebar-context'
import { StreamingErrorDisplay } from '@/components/streaming-error-display'
import { DynamicLoadingIndicator } from '@/components/dynamic-loading-indicator'
import { GuestLimitDialog } from '@/components/guest-limit-dialog'
import { CHATGPT_CONNECT_ANNOUNCEMENT_SEEN_KEY } from '@/components/chatgpt-connect-announcement-storage'
import {
  HUB_BRIEFING_ACTION_EVENT,
  HUB_BRIEFING_ACTION_PARAM,
  HUB_BRIEFING_TRIGGER_PARAM,
  HUB_BRIEFING_TRIGGER_VALUE,
} from '@/lib/hub/constants'
import { useChatStore } from '@/hooks/use-chat-store'
import { useMiniPlayerStore, formatTime } from '@/lib/stores/useMiniPlayerStore'
import type { Attachment } from '@/types/attachment'
import { getEnabledMCPConfigs } from '@/lib/mcp-config'
import { CHAT_COMPOSER_INPUT_ID, createChatInputStore } from '@/lib/stores/chat-input-store'
import { readPreHydrationValue } from '@/lib/hydration-safe'

// Rarely-opened, client-only overlays: loaded on first open instead of with the chat route.
const loadHub = () => import('@/components/hub/hub')
const Hub = dynamic(loadHub, { ssr: false })
const OnboardingDialog = dynamic(
  () => import('@/components/onboarding-dialog').then(mod => mod.OnboardingDialog),
  { ssr: false }
)
const ChatgptConnectAnnouncementModal = dynamic(
  () =>
    import('@/components/chatgpt-connect-announcement-modal').then(
      mod => mod.ChatgptConnectAnnouncementModal
    ),
  { ssr: false }
)

type Message = LegacyMessage

/**
 * Message shape held in `useChat` state. Some flows (VTOP credential retry) inject legacy
 * `content` / `toolInvocations` fields alongside the AI SDK `parts`.
 */
type MutableAppMessage = AppUIMessage & {
  content?: string
  toolInvocations?: LegacyToolInvocation[]
}

/** `beforeinstallprompt` event (not in lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

/** The tool call that triggered a VTOP credentials prompt. */
interface VtopOriginalToolCall {
  toolCallId?: string
  args?: Record<string, unknown>
  result?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const isBeforeInstallPromptEvent = (event: Event): event is BeforeInstallPromptEvent =>
  'prompt' in event && typeof event.prompt === 'function'

/** `detail` of a CustomEvent as an untyped record, or null for other events. */
const customEventDetail = (event: Event): Record<string, unknown> | null => {
  const detail: unknown = event instanceof CustomEvent ? event.detail : undefined
  return isRecord(detail) ? detail : null
}

const MESSAGE_ROLES: ReadonlySet<string> = new Set(['system', 'user', 'assistant'])

/** Shallow check for a UI message persisted to localStorage by this component. */
const isStoredUiMessage = (value: unknown): value is MutableAppMessage =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.role === 'string' &&
  MESSAGE_ROLES.has(value.role) &&
  Array.isArray(value.parts)

/** Legacy (AI SDK v4) `tool-invocation` part, which may still exist on stored messages. */
interface LegacyToolInvocationPart {
  type: 'tool-invocation'
  toolInvocation: { toolCallId?: string; [key: string]: unknown }
}

const isLegacyToolInvocationPart = (part: unknown): part is LegacyToolInvocationPart =>
  isRecord(part) && part.type === 'tool-invocation' && isRecord(part.toolInvocation)

/** Converts a legacy message to the mutable UI shape kept in `useChat` state (legacy fields included). */
const legacyToMutableMessage = (message: LegacyMessage): MutableAppMessage => ({
  ...message,
  parts: message.parts ?? [],
})

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
    let orientationTimeoutId: ReturnType<typeof setTimeout> | undefined
    const handleOrientationChange = () => {
      clearTimeout(orientationTimeoutId)
      orientationTimeoutId = setTimeout(setVh, 50)
    }

    setVh()
    window.addEventListener('resize', setVh, { passive: true })
    window.addEventListener('orientationchange', handleOrientationChange, { passive: true })
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange)
    }

    return () => {
      clearTimeout(timeoutId)
      clearTimeout(orientationTimeoutId)
      window.removeEventListener('resize', setVh)
      window.removeEventListener('orientationchange', handleOrientationChange)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange)
      }
    }
  }, [])

  return mainRef
}

import {
  cachedUiMessagesToLegacyMessages,
  legacyMessagesToUiMessages,
  uiMessageToLegacyMessage,
  type LegacyMessage,
  type LegacyToolInvocation,
  type AppUIMessage,
} from '@/lib/ai-message-conversion'

const getLegacyMessageText = (message: LegacyMessage | null | undefined): string =>
  message?.content ?? ''

type ConversationTurn = { role: 'user' | 'assistant'; content: string }

const toConversationHistory = (messages: LegacyMessage[]): ConversationTurn[] =>
  messages.flatMap(m =>
    m.role === 'user' || m.role === 'assistant'
      ? [{ role: m.role, content: typeof m.content === 'string' ? m.content : '' }]
      : []
  )

/** Whether a message is shown in the transcript (assistant messages with only hidden tools are not). */
const isTranscriptMessage = (msg: LegacyMessage): boolean => {
  if (msg.role === 'assistant') {
    const toolInvocations = msg.toolInvocations ?? []
    if (
      (!msg.content || msg.content.trim() === '') &&
      toolInvocations.some(t => t.toolName === 'knowledgeBase')
    ) {
      return toolInvocations.some(
        t =>
          t.toolName === 'knowledgeBase' &&
          t.state === 'result' &&
          isRecord(t.result) &&
          Boolean(t.result.chunks)
      )
    }

    if ((!msg.content || msg.content.trim() === '') && toolInvocations.length > 0) {
      const hasVisibleToolCalls = toolInvocations.some(
        t => t.toolName !== 'knowledgeBase' && t.toolName !== 'saveMemory'
      )
      return hasVisibleToolCalls
    }
  }
  return true
}

const EMPTY_HUB_STATE: PersonalHubState = {
  isLinked: false,
  snapshots: [],
  lastSyncedAt: null,
}

const HUB_COMMAND_LOOKUP: ReadonlySet<string> = new Set<HubVTOPCommand>(HUB_COMMANDS)
const isHubCommand = (value: string): value is HubVTOPCommand => HUB_COMMAND_LOOKUP.has(value)

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
  chatTitle?: string
}

const DAILY_BRIEFING_STORAGE_KEY = 'ea.hub.daily-briefing-date'
const GUEST_STORAGE_KEY = 'ea.guest-session'
const GUEST_MESSAGE_LIMIT = 2

function PureChatInterfaceComponent({
  initialMessages = [],
  chatId,
  autoResume = false,
  initialHubState,
  hubActions,
  chatTitle,
}: ChatInterfaceProps) {
  // Composer text lives in a per-instance store (subscribed by MultimodalInput) so typing doesn't
  // re-render this whole tree; read it imperatively via `inputStore.getState().input`.
  // Seed from the server-rendered composer so text typed before hydration survives.
  const [inputStore] = useState(() =>
    createChatInputStore(readPreHydrationValue(CHAT_COMPOSER_INPUT_ID))
  )
  const setInput = useStore(inputStore, state => state.setInput)
  const showFullChat = useChatStore(state => state.showFullChat)
  const setShowFullChat = useChatStore(state => state.setShowFullChat)
  const selectedTool = useChatStore(state => state.selectedTool)
  const setSelectedTool = useChatStore(state => state.setSelectedTool)
  const lastUserMessage = useChatStore(state => state.lastUserMessage)
  const setLastUserMessage = useChatStore(state => state.setLastUserMessage)
  const thinkHarder = useChatStore(state => state.thinkHarder)
  const setThinkHarder = useChatStore(state => state.setThinkHarder)
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
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({ followUpSuggestions: true })
  const [chatCreatedEventDispatched, setChatCreatedEventDispatched] = useState(false)
  const [maximizedArtifact, setMaximizedArtifact] = useState<MaximizedItem | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const [promptHistory, setPromptHistory] = useState<string[]>([])
  const [showGuestLimitModal, setShowGuestLimitModal] = useState(false)
  const [guestTotalUserMessages, setGuestTotalUserMessages] = useState(0)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState<Array<{ id: string; name: string; contentType: string }>>([])
  const [quotedText, setQuotedText] = useState<string | null>(null)
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
  const guestImportingRef = useRef(false)
  const autoRetryRef = useRef(0)
  const lastUserMessageIdRef = useRef<string | null>(null)
  const { updateToolResult, clearToolResult } = useVTOP()
  const { rateLimitError, clearRateLimitError, checkForRateLimitError } = useRateLimit()
  const { data: session } = useSession()
  const isGuest = !session?.user
  const shareableChatId = !isGuest ? currentChatIdRef.current || persistedChatId : undefined
  const { showOnboarding, closeOnboarding } = useOnboarding()
  const fallbackTitle = useMemo(
    () => chatTitle || extractTitleFromContent(initialMessages[0]?.content || 'shared chat'),
    [chatTitle, initialMessages]
  )
  const [currentChatTitle, setCurrentChatTitle] = useState(fallbackTitle)
  const [shareOpen, setShareOpen] = useState(false)
  const headerButtonClass = 'h-9 px-4 rounded-md border border-border/60 hover:bg-border/10 disabled:opacity-100 disabled:text-muted-foreground/50 disabled:cursor-not-allowed'
  const headerIconButtonClass = 'h-9 w-9 !px-0 rounded-md border border-border/60 hover:bg-border/10 disabled:opacity-100 disabled:text-muted-foreground/50 disabled:cursor-not-allowed flex items-center justify-center'

  const mainRef = useViewportHeight()

  const [vtopDisclaimer, setVtopDisclaimer] = useState<{
    toolCallId: string
    command: string
    message: string
  } | null>(null)

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      try {
        e.preventDefault()
      } catch {}
      setDeferredPrompt(isBeforeInstallPromptEvent(e) ? e : null)
      setCanInstall(true)
    }

    const onAppInstalled = () => {
      setIsInstalled(true)
      setCanInstall(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  useEffect(() => {
    const handleShare = (event: Event) => {
      const text = readString(customEventDetail(event)?.text)
      if (!text) return
      setShowFullChat(true)
      setInput(text)
    }
    window.addEventListener('hubShareToChat', handleShare)
    return () => window.removeEventListener('hubShareToChat', handleShare)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const prefilledQuery = sessionStorage.getItem('prefilled-query')
    if (prefilledQuery) {
      setInput(prefilledQuery)
      sessionStorage.removeItem('prefilled-query')
      setTimeout(() => {
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message input"]')
        textarea?.focus()
      }, 100)
    }
  }, [])

  useEffect(() => {
    if (shareOpen && (!shareableChatId || isGuest)) {
      setShareOpen(false)
    }
  }, [shareOpen, shareableChatId, isGuest])

  useEffect(() => {
    setCurrentChatTitle(fallbackTitle)
  }, [fallbackTitle])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleTitleUpdate = (event: Event) => {
      const detail = customEventDetail(event)
      const title = readString(detail?.title)
      if (!title) return
      const detailChatId = readString(detail?.chatId)
      const targetChatId = detailChatId || currentChatIdRef.current || resolvedChatId
      if (!targetChatId) return
      if (detailChatId && detailChatId !== currentChatIdRef.current) return
      setCurrentChatTitle(title)
    }
    window.addEventListener('chatTitleUpdated', handleTitleUpdate)
    return () => window.removeEventListener('chatTitleUpdated', handleTitleUpdate)
  }, [resolvedChatId])

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
    if (actionValue && isHubCommand(actionValue)) {
      setPendingBriefingAction(actionValue)
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
    let cancelled = false
    let timeout: number | undefined
    // The hub is lazy-loaded: start the delay once its chunk is in, as when it was bundled here.
    loadHub()
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return
        timeout = window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent(HUB_BRIEFING_ACTION_EVENT, {
              detail: { command: pendingBriefingAction },
            })
          )
          setPendingBriefingAction(null)
        }, 400)
      })
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
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
    const onDisclaimer = (e: Event) => {
      const d = customEventDetail(e)
      if (!d) return
      setVtopDisclaimer({
        toolCallId: readString(d.toolCallId) ?? '',
        command: readString(d.command) ?? '',
        message: readString(d.message) ?? '',
      })
    }
    window.addEventListener('vtopCredentialsDisclaimer', onDisclaimer)
    return () =>
      window.removeEventListener('vtopCredentialsDisclaimer', onDisclaimer)
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
          const data = await readJson(response, userPreferencesResponseSchema)
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

  const shouldAutoRetryStreamError = (errorMessage: string, responseBody: string) => {
    const combined = `${errorMessage || ''} ${responseBody || ''}`.toLowerCase()
    const isTypeValidation = combined.includes('type validation failed')
    const isAbort = combined.includes('"type":"abort"') || combined.includes(' abort')
    const isTimeout = combined.includes('timeout') || combined.includes('timed out')
    const isUserAbort =
      combined.includes('user cancelled') || combined.includes('user canceled') || combined.includes('user aborted')
    return isTypeValidation && isAbort && isTimeout && !isUserAbort
  }

  const chatTransport = useMemo(() => {
    return new DefaultChatTransport<MutableAppMessage>({
      api: isGuest ? '/api/guest-chat' : '/api/chat',
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
        
        // Get current music player state to pass to tools
        const playerStore = useMiniPlayerStore.getState()
        const currentTrack = playerStore.currentIndex >= 0 && playerStore.currentIndex < playerStore.tracks.length 
          ? playerStore.tracks[playerStore.currentIndex] 
          : null
        const musicPlayerState = {
          isPlaying: playerStore.isPlaying,
          currentTrack: currentTrack ? {
            id: currentTrack.id,
            title: currentTrack.title,
            artist: currentTrack.artist || 'Unknown Artist',
          } : null,
          progress: formatTime(playerStore.progressMs),
          duration: formatTime(playerStore.durationMs),
          progressPercent: playerStore.durationMs > 0 
            ? Math.round((playerStore.progressMs / playerStore.durationMs) * 100) 
            : 0,
          trackPosition: currentTrack ? `${playerStore.currentIndex + 1}/${playerStore.tracks.length}` : null,
          loopMode: playerStore.loopCurrent ? 'current' : playerStore.loopAll ? 'all' : 'none',
          shuffle: playerStore.isShuffled,
          trackCount: playerStore.tracks.length,
          tracks: playerStore.tracks.slice(0, 20).map(t => ({ id: t.id, title: t.title, artist: t.artist || 'Unknown' })),
        }
        
        return {
          ...rest,
          body: {
            ...(body || {}),
            messages: messagesWithMetadata,
            id: resolvedChatId,
            ...(selectedTool ? { preferredTool: selectedTool } : {}),
            musicPlayerState,
            mcpConfigs: getEnabledMCPConfigs(),
            thinkHarder: useChatStore.getState().thinkHarder,
          },
        }
      },
    })
  }, [resolvedChatId, selectedTool, isGuest])

  const {
    messages: uiMessages = [],
    sendMessage,
    stop,
    regenerate,
    setMessages: setUiMessages,
    error,
    status,
    resumeStream,
    clearError,
  } = useChat<MutableAppMessage>({
    id: resolvedChatId,
    messages: initialUiMessages,
    experimental_throttle: 100,
    transport: chatTransport,
    resume: autoResume ?? true,
    onFinish: ({ message }) => {
      autoRetryRef.current = 0
      const currentChatId = currentChatIdRef.current
      const metadata: Record<string, unknown> = message.metadata || {}
      const metadataChatIdRaw = readString(metadata.chatId)
      const metadataChatTitle = readString(metadata.chatTitle)

      const metadataChatId = metadataChatIdRaw || resolvedChatId
      const metadataChatPath =
        typeof metadata.chatPath === 'string' && metadata.chatPath.length > 0
          ? metadata.chatPath
          : metadataChatId
            ? `/chat/${metadataChatId}`
            : undefined

      const shouldNavigate =
        Boolean(metadataChatPath) && metadataChatPath !== pathname && !chatCreatedEventDispatched

      if (metadataChatId && metadataChatPath && shouldNavigate) {
        setOptimisticChatId(metadataChatId)
        fallbackChatIdRef.current = metadataChatId
        currentChatIdRef.current = metadataChatId
        setChatCreatedEventDispatched(true)
        const targetPath = metadataChatPath
        router.push(targetPath)
        window.history.replaceState({}, '', targetPath)
        window.dispatchEvent(
          new CustomEvent('newChatCreated', {
            detail: {
              id: metadataChatId,
              title: metadataChatTitle || extractTitleFromContent(messages[0]?.content || 'New Chat'),
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
      if ((currentChatId || metadataChatIdRaw) && isFirstMessageInNewChat) {
        setIsFirstMessageInNewChat(false)
        const targetChatId = currentChatId || metadataChatIdRaw
        if (targetChatId) {
          const newTitle = metadataChatTitle || 'New Chat'
          window.dispatchEvent(
            new CustomEvent('chatTitleUpdated', {
              detail: { chatId: targetChatId, title: newTitle },
            })
          )
          const fetchAndDispatchTitle = async () => {
            try {
              const res = await fetch(`/api/chats/${targetChatId}/title`, { cache: 'no-store' })
              if (res.ok) {
                const data = await readJson(res, chatTitleResponseSchema)
                if (data.title) {
                  window.dispatchEvent(
                    new CustomEvent('chatTitleUpdated', {
                      detail: { chatId: targetChatId, title: data.title },
                    })
                  )
                }
              }
            } catch {}
          }
          fetchAndDispatchTitle()
          const checkTitleUpdate = async (attempt = 1, maxAttempts = 3) => {
            try {
              const response = await fetch(`/api/chats/${targetChatId}`)
              if (!response.ok) throw new Error('Failed to load chat metadata')
              const chatData = await readJson(response, chatDetailResponseSchema)
              if (chatData.title && chatData.title !== 'New Chat') {
                window.dispatchEvent(
                  new CustomEvent('chatTitleUpdated', {
                    detail: { chatId: targetChatId, title: chatData.title },
                  })
                )
                return
              }
              if (attempt < maxAttempts) setTimeout(() => checkTitleUpdate(attempt + 1, maxAttempts), 2000)
            } catch (error) {
              if (attempt < maxAttempts) setTimeout(() => checkTitleUpdate(attempt + 1, maxAttempts), 2000)
            }
          }
          setTimeout(() => checkTitleUpdate(), 1500)
        }
      }
    },
  onError: err => {
      const errorMessage = err.message || err.toString()
      const responseBody: unknown =
        typeof err === 'object' && err !== null && 'responseBody' in err ? err.responseBody : ''
      const bodyString = typeof responseBody === 'string' ? responseBody : ''

      if (shouldAutoRetryStreamError(errorMessage, bodyString)) {
        if (autoRetryRef.current < 1) {
          autoRetryRef.current += 1
          try {
            clearError?.()
          } catch {}
          setTimeout(() => {
            regenerate?.()
          }, 250)
        }
        return
      }

      if (isGuest) {
        const guestLimitError =
          /guest limit/i.test(errorMessage) ||
          bodyString.includes('GUEST_LIMIT') ||
          bodyString.toLowerCase().includes('guest mode includes 2')
        if (guestLimitError) {
          setShowGuestLimitModal(true)
          return
        }
      }

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

      const friendlyError =
        typeof responseBody === 'string' && responseBody
          ? responseBody
          : errorMessage || 'Sorry, something went wrong while streaming the reply.'

      setUiMessages(prev => [
        ...prev,
        {
          id: generateUUID(),
          role: 'assistant',
          parts: [{ type: 'text', text: friendlyError }],
          metadata: { error: true },
        },
      ])

      if (!localRateLimitDetected && !isRateLimit && !contextRateLimit && !isGeminiStreamingError) {
        toast.error('Something went wrong. Please try again.')
      }
    },
  })

  // Per-message cached conversion: unchanged UI messages keep their legacy object, so only the
  // streaming message gets a new object each throttled tick and memoized bubbles skip the rest.
  const messages = useMemo(() => cachedUiMessagesToLegacyMessages(uiMessages), [uiMessages])

  useEffect(() => {
    const lastUser = [...uiMessages].reverse().find(m => m.role === 'user')
    if (!lastUser) return
    if (lastUserMessageIdRef.current !== lastUser.id) {
      lastUserMessageIdRef.current = lastUser.id
      autoRetryRef.current = 0
    }
  }, [uiMessages])

  // The composer only needs recent messages when an autocomplete request fires; read them lazily
  // through a stable getter so streaming ticks don't re-render the input.
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  const getRecentMessages = useCallback(() => toConversationHistory(messagesRef.current).slice(-6), [])

  const guestMessagesRemaining = Math.max(0, GUEST_MESSAGE_LIMIT - guestTotalUserMessages)

  useEffect(() => {
    setShowFullChat(initialMessages.length > 0)
  }, [initialMessages.length, setShowFullChat])

  useEffect(() => {
    if (!isGuest) return
    if (typeof window === 'undefined') return
    const guestParam = searchParams?.get('guest') === '1'
    if (guestParam) {
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('guest')
        window.history.replaceState({}, '', url.toString())
      } catch (error) {
        console.error('failed to clean guest param', error)
      }
    }
  }, [isGuest, searchParams])

  useEffect(() => {
    if (!isGuest) return
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(GUEST_STORAGE_KEY)
      if (stored) {
        const parsedJson: unknown = JSON.parse(stored)
        const parsed = isRecord(parsedJson) ? parsedJson : null
        const storedChatId = readString(parsed?.chatId)
        if (storedChatId) {
          setOptimisticChatId(storedChatId)
          fallbackChatIdRef.current = storedChatId
          currentChatIdRef.current = storedChatId
        }
        const storedMessages = parsed?.messages
        if (
          Array.isArray(storedMessages) &&
          storedMessages.length > 0 &&
          storedMessages.every(isStoredUiMessage)
        ) {
          setUiMessages(storedMessages)
          setShowFullChat(true)
        }
        if (typeof parsed?.userMessageCount === 'number') {
          setGuestTotalUserMessages(parsed.userMessageCount)
        }
        return
      }
      const seedId = resolvedChatId || generateUUID()
      window.localStorage.setItem(
        GUEST_STORAGE_KEY,
        JSON.stringify({
          chatId: seedId,
          messages: [],
          userMessageCount: 0,
          lastUpdated: new Date().toISOString(),
        })
      )
      setOptimisticChatId(seedId)
      fallbackChatIdRef.current = seedId
      currentChatIdRef.current = seedId
    } catch (error) {
      console.error('Failed to restore guest session', error)
    }
  }, [isGuest, resolvedChatId, setUiMessages, setShowFullChat])

  useEffect(() => {
    if (!isGuest) return
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        GUEST_STORAGE_KEY,
        JSON.stringify({
          chatId: resolvedChatId,
          messages: uiMessages,
          userMessageCount: guestTotalUserMessages,
          lastUpdated: new Date().toISOString(),
        })
      )
    } catch (error) {
      console.error('Failed to persist guest chat', error)
    }
  }, [isGuest, uiMessages, resolvedChatId, guestTotalUserMessages])

  useEffect(() => {
    if (!session?.user?.id) return
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(GUEST_STORAGE_KEY)
    if (!stored || guestImportingRef.current) return
    try {
      const parsedJson: unknown = JSON.parse(stored)
      const parsed = isRecord(parsedJson) ? parsedJson : null
      if (!parsed || !Array.isArray(parsed.messages) || parsed.messages.length === 0) {
        window.localStorage.removeItem(GUEST_STORAGE_KEY)
        return
      }
      guestImportingRef.current = true
      ;(async () => {
        try {
          const res = await fetch('/api/guest/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: parsed.chatId, messages: parsed.messages }),
          })
          if (res.ok) {
            const dataJson: unknown = await res.json()
            const data = isRecord(dataJson) ? dataJson : {}
            window.localStorage.removeItem(GUEST_STORAGE_KEY)
            toast.success('moved your guest chat into your account')
            router.push(readString(data.path) || `/chat/${readString(data.chatId)}`)
          } else {
            const msg = await res.text()
            console.warn('Guest import skipped', res.status, msg)
            window.localStorage.removeItem(GUEST_STORAGE_KEY)
          }
        } catch (error) {
          console.error('Error importing guest chat', error)
          window.localStorage.removeItem(GUEST_STORAGE_KEY)
        } finally {
          guestImportingRef.current = false
        }
      })()
    } catch (error) {
      console.error('Failed to parse guest chat storage', error)
      guestImportingRef.current = false
      window.localStorage.removeItem(GUEST_STORAGE_KEY)
    }
  }, [session?.user?.id, router, isGuest])

  const isLoading = status === 'submitted' || status === 'streaming'

  useAutoResume({
    autoResume: autoResume ?? true,
    initialMessages: initialUiMessages,
    resumeStream,
    setMessages: setUiMessages,
  })

  // Use Scira's rAF + near-bottom scroll helper to avoid fighting the user.
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    scrollContainerRef.current = contentRef.current?.parentElement ?? null
  })
  const { scrollToBottom: optimizedScrollToBottom } = useOptimizedScroll(
    scrollContainerRef
  )

  const scrollToBottom = useCallback(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Active streaming or reduced-motion users: fast instant jump via the
    // shared optimized hook (matches Scira behavior).
    if (isLoading || prefersReducedMotion) {
      optimizedScrollToBottom()
      setIsAtBottom(true)
      return
    }
    // Idle state still uses a smooth scroll — nicer when the user taps the
    // "scroll to latest" pill.
    if (!messagesEndRef.current) return
    const container = contentRef.current?.parentElement
    if (container && isMobile) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    } else {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
    setIsAtBottom(true)
  }, [isMobile, isLoading, optimizedScrollToBottom])

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
      const target = e.target instanceof HTMLElement ? e.target : null
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
        const active = document.activeElement
        if (active instanceof HTMLTextAreaElement) {
          active.blur()
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
    if (!isInitialRender && messages.length > 0 && messages.at(-1)?.role === 'user') {
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
    return undefined
  }, [isLoading, isInitialRender, throttledScrollToBottom, autoScrollEnabled])

  useEffect(() => {
    if (isMobile && !isInitialRender && messages.length > 0 && autoScrollEnabled) {
      const timeoutId = setTimeout(() => {
        throttledScrollToBottom()
      }, 200)

      return () => clearTimeout(timeoutId)
    }
    return undefined
  }, [messages.length, isMobile, isInitialRender, throttledScrollToBottom, autoScrollEnabled])

  useEffect(() => {
    if (error) {
      const errorMessage = error.message || error.toString()
      const responseBody: unknown =
        typeof error === 'object' && error !== null && 'responseBody' in error ? error.responseBody : ''
      const bodyString = typeof responseBody === 'string' ? responseBody : ''

      if (shouldAutoRetryStreamError(errorMessage, bodyString)) {
        return
      }

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
      if (isRateLimit) return
    }
  }, [error, checkForRateLimitError])

  const handleAttachmentsSelected = useCallback(
    async (files: FileList | File[]) => {
      if (isGuest) {
        toast.error('File uploads are available after signing in.')
        return
      }
      const incoming = Array.from(files)
      if (!incoming.length) return

      const remaining = Math.max(0, 6 - attachments.length)
      const limited = incoming.slice(0, remaining)

      // Create uploading placeholders for each file
      const uploads = limited.map((file, i) => ({
        file,
        placeholder: {
          id: `uploading-${Date.now()}-${i}`,
          name: file.name,
          contentType: file.type || 'application/octet-stream',
        },
      }))
      setUploadingAttachments(uploads.map(upload => upload.placeholder))

      try {
        const uploaded: Attachment[] = []
        for (const { file, placeholder } of uploads) {
          const uploadId = placeholder.id
          const sizeMb = file.size / (1024 * 1024)
          if (sizeMb > 25) {
            toast.error(`${file.name} is too large (max 25MB)`, { position: 'top-center' })
            setUploadingAttachments(prev => prev.filter(u => u.id !== uploadId))
            continue
          }
          const formData = new FormData()
          formData.append('file', file)
          const res = await fetch('/api/files/upload', { method: 'POST', body: formData })
          if (!res.ok) {
            const errJson: unknown = await res.json().catch(() => ({ error: undefined }))
            const errText = isRecord(errJson) ? readString(errJson.error) : undefined
            toast.error(errText || `Failed to upload ${file.name}`)
            setUploadingAttachments(prev => prev.filter(u => u.id !== uploadId))
            continue
          }
          const dataJson: unknown = await res.json()
          const data = isRecord(dataJson) ? dataJson : {}
          uploaded.push({
            url: readString(data.url) ?? '',
            name: readString(data.name) || file.name,
            contentType: readString(data.contentType) ?? '',
          })
          // Remove this file from uploading state
          setUploadingAttachments(prev => prev.filter(u => u.id !== uploadId))
        }
        if (uploaded.length) {
          setAttachments(prev => [...prev, ...uploaded])
        }
      } catch (err) {
        console.error('attachment upload failed', err)
        toast.error('upload failed — please try again')
      } finally {
        setUploadingAttachments([])
      }
    },
    [attachments.length, isGuest]
  )

  const handleRemoveAttachment = useCallback((url: string) => {
    setAttachments(prev => prev.filter(att => att.url !== url))
  }, [])

  const extractLinkAttachments = useCallback((text: string): Attachment[] => {
    const urlRegex = /https?:[^\s)]+/gi
    const matches = text.match(urlRegex) || []
    return matches
      .flatMap((rawUrl): Attachment[] => {
        const url = rawUrl.replace(/[\]\)]$/, '') // trim trailing bracket/paren
        const lower = url.toLowerCase()
        const isPdf = lower.endsWith('.pdf')
        const isPng = lower.endsWith('.png')
        const isJpg = lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        const isWebp = lower.endsWith('.webp')
        const isGif = lower.endsWith('.gif')
        const isImage = isPng || isJpg || isWebp || isGif
        if (!isPdf && !isImage) return []
        const contentType = isPdf
          ? 'application/pdf'
          : isPng
            ? 'image/png'
            : isJpg
              ? 'image/jpeg'
              : isWebp
                ? 'image/webp'
                : 'image/gif'
        const name = url.split('/').pop() || (isPdf ? 'document.pdf' : 'image')
        return [{ url, name, contentType }]
      })
  }, [])

  const handleFormSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const trimmed = inputStore.getState().input.trim()
      if (!trimmed && !quotedText) return
      if (uploadingAttachments.length > 0) {
        toast.info('hold on — files are still uploading')
        return
      }
      if (isGuest && guestTotalUserMessages >= GUEST_MESSAGE_LIMIT) {
        setShowGuestLimitModal(true)
        return
      }

      setPromptHistory(prev =>
        prev.length && prev[prev.length - 1] === trimmed ? prev : [...prev, trimmed]
      )

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
        const parts: MutableAppMessage['parts'] = []
        const linkAttachments = extractLinkAttachments(trimmed)
        const allAttachments = [...attachments, ...linkAttachments]

        if (allAttachments.length) {
          parts.push(
            ...allAttachments.map(att => ({
              type: 'file' as const,
              url: att.url,
              mediaType: att.contentType,
              ...(att.name ? { filename: att.name } : {}),
            }))
          )
        }

        const finalContent = quotedText 
          ? `> ${quotedText.replace(/\n/g, '\n> ')}\n\n${trimmed}`
          : trimmed

        parts.push({ type: 'text', text: finalContent })

        // Clear attachments and input BEFORE sending to prevent them from persisting during navigation
        setAttachments([])
        setUploadingAttachments([])
        setInput('')
        setQuotedText(null)

        await sendMessage({
          role: 'user',
          parts,
        })
        if (isGuest) {
          setGuestTotalUserMessages(prev => prev + 1)
        }
      } catch (err) {
        console.error('Error submitting message:', err)
        setErrorMessage('Failed to send message. Please try again.')
      }
    },
    [
      inputStore,
      setInput,
      quotedText,
      extractLinkAttachments,
      setShowFullChat,
      showFullChat,
      clearRateLimitError,
      setShowFollowUpSuggestions,
      setLastUserMessage,
      setErrorMessage,
      setHasUserInitiatedConversation,
      sendMessage,
      isGuest,
      guestTotalUserMessages,
      setShowGuestLimitModal,
      attachments,
      setAttachments,
      uploadingAttachments,
    ]
  )

  const handleSuggestedQuestion = useCallback(
    async (question: string) => {
      if (isGuest && guestTotalUserMessages >= GUEST_MESSAGE_LIMIT) {
        setShowGuestLimitModal(true)
        return
      }
      setInput('')
      setShowFollowUpSuggestions(false)
      setLastUserMessage(question)
      setPromptHistory(prev =>
        prev.length && prev[prev.length - 1] === question ? prev : [...prev, question]
      )

      if (!showFullChat) {
        setShowFullChat(true)
        setIsFirstMessageInNewChat(true)
      }
      setErrorMessage(null)
      clearRateLimitError()
      setHasUserInitiatedConversation(true)

      try {
        await sendMessage({ text: question })
        if (isGuest) {
          setGuestTotalUserMessages(prev => prev + 1)
        }
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
      isGuest,
      guestTotalUserMessages,
      setShowGuestLimitModal,
      extractLinkAttachments,
    ]
  )

  const handleToolSelection = useCallback(
    (toolId: string) => {
      setSelectedTool(toolId)
    },
    [setSelectedTool]
  )

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

  const createCanvasFromMessage = useCallback((_content: string) => {
    setHubOpen(true)
  }, [])

  const handleLoginClick = useCallback(() => {
    if (isGuest) {
      signIn('google', { callbackUrl: '/' })
      return
    }
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
  }, [isGuest])

  const handlePlacementSearch = useCallback(
    (company: string) => {
      sendMessage({ text: `Get placement information for ${company}` }).catch(error => {
        console.error('Error sending placement search request:', error)
        setErrorMessage('Failed to send message. Please try again.')
      })
    },
    [sendMessage]
  )

  const handleClearQuote = useCallback(() => setQuotedText(null), [])
  const handleDismissFollowUps = useCallback(() => setShowFollowUpSuggestions(false), [])
  const handleCloseHub = useCallback(() => setHubOpen(false), [])

  // Messages rendered in the transcript: hide assistant messages that only carry hidden tools.
  const transcriptMessages = useMemo(() => messages.filter(isTranscriptMessage), [messages])
  const conversationHistory = useMemo(() => toConversationHistory(messages), [messages])

  // Lazy overlays mount on first use and stay mounted so their close animations still play.
  const [hubMounted, setHubMounted] = useState(false)
  if (hubOpen && !hubMounted) setHubMounted(true)
  const [onboardingMounted, setOnboardingMounted] = useState(false)
  if (showOnboarding && !onboardingMounted) setOnboardingMounted(true)
  const [chatgptAnnouncementEligible, setChatgptAnnouncementEligible] = useState(false)
  useEffect(() => {
    if (isGuest) return
    try {
      if (window.localStorage.getItem(CHATGPT_CONNECT_ANNOUNCEMENT_SEEN_KEY) !== 'true') {
        setChatgptAnnouncementEligible(true)
      }
    } catch {}
  }, [isGuest])

  const handleQuote = useCallback((text: string) => {
    setQuotedText(text)
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message input"]')
    textarea?.focus()
  }, [])

  const handleVTOPCredentials = async (
    credentials: { username: string; encryptedPassword: string },
    originalToolCall: VtopOriginalToolCall | null | undefined
  ) => {
    try {
      setVtopLoading(true)
      const originalResult = isRecord(originalToolCall?.result) ? originalToolCall.result : undefined
      const command = readString(originalToolCall?.args?.command) || readString(originalResult?.command)
      if (!command) {
        console.error('No command found in original tool call')
        setVtopLoading(false)
        return
      }
      const toolCallId = originalToolCall?.toolCallId || Date.now().toString()
      clearToolResult(toolCallId)

      const updatedMessagesForLoading = messages.map(message => {
        if (message.toolInvocations) {
          const updatedToolInvocations = message.toolInvocations.map(
            (toolInvocation): LegacyToolInvocation => {
              if (toolInvocation.toolCallId && toolCallId) {
                return {
                  ...toolInvocation,
                  toolCallId: toolCallId,
                  state: 'call',
                  result: undefined,
                }
              }
              return toolInvocation
            }
          )
          return {
            ...message,
            toolInvocations: updatedToolInvocations,
          }
        }
        return message
      })

      setUiMessages(prev => {
        const base = updatedMessagesForLoading.map(legacyToMutableMessage)
        const last = base.at(-1)
        if (!last) return base
        const toolInvocationPayload: LegacyToolInvocation = {
          toolCallId: toolCallId,
          toolName: 'queryVTOP',
          args: { command, username: credentials.username },
          state: 'call',
          result: undefined,
        }
        if (last.role === 'assistant') {
          const exists = last.toolInvocations?.some(t => t.toolCallId === toolCallId)
          if (!exists) {
            base[base.length - 1] = {
              ...last,
              toolInvocations: [...(last.toolInvocations || []), toolInvocationPayload],
            }
          } else {
            base[base.length - 1] = {
              ...last,
              toolInvocations: (last.toolInvocations ?? []).map(t =>
                t.toolCallId === toolCallId ? { ...t, state: 'call', result: undefined } : t
              ),
            }
          }
        } else {
          base.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            role: 'assistant',
            content: '',
            parts: [],
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
              ...originalToolCall?.args,
            },
            toolCallId: toolCallId,
          },
          id: resolvedChatId,
        }),
      })

      if (response.ok) {
        const responseText = await response.text()

        function parseVTOPResponse(raw: string): unknown {
          if (!raw || typeof raw !== 'string') {
            throw new Error('Empty response')
          }

          const trimmed = raw.trim()

          if (/^[\[{]/.test(trimmed)) {
            try {
              const parsedJson: unknown = JSON.parse(trimmed)
              return parsedJson
            } catch {
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

          lines.forEach((line, i) => {
            // keep exact spacing; payload might be HTML
            const m = line.match(frameHeader)

            if (m) {
              flush()
              const frame: Frame = { prefix: m[1] ?? '', payload: m[2] ?? '' }
              if (i < lines.length - 1) frame.payload += '\n' // preserve newline after first line
              current = frame
            } else {
              if (current) {
                current.payload += line + (i < lines.length - 1 ? '\n' : '')
              } else {
              }
            }
          })
          flush()

          const safeParseJSON = (s: string): unknown => {
            const t = s.trim()
            if (!/^[\[{]/.test(t)) throw new Error('Not JSON')
            try {
              const parsedJson: unknown = JSON.parse(t)
              return parsedJson
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
              const parsedCandidate: unknown = JSON.parse(candidate)
              return parsedCandidate
            }
          }

          const decodePossibleJSONString = (s: string): string => {
            const t = s.trim()
            if (t.startsWith('"') && t.endsWith('"') && !t.includes('\n')) {
              try {
                const decoded: unknown = JSON.parse(t) // unescapes \n, \", etc.
                if (typeof decoded === 'string') return decoded
              } catch {
              }
            }
            if (t.startsWith('"') && t.endsWith('"')) {
              return t.slice(1, -1)
            }
            return s
          }

          const toolFrames: unknown[] = []
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
            [...toolFrames].reverse().find(x => isRecord(x) && 'result' in x) ??
            [...toolFrames].reverse().find(x => x) // fallback to any 'a' frame

          if (isRecord(chosen) && chosen.result !== undefined) {
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

        let parsedResponse: unknown
        try {
          parsedResponse = parseVTOPResponse(responseText)
        } catch (err) {
          console.error('VTOP parse error. Raw response begins with:', responseText.slice(0, 180))
          console.error(err)
          toast.error('Error processing VTOP response. Please try again.')
          setVtopLoading(false)
          return
        }
        const toolResult: unknown = isRecord(parsedResponse) ? parsedResponse.result : undefined
        const toolResultRecord = isRecord(toolResult) ? toolResult : undefined

        if (toolCallId) {
          updateToolResult(toolCallId, command, toolResult)
        }
        const updatedMessages = uiMessages.map(message => {
          if (message.toolInvocations) {
            const updatedToolInvocations = message.toolInvocations.map(
              (toolInvocation): LegacyToolInvocation => {
                if (toolInvocation.toolCallId && toolInvocation.toolCallId === toolCallId) {
                  return {
                    ...toolInvocation,
                    result: toolResult,
                    state: 'result',
                  }
                }
                return toolInvocation
              }
            )

            const updatedParts = message.parts
              ? message.parts.map(part => {
                  if (
                    isLegacyToolInvocationPart(part) &&
                    part.toolInvocation.toolCallId === toolCallId
                  ) {
                    return {
                      ...part,
                      toolInvocation: {
                        ...part.toolInvocation,
                        result: toolResult,
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
        setUiMessages([...updatedMessages])

        try {
          const formattedContent =
            (toolResultRecord &&
              (readString(toolResultRecord.formatted_content) || readString(toolResultRecord.summary))) ||
            ''
          if (formattedContent) {
            setUiMessages(prev => {
              const idx = prev.findIndex(
                m =>
                  m.role === 'assistant' &&
                  m.toolInvocations?.some(t => t.toolCallId === toolCallId)
              )
              const target = prev[idx]
              if (idx !== -1 && target) {
                const clone = prev.map(message => ({ ...message }))
                const existingContent = target.content || ''
                if (existingContent.trim() === '') {
                  clone[idx] = { ...target, content: formattedContent }
                } else if (!existingContent.includes(formattedContent.slice(0, 30))) {
                  clone[idx] = {
                    ...target,
                    content: `${existingContent}\n\n${formattedContent}`.trim(),
                  }
                }
                return clone
              }
              const newAssistantMsg: MutableAppMessage = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                role: 'assistant',
                content: formattedContent,
                parts: [],
                toolInvocations: [
                  {
                    toolCallId: toolCallId,
                    toolName: 'queryVTOP',
                    args: { command },
                    result: toolResult,
                    state: 'result',
                  },
                ],
              }
              return [...prev, newAssistantMsg]
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
          toolResultRecord &&
          toolResultRecord.success !== false &&
          (toolResultRecord.data || toolResultRecord.output)
        ) {
          if (chatId) {
            setTimeout(async () => {
              try {
                const refreshResponse = await fetch(`/api/chats/${chatId}`)
                if (!refreshResponse.ok) {
                  throw new Error('Failed to refresh conversation after VTOP data retrieval')
                }
                const chatData = await readJson(refreshResponse, chatDetailResponseSchema)
                setUiMessages(legacyMessagesToUiMessages(chatData.messages))
              } catch (error) {
                console.warn('Failed to refresh conversation after VTOP data retrieval:', error)
              }
            }, 500)
          }
        } else if (toolResultRecord && toolResultRecord.success === false) {
          const errorMessage =
            readString(toolResultRecord.error) ||
            readString(toolResultRecord.message) ||
            'Unknown error occurred'
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
    return undefined
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
            const toolResult: unknown = tool.result
            if (toolResult) {
              const command =
                readString(isRecord(toolResult) ? toolResult.command : undefined) ||
                readString(tool.args?.command) ||
                'unknown'
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
        {/*<UpsellBanner /> */}
        {onboardingMounted && <OnboardingDialog isOpen={showOnboarding} onClose={closeOnboarding} />}
        {!isGuest && hubMounted && (
          <Hub
            isOpen={hubOpen}
            actions={hubActionHandlers}
            onLink={handleLoginClick}
            onClose={handleCloseHub}
          />
        )}
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
                {!sidebarOpen && !isGuest && (
                  <HamburgerButton onClick={toggleSidebar} className="md:hidden" />
                )}
                {isGuest && (
                  <div className="flex items-center gap-2 ml-auto">
                    <Button
                      variant="ghost"
                      onClick={() => signIn()}
                      className={isMobile ? headerIconButtonClass : headerButtonClass}
                      title="sign in"
                    >
                      <LogIn className="h-4 w-4" />
                      {!isMobile && <span className="ml-2">sign in</span>}
                    </Button>
                  </div>
                )}
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
                  inputStore={inputStore}
                  handleSubmit={handleFormSubmit}
                  isLoading={isLoading}
                  lastPrompt={lastUserMessage}
                  promptHistory={promptHistory}
                  onToolSelect={handleToolSelection}
                  selectedTool={selectedTool || 'general'}
                  placeholder={isGuest ? 'ask anything...' : 'ask anything...'}
                  disabled={isGuest && showGuestLimitModal}
                  getRecentMessages={getRecentMessages}
                  attachments={attachments}
                  onSelectFiles={!isGuest ? handleAttachmentsSelected : undefined}
                  onRemoveAttachment={handleRemoveAttachment}
                  uploadingAttachments={uploadingAttachments}
                  allowAttachments={!isGuest}
                  thinkHarder={thinkHarder}
                  onThinkHarderChange={setThinkHarder}
                  isSignedIn={!isGuest}
                  quotedText={quotedText}
                  onClearQuote={handleClearQuote}
                />
                {isGuest && (
                  <p className="mt-2 text-center text-xs text-amber-200/80">
                    guest mode · {guestMessagesRemaining} message
                    {guestMessagesRemaining === 1 ? '' : 's'} left · conversations move over when you sign in
                  </p>
                )}{' '}
              </motion.div>

              {/*
              <div className="w-full max-w-5xl flex justify-center -mt-3">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
                >
                  <button
                    onClick={() => {
                      if (isGuest) {
                        handleLoginClick()
                        return
                      }
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
                      <span>
                        {isGuest
                          ? 'sign in'
                          : showDailyBriefingLabel
                            ? 'daily briefing'
                            : 'hub'}
                      </span>
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
              */}

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
        {/* <UpsellBanner /> */}
        {onboardingMounted && <OnboardingDialog isOpen={showOnboarding} onClose={closeOnboarding} />}
        {!isGuest && hubMounted && (
          <Hub
            isOpen={hubOpen}
            actions={hubActionHandlers}
            onLink={handleLoginClick}
            onClose={handleCloseHub}
          />
        )}
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
              {!sidebarOpen && !isGuest && <HamburgerButton onClick={toggleSidebar} className="md:block" />}
              <div className="flex items-center gap-2 ml-auto">
                {!sidebarOpen && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (isGuest && guestTotalUserMessages >= GUEST_MESSAGE_LIMIT) {
                        setShowGuestLimitModal(true)
                        return
                      }
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
                    className={isMobile ? headerIconButtonClass : headerButtonClass}
                    title="new chat"
                  >
                    <Plus className="h-4 w-4" />
                    {!isMobile && <span className="ml-2">new chat</span>}
                  </Button>
                )}
                {!isGuest && (
                  <Button
                    variant="ghost"
                    onClick={() => setShareOpen(true)}
                    className={isMobile ? headerIconButtonClass : headerButtonClass}
                    disabled={!shareableChatId || messages.length === 0}
                    title={
                      messages.length === 0
                        ? 'send a message first to generate a shareable link'
                        : 'share this chat'
                    }
                  >
                    <Share className="h-4 w-4" />
                    {!isMobile && <span className="ml-2">share</span>}
                  </Button>
                )}
                {canInstall && !isInstalled && (
                  <Button
                    variant="ghost"
                    onClick={handleInstallClick}
                    className={`${headerButtonClass} hidden md:inline-flex`}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    install app
                  </Button>
                )}
                {canInstall && !isInstalled && (
                  <Button
                    variant="ghost"
                    onClick={handleInstallClick}
                    className={`${headerIconButtonClass} md:hidden`}
                    title="install app"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                <div className="hidden md:block">
                  <DesktopPdfDockButton />
                </div>
                <div className="md:hidden">
                  <MobilePdfDockButton />
                </div>
                {isGuest && (
                  <Button
                    variant="ghost"
                    onClick={() => signIn()}
                    className={isMobile ? headerIconButtonClass : headerButtonClass}
                    title="sign in"
                  >
                    <LogIn className="h-4 w-4" />
                    {!isMobile && <span className="ml-2">sign in</span>}
                  </Button>
                )}
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
                  messages={transcriptMessages}
                  chatId={persistedChatId ?? resolvedChatId}
                  isLoading={isLoading}
                  onCreateCanvas={createCanvasFromMessage}
                  onLoginClick={handleLoginClick}
                  onPlacementSearch={handlePlacementSearch}
                  maximizedItem={maximizedArtifact}
                  setMaximizedItem={setMaximizedArtifact}
                  // Pass follow-up suggestions props for desktop inline display
                  showFollowUpSuggestions={showFollowUpSuggestions && userPreferences.followUpSuggestions !== false}
                  lastAssistantMessage={lastAssistantMessage}
                  lastUserMessage={lastUserMessage}
                  conversationHistory={conversationHistory}
                  onSuggestionClick={handleSuggestedQuestion}
                  onDismissSuggestions={handleDismissFollowUps}
                  isMobile={isMobile}
                  onQuote={handleQuote}
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
                {/* Mobile only: show follow-up suggestions above input */}
                {isMobile && (
                  <FollowUpSuggestions
                    lastAssistantMessage={lastAssistantMessage}
                    lastUserMessage={lastUserMessage}
                    conversationHistory={conversationHistory}
                    isVisible={showFollowUpSuggestions && !isLoading}
                    onSuggestionClick={handleSuggestedQuestion}
                    onDismiss={handleDismissFollowUps}
                    isMobile={true}
                  />
                )}
                <MultimodalInput
                  inputStore={inputStore}
                  handleSubmit={handleFormSubmit}
                  isLoading={isLoading}
                  lastPrompt={lastUserMessage}
                  promptHistory={promptHistory}
                  placeholder={isGuest ? 'ask anything...' : 'ask anything...'}
                  stop={stop}
                  onToolSelect={handleToolSelection}
                  selectedTool={selectedTool || 'general'}
                  getRecentMessages={getRecentMessages}
                  disabled={isGuest && showGuestLimitModal}
                  attachments={attachments}
                  onSelectFiles={!isGuest ? handleAttachmentsSelected : undefined}
                  onRemoveAttachment={handleRemoveAttachment}
                  uploadingAttachments={uploadingAttachments}
                  allowAttachments={!isGuest}
                  thinkHarder={thinkHarder}
                  onThinkHarderChange={setThinkHarder}
                  isSignedIn={!isGuest}
                  quotedText={quotedText}
                  onClearQuote={handleClearQuote}
                />
                {isGuest && (
                  <p className="px-2 sm:px-4 pt-2 text-center text-[11px] text-amber-200/80">
                    guest mode · {guestMessagesRemaining} message
                    {guestMessagesRemaining === 1 ? '' : 's'} left 
                  </p>
                )}
                <div className="px-2 sm:px-4 pb-0.5 hidden sm:block">
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

  return (
    <HubStoreProvider initialState={hubSeed}>
      {hubLayout}
      {chatgptAnnouncementEligible && <ChatgptConnectAnnouncementModal enabled={!isGuest} />}
      <GuestLimitDialog
        open={showGuestLimitModal}
        onClose={() => setShowGuestLimitModal(false)}
        remainingMessages={guestMessagesRemaining}
      />
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        chatId={shareableChatId || resolvedChatId || ''}
        title={currentChatTitle}
        previewMessages={messages}
      />
    </HubStoreProvider>
  )
}

const PureChatInterface = memo(PureChatInterfaceComponent, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.autoResume === nextProps.autoResume &&
    prevProps.chatTitle === nextProps.chatTitle &&
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
    chatTitle,
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
            chatTitle={chatTitle}
          />
        </VTOPProvider>
      </RateLimitProvider>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.chatId === nextProps.chatId &&
      prevProps.autoResume === nextProps.autoResume &&
      prevProps.chatTitle === nextProps.chatTitle &&
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
