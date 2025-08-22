'use client'

import { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useChat } from '@ai-sdk/react'
import type { UIMessage as AIMessage } from 'ai'
import { DefaultChatTransport } from 'ai'
import { useRouter } from 'next/navigation'
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
import Hub from '@/components/hub/hub'
import { extractTitleFromContent, cn } from '@/lib/utils'
import UpsellBanner from '@/components/upsell-banner'
import { VTOPToolHandler } from '@/components/vtop-tool-handler'
import { VTOPProvider, useVTOP } from '@/contexts/vtop-context'
import { RateLimitProvider, useRateLimit } from '@/contexts/rate-limit-context'
import { RateLimitErrorDisplay } from '@/components/rate-limit-error-display'
import { OnboardingDialog } from '@/components/onboarding-dialog'
import { useOnboarding } from '@/hooks/use-onboarding'
import { toast } from 'sonner'
import ScrollToTopButton from '@/components/scroll-to-top-button'
import { useThrottle } from '@/hooks/use-debounce'
import { useSidebar } from '@/contexts/sidebar-context'
import { StreamingErrorDisplay } from '@/components/streaming-error-display'
import { DynamicLoadingIndicator } from '@/components/dynamic-loading-indicator'

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
    const onOrientation = () => setTimeout(setVh, 50)

    setVh()
    window.addEventListener('resize', setVh, { passive: true })
    window.addEventListener('orientationchange', onOrientation, { passive: true })
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange)
    }

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', setVh)
      window.removeEventListener('orientationchange', onOrientation)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange)
      }
    }
  }, [])

  return mainRef
}

import { MemoryWithId } from '@/hooks/use-memories'

interface Message extends AIMessage {
  createdAt?: string | Date
  metadata?: Record<string, any> & {
    memory?: boolean
    importance?: number
    tags?: string[]
  }
}

function memoryToMessage(memory: MemoryWithId): Message {
  return {
    id: memory.id,
    parts: [{ type: 'text', text: memory.content }],
    role: 'system',
    createdAt: memory.createdAt,
    metadata: {
      memory: true,
      importance: memory.importance,
      tags: memory.tags,
    },
  }
}

interface ChatInterfaceProps {
  chatId?: string
  autoResume?: boolean
  initialMessages?: any[]
}

const getTextFromMessage = (m: { parts?: Array<{ type: string; text?: string }> } | undefined) =>
  m?.parts?.filter(p => p.type === 'text').map(p => p.text || '').join(' ') || ''

import { createId as cuid } from '@paralleldrive/cuid2'
const makeClientId = () => cuid()

const PureChatInterface = memo(
  ({ chatId, autoResume = false, initialMessages = [] }: ChatInterfaceProps) => {
    const [showFullChat, setShowFullChat] = useState(false)
    const { isOpen: sidebarOpen, toggle: toggleSidebar } = useSidebar()
    const [hubOpen, setHubOpen] = useState(false)
    const [vtopLoading, setVtopLoading] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [hasUserInitiatedConversation, setHasUserInitiatedConversation] = useState(false)
    const [isInitialRender, setIsInitialRender] = useState(true)
    const [isMobile, setIsMobile] = useState(false)
    const [isFirstMessageInNewChat, setIsFirstMessageInNewChat] = useState(false)
    const [isZoomed, setIsZoomed] = useState(false)
    const [showFollowUpSuggestions, setShowFollowUpSuggestions] = useState(false)
    const [lastAssistantMessage, setLastAssistantMessage] = useState<string>('')
    const [lastUserMessage, setLastUserMessage] = useState<string>('')
    const [userPreferences, setUserPreferences] = useState<any>({ followUpSuggestions: true })
    const [selectedTool, setSelectedTool] = useState<string>('')
    const [chatCreatedEventDispatched, setChatCreatedEventDispatched] = useState(false)
    const [maximizedArtifact, setMaximizedArtifact] = useState<any>(null)
    const [isAtBottom, setIsAtBottom] = useState(true)
  // PWA install handling
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const [optimisticChatId, setOptimisticChatId] = useState<string | undefined>(chatId)
    const currentChatIdRef = useRef<string | undefined>(chatId)
    const { updateToolResult, clearToolResult } = useVTOP()
    const { rateLimitError, clearRateLimitError, checkForRateLimitError } = useRateLimit()
    const { data: session } = useSession()
    const memory = useMemory()
    const { showOnboarding, closeOnboarding } = useOnboarding()

    const mainRef = useViewportHeight()

    const [vtopDisclaimer, setVtopDisclaimer] = useState<{
      toolCallId: string
      command: string
      message: string
    } | null>(null)

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
      currentChatIdRef.current = optimisticChatId || chatId
    }, [optimisticChatId, chatId])

    useEffect(() => {
      const loadPreferences = async () => {
        if (!session?.user?.email) return
        try {
          const response = await fetch('/api/user/preferences')
          if (response.ok) {
            const data = await response.json()
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

    const ensureClientChatId = (titleSeed?: string) => {
      if (!optimisticChatId && !chatId) {
        const newId = makeClientId()
        setOptimisticChatId(newId)
        currentChatIdRef.current = newId
        if (!chatCreatedEventDispatched) {
          setChatCreatedEventDispatched(true)
          const chatPath = `/chat/${newId}`
          // Avoid full Next.js navigation here to prevent unmounting during first send
          // and losing the in-flight stream. Update URL softly for bookmarking.
          try { window.history.replaceState({}, '', chatPath) } catch {}
          window.dispatchEvent(
            new CustomEvent('newChatCreated', {
              detail: {
                id: newId,
                title: extractTitleFromContent(titleSeed || 'New Chat'),
                path: chatPath,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            })
          )
        }
        return newId
      }
      // If we already have a chatId (seeded from server) but URL is '/', reflect it now
      const id = optimisticChatId || chatId!
      try {
        const desired = `/chat/${id}`
        if (typeof window !== 'undefined' && window.location.pathname !== desired) {
          window.history.replaceState({}, '', desired)
          if (!chatCreatedEventDispatched) {
            setChatCreatedEventDispatched(true)
            window.dispatchEvent(
              new CustomEvent('newChatCreated', {
                detail: {
                  id,
                  title: extractTitleFromContent(titleSeed || 'New Chat'),
                  path: desired,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              })
            )
          }
        }
      } catch {}
      return id
    }

    const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!input.trim()) return

      try {
        setShowFollowUpSuggestions(false)
        setLastUserMessage(input)

        if (!showFullChat) {
          setShowFullChat(true)
        }

        const id = ensureClientChatId(input)

        setErrorMessage(null)
        clearRateLimitError()
        sendMessage(
          { text: input },
          {
            body: {
              ...(id ? { id } : {}),
              ...(selectedTool ? { preferredTool: selectedTool } : {}),
            },
          }
        )
        setInput('')
      } catch (error) {
        console.error('Error submitting message:', error)
        setErrorMessage('Failed to send message. Please try again.')
      }
    }

    const [input, setInput] = useState('')

    const {
      messages = [],
      sendMessage,
      regenerate,
      status,
      addToolResult,
      stop,
      setMessages,
      error,
    } = useChat({
      transport: new DefaultChatTransport({
        api: '/api/chat',
      }),
      id: optimisticChatId || chatId,

      onFinish: ({ message }: { message: AIMessage }) => {
        const currentChatId = currentChatIdRef.current

        const asstText = getTextFromMessage(message as any)
        if ((message as any).role === 'assistant' && asstText) {
          setLastAssistantMessage(asstText)
          if (userPreferences.followUpSuggestions !== false) {
            setShowFollowUpSuggestions(true)
          }
        }

        if (currentChatId && isFirstMessageInNewChat) {
          setIsFirstMessageInNewChat(false)
        }
      },

      onError: (err: any) => {
        const errorMessage = err.message || err.toString()
        const hasResponseBody = typeof err === 'object' && err !== null && 'responseBody' in err
        const responseBody = hasResponseBody ? (err as any).responseBody : ''

        const isGeminiStreamingError =
          errorMessage.includes('contents.parts must not be empty') ||
          errorMessage.includes('INVALID_ARGUMENT') ||
          errorMessage.includes('GenerateContentRequest.contents') ||
          errorMessage.includes('streamGenerateContent') ||
          (typeof responseBody === 'string' && responseBody.includes('contents.parts must not be empty'))

        const isRateLimit = checkForRateLimitError(err)
        if (!isRateLimit && !isGeminiStreamingError) {
          toast.error('Something went wrong. Please try again.')
        }
      },
    })

    useEffect(() => {
      if (Array.isArray(initialMessages) && initialMessages.length) {
        setMessages(initialMessages as any)
        setShowFullChat(true)
      }
      if (chatId) {
        setOptimisticChatId(chatId)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatId])

    const isLoading = status === 'streaming'

    // computed loading status used in multiple places
    const computedIsLoading = useMemo(
      () => String(status) === 'loading' || String(status) === 'submitted' || vtopLoading,
      [status, vtopLoading]
    )

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

    // Guarded: reflect isLoading->autoScrollEnabled without redundant flips
    useEffect(() => {
      setAutoScrollEnabled(prev => (prev !== !isLoading ? !isLoading : prev))
    }, [isLoading])

    // Only set "at bottom" when it actually changes
    useEffect(() => {
      if (messages.length > 0 && showFullChat) {
        const container = contentRef.current?.parentElement
        if (container) {
          container.scrollTop = container.scrollHeight
        } else if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' })
        }
        if (!isAtBottom) setIsAtBottom(true)
      }
    }, [messages.length, showFullChat, isAtBottom])

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

    const derivedHasUser = useMemo(() => messages.some(m => m.role === 'user'), [
      messages.length,
      messages[messages.length - 1]?.role,
    ])
    const derivedIsEmpty = useMemo(() => messages.length === 0, [messages.length])

    useEffect(() => {
      setHasUserInitiatedConversation(prev => (prev !== derivedHasUser ? derivedHasUser : prev))
      setIsFirstMessageInNewChat(prev => (prev !== derivedIsEmpty ? derivedIsEmpty : prev))
    }, [derivedHasUser, derivedIsEmpty])

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

    // Prevent repeated handling of the same error causing render loops
    const lastProcessedErrorRef = useRef<string | null>(null)
    useEffect(() => {
      if (!error) return

      const msg = (error as any).message || String(error)
      const hasResponseBody = typeof error === 'object' && error !== null && 'responseBody' in (error as any)
      const responseBody = hasResponseBody ? (error as any).responseBody : ''
      const key = `${msg}|${typeof responseBody === 'string' ? responseBody.slice(0, 128) : ''}`
      if (lastProcessedErrorRef.current === key) return
      lastProcessedErrorRef.current = key

      const isGeminiStreamingError =
        msg.includes('contents.parts must not be empty') ||
        msg.includes('INVALID_ARGUMENT') ||
        msg.includes('GenerateContentRequest') ||
        (typeof responseBody === 'string' && responseBody.includes('contents.parts must not be empty'))

      if (isGeminiStreamingError) {
        setErrorMessage('An error occurred. Please start a new chat.')
        setMessages(prev =>
          prev.map((m: any, idx: number) => {
            if (idx !== prev.length - 1 || m.role !== 'assistant') return m
            if (m.error === 'streaming_error' && (!m.parts || m.parts.length === 0)) return m
            return { ...m, parts: [], error: 'streaming_error' }
          })
        )
        return
      }

      const isRateLimit = checkForRateLimitError(error)
      try {
        // eslint-disable-next-line no-console
        console.debug('[Chat] error effect - isRateLimit:', isRateLimit, 'error:', error)
      } catch {}
      if (isRateLimit) return
    }, [error, checkForRateLimitError, setMessages])

    const handleSuggestedQuestion = useCallback(
      async (question: string) => {
        setInput('')
        setShowFollowUpSuggestions(false)
        setLastUserMessage(question)

        if (!showFullChat) {
          setShowFullChat(true)
          setIsFirstMessageInNewChat(true)
        }
        const id = ensureClientChatId(question)

        setErrorMessage(null)
        clearRateLimitError()
        setHasUserInitiatedConversation(true)

        await sendMessage(
          { text: question },
          { body: { ...(id ? { id } : {}) } }
        )
      },
      [
        showFullChat,
        clearRateLimitError,
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
        router.push('/')
        setMessages([])
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
    }

    // STABILIZED CALLBACKS
    const createCanvasFromMessage = useCallback((_content: string) => {
      setHubOpen(true)
    }, [])

    const handleLoginClick = useCallback(() => {
      const triggerEvent = new CustomEvent('vtopLoginTrigger', {
        detail: { command: 'attendance' },
      })
      window.dispatchEvent(triggerEvent)
    }, [])

    const handlePlacementSearch = useCallback(
      (company: string) => {
        const id = ensureClientChatId(`Get placement information for ${company}`)
        sendMessage(
          { text: `Get placement information for ${company}` },
          { body: { ...(id ? { id } : {}) } }
        )
      },
      // deliberately only depend on sendMessage to keep identity stable
      [sendMessage]
    )

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
        clearToolResult(toolCallId || '')

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

        setMessages((prev: any[]) => {
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
              parts: [],
              toolInvocations: [toolInvocationPayload],
            })
          }
          return base
        })

        const id = ensureClientChatId()

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messages,
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
            id: chatId || optimisticChatId || id,
          }),
        })

        if (response.ok) {
          const responseText = await response.text()

          function parseVTOPResponse(raw: string) {
            if (!raw || typeof raw !== 'string') throw new Error('Empty response')
            const trimmed = raw.trim()
            if (/^[\[{]/.test(trimmed)) {
              try {
                return JSON.parse(trimmed)
              } catch {}
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
              const line = lines[i]
              const m = line.match(frameHeader)
              if (m) {
                flush()
                current = { prefix: m[1], payload: m[2] ?? '' }
                if (i < lines.length - 1) current.payload += '\n'
              } else {
                if (current) current.payload += line + (i < lines.length - 1 ? '\n' : '')
              }
            }
            flush()

            const safeParseJSON = (s: string) => {
              const t = s.trim()
              if (!/^[\[{]/.test(t)) throw new Error('Not JSON')
              try {
                return JSON.parse(t)
              } catch {
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
                  return JSON.parse(t)
                } catch {}
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
                } catch {}
              } else if (f.prefix === '0') {
                textChunks.push(decodePossibleJSONString(payload))
              }
            }

            const chosen =
              [...toolFrames].reverse().find(x => x && typeof x === 'object' && 'result' in x) ??
              [...toolFrames].reverse().find(x => x)

            if (chosen && chosen.result !== undefined) {
              return { result: chosen.result }
            }
            if (chosen) return { result: chosen }
            if (textChunks.length) return { result: { success: true, output: textChunks.join('\n') } }
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
          const updatedMessages = messages.map((message: any) => {
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
                    if (part.type === 'tool-call' && part.toolCallId === toolCallId) {
                      return { ...part, state: 'result', output: result.result }
                    }
                    if (part.type === 'tool-result' && part.toolCallId === toolCallId) {
                      return { ...part, result: result.result }
                    }
                    if (part.type?.startsWith?.('tool-') && part.toolCallId === toolCallId) {
                      return { ...part, state: 'result', output: result.result }
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
          setMessages([...updatedMessages])

          try {
            const formattedContent =
              (result.result && (result.result.formatted_content || result.result.summary)) || ''
            if (formattedContent) {
              setMessages((prev: any[]) => {
                const idx = prev.findIndex(
                  m =>
                    m.role === 'assistant' &&
                    m.toolInvocations?.some((t: any) => t.toolCallId === toolCallId)
                )
                if (idx !== -1) {
                  const clone = [...prev]
                  const target = clone[idx]
                  const targetText = getTextFromMessage(target)
                  if (!targetText || targetText.trim() === '') {
                    clone[idx] = {
                      ...target,
                      parts: [{ type: 'text', text: formattedContent }],
                    }
                  } else if (!targetText.includes(formattedContent.slice(0, 30))) {
                    clone[idx] = {
                      ...target,
                      parts: [
                        ...(target.parts || []),
                        { type: 'text', text: `\n\n${formattedContent}`.trim() },
                      ],
                    }
                  }
                  return clone
                }
                const newAssistantMsg = {
                  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  role: 'assistant',
                  parts: [{ type: 'text', text: formattedContent }],
                  toolInvocations: [
                    {
                      toolCallId: toolCallId,
                      toolName: 'queryVTOP',
                      args: { command },
                      result: result.result,
                      state: 'result',
                    },
                  ],
                } as any
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
            result.result &&
            result.result.success !== false &&
            (result.result.data || result.result.output)
          ) {
            // Skip server refresh; rely on current streaming state
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
      if (chatId || optimisticChatId) {
        window.scrollTo(0, 0)
        setTimeout(() => {
          window.scrollTo(0, 0)
        }, 100)
      }
    }, [chatId, optimisticChatId])

    useEffect(() => {
      if (chatId || optimisticChatId) {
        const forceScrollToTop = () => {
          window.scrollTo(0, 0)
        }
        forceScrollToTop()
        const timeoutId = setTimeout(forceScrollToTop, 50)
        return () => {
          clearTimeout(timeoutId)
        }
      }
    }, [chatId, optimisticChatId])

    useEffect(() => {
      if (showFullChat && isMobile && isFirstMessageInNewChat) {
        setTimeout(() => {
          window.scrollTo(0, 0)
        }, 50)
      }
    }, [showFullChat, isMobile, isFirstMessageInNewChat])

    useEffect(() => {
      if (!chatId && !optimisticChatId) {
        setChatCreatedEventDispatched(false)
      }
    }, [chatId, optimisticChatId])

    useEffect(() => {
      if (messages && messages.length > 0) {
        const lastMessage = messages[messages.length - 1] as any
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

    // ---------- MEMOIZED toolParts so it doesn't change every render ----------
    const lastMessageAny = messages.length ? (messages[messages.length - 1] as any) : undefined
    const toolParts = useMemo(() => {
      const parts = lastMessageAny?.parts ?? []
      return parts.filter(
        (p: any) =>
          typeof p?.type === 'string' &&
          (p.type === 'tool-call' || p.type === 'tool-result' || p.type.startsWith('tool-'))
      )
    }, [lastMessageAny])
    // -------------------------------------------------------------------------

    if (!showFullChat) {
      return (
        <VTOPToolHandler toolParts={toolParts} onCredentialsSubmit={handleVTOPCredentials}>
          <UpsellBanner />
          <OnboardingDialog isOpen={showOnboarding} onClose={closeOnboarding} />
          <Hub
            isOpen={hubOpen}
            onClose={() => {
              setHubOpen(false)
            }}
          />
          <div className="flex flex-col h-[100dvh] bg-transparent text-foreground relative overflow-hidden mobile-viewport-fix">
            <div className="relative z-10 flex flex-col h-full">
              <header className="flex-shrink-0 sticky top-0 z-40">
                <div className="flex h-14 items-center px-4 gap-2">
                  <HamburgerButton onClick={toggleSidebar} className="md:hidden" />
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
                    selectedTool={selectedTool}
                    placeholder="ask anything..."
                  />
                </motion.div>

                <div className="w-full max-w-5xl flex justify-center -mt-3">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
                  >
                    <button
                      onClick={() => setHubOpen(true)}
                      aria-label="Open hub"
                      className="hub-gradient-btn"
                      style={{ minWidth: '320px', paddingLeft: '32px', paddingRight: '32px' }}
                    >
                      <span className="hub-gradient-inner">
                        <GraduationCap className="h-4 w-4 mr-2" />
                        <span>hub</span>
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
                      background: linear-gradient(
                        90deg,
                        #6ee7f9,
                        #a78bfa,
                        #f472b6,
                        #f59e0b,
                        #6ee7f9
                      );
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
                  isLoading={computedIsLoading}
                  status={status}
                  showForFirstMessage
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
    }

    return (
      <VTOPToolHandler toolParts={toolParts} onCredentialsSubmit={handleVTOPCredentials}>
        <UpsellBanner />
        <OnboardingDialog isOpen={showOnboarding} onClose={closeOnboarding} />
        <Hub
          isOpen={hubOpen}
          onClose={() => {
            setHubOpen(false)
          }}
        />
        <div
          ref={mainRef}
          className="flex flex-col h-[calc(var(--vh,1vh)*100)] bg-transparent text-foreground overflow-hidden mobile-viewport-fix"
          style={{
            height: 'var(--app-height, 100vh)',
            position: 'relative',
            width: '100%',
          }}
        >
          <header
            className={cn(
              'flex-shrink-0 sticky top-0 z-40 bg-black/20 backdrop-blur-sm border-b border-border/50 chat-page-header',
              isMobile && 'mobile-header-sticky'
            )}
          >
            <div className="flex h-14 items-center px-4 gap-2">
              <HamburgerButton onClick={toggleSidebar} className="md:block" />
              <Button
                variant="ghost"
                onClick={() => {
                  if (window.location.pathname !== '/') {
                    router.replace('/')
                    setMessages([])
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
              {canInstall && !isInstalled && (
                <Button
                  variant="ghost"
                  className="h-9 ml-2 hidden md:inline-flex"
                >
                  <Download className="h-4 w-4 mr-2" />
                  install app
                </Button>
              )}
              {canInstall && !isInstalled && (
                <Button
                  variant="ghost"
                  className="h-9 ml-2 md:hidden"
                >
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
          </header>
          <div className="flex-1 relative overflow-hidden">
            <div
              className={cn(
                'absolute inset-0 overflow-y-auto chat-content',
                isMobile && 'mobile-chat-container',
                isMobile && isFirstMessageInNewChat && 'mobile-prevent-auto-scroll'
              )}
            >
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
                <RateLimitErrorDisplay />
                {/* Optional vtop disclaimer block is intentionally kept commented out */}
                <VirtualizedMessages
                  messages={messages}
                  chatId={optimisticChatId}
                  isLoading={isLoading}
                  onCreateCanvas={createCanvasFromMessage}
                  onLoginClick={handleLoginClick}
                  onPlacementSearch={handlePlacementSearch}
                  maximizedItem={maximizedArtifact}
                  setMaximizedItem={setMaximizedArtifact}
                />
                <DynamicLoadingIndicator
                  messages={messages}
                  isLoading={computedIsLoading}
                  status={status}
                />
                <div ref={messagesEndRef} className={isLoading ? 'h-20' : 'h-0'} aria-hidden="true" />
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
                  selectedTool={selectedTool}
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
)

export const ChatInterface = memo(
  ({ chatId, autoResume = true, initialMessages = [] }: ChatInterfaceProps) => {
    return (
      <RateLimitProvider>
        <VTOPProvider>
          <PureChatInterface chatId={chatId} autoResume={autoResume} initialMessages={initialMessages} />
        </VTOPProvider>
      </RateLimitProvider>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.chatId === nextProps.chatId &&
      prevProps.autoResume === nextProps.autoResume &&
      prevProps.initialMessages === nextProps.initialMessages
    )
  }
)
