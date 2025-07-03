'use client'

import { useState, useRef, useEffect, memo, useCallback } from 'react'
import { useChat, type Message as AIMessage } from '@ai-sdk/react'
import type { ToolInvocation } from '@ai-sdk/ui-utils'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useMemory } from '@/contexts/memory-context'
import { VirtualizedMessages } from '@/components/virtualized-messages'
import { motion } from 'framer-motion'
import { FileText, Plus } from 'lucide-react'
import { HamburgerButton } from '@/components/hamburger-button'
import { Button } from '@/components/ui/button'
import { SuggestedQuestions } from '@/components/suggested-questions'
import { FollowUpSuggestions } from '@/components/follow-up-suggestions'
import { ChatHeader } from '@/components/chat-header'
import { MultimodalInput } from '@/components/multimodal-input'
import { Sidebar } from '@/components/sidebar'
import { Canvas } from '@/components/canvas'
import { extractTitleFromContent } from '@/lib/utils'
import ResearchPreviewModal from '@/components/research-preview-modal'
import { VTOPToolHandler } from '@/components/vtop-tool-handler'
import { VTOPProvider, useVTOP } from '@/contexts/vtop-context'
import { RateLimitProvider, useRateLimit } from '@/contexts/rate-limit-context'
import { RateLimitErrorDisplay } from '@/components/rate-limit-error-display'
import { OnboardingDialog } from '@/components/onboarding-dialog'
import { useOnboarding } from '@/hooks/use-onboarding'
import { toast } from 'sonner'
import ScrollToTopButton from '@/components/scroll-to-top-button'
import { cn } from '@/lib/utils'
import { useThrottle } from '@/hooks/use-debounce'
import { useAutoResume } from '@/hooks/use-auto-resume'

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
      }, 50)
    }

    const handleVisualViewportChange = () => setVh()

    setVh()
    window.addEventListener('resize', setVh, { passive: true })
    window.addEventListener('orientationchange', () => setTimeout(setVh, 100), { passive: true })
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportChange)
    }

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', setVh)
      window.removeEventListener('orientationchange', () => setTimeout(setVh, 100))
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportChange)
      }
    }
  }, [])

  return mainRef
}

import { MemoryWithId } from '@/hooks/use-memories'

interface Message extends AIMessage {
  metadata?: Record<string, any> & {
    memory?: boolean
    importance?: number
    tags?: string[]
  }
}

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

interface ChatInterfaceProps {
  initialMessages?: Message[]
  chatId?: string
  autoResume?: boolean
}

const PureChatInterface = ({
  initialMessages = [],
  chatId,
  autoResume = false,
}: ChatInterfaceProps) => {
  const [showFullChat, setShowFullChat] = useState(initialMessages.length > 0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [canvasContent, setCanvasContent] = useState<string>('')
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
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('sidebarOpen')
    if (saved !== null) setSidebarOpen(saved === 'true')
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('sidebarOpen', String(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    currentChatIdRef.current = optimisticChatId || chatId
  }, [optimisticChatId, chatId])
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
  
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return
    
    try {
      setShowFollowUpSuggestions(false)
      setLastUserMessage(input)
      
      if (!showFullChat) {
        setShowFullChat(true)
      }
      
      setErrorMessage(null)
      clearRateLimitError()
      originalHandleSubmit(e)
    } catch (error) {
      console.error('Error submitting message:', error)
      setErrorMessage('Failed to send message. Please try again.')
    }
  }

  const {
    messages = [],
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    isLoading,
    error,
    append,
    reload,
    stop,
    setMessages,
    setInput,
    experimental_resume,
    data
  } = useChat({
    api: '/api/chat',
    initialMessages: initialMessages,
    body: {
      ...(optimisticChatId ? { id: optimisticChatId } : chatId ? { id: chatId } : {}),
      ...(selectedTool ? { preferredTool: selectedTool } : {}),
    },
    onResponse: (res) => {
      if (!showFullChat) setShowFullChat(true)
      setErrorMessage(null)
      clearRateLimitError()
      const newId = res.headers.get('X-Chat-Id')
      const newPath = res.headers.get('X-Chat-Path')
      if (newId && newPath && !chatId && !chatCreatedEventDispatched) {
        setOptimisticChatId(newId)
        currentChatIdRef.current = newId
        setChatCreatedEventDispatched(true)
        router.push(newPath)
        window.history.replaceState({}, '', newPath)
        window.dispatchEvent(
          new CustomEvent('newChatCreated', {
            detail: {
              id: newId,
              title: extractTitleFromContent(messages[0]?.content || 'New Chat'),
              path: newPath,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          })
        )
      }
    },
    onFinish: message => {
      const currentChatId = currentChatIdRef.current
      if (message.role === 'assistant' && message.content) {
        setLastAssistantMessage(message.content)
        if (userPreferences.followUpSuggestions !== false) {
          setShowFollowUpSuggestions(true)
        }
      }
      if (currentChatId && isFirstMessageInNewChat) {
        setIsFirstMessageInNewChat(false)
        const checkTitleUpdate = async (attempt = 1, maxAttempts = 3) => {
          try {
            const response = await fetch(`/api/chats/${currentChatId}`)
            if (response.ok) {
              const chatData = await response.json()
              if (chatData.title && chatData.title !== 'New Chat') {
                window.dispatchEvent(
                  new CustomEvent('chatTitleUpdated', {
                    detail: { chatId: currentChatId, title: chatData.title },
                  })
                )
              } else if (attempt < maxAttempts) {
                setTimeout(() => checkTitleUpdate(attempt + 1, maxAttempts), 2000)
              }
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
      const isRateLimit = checkForRateLimitError(err)
      if (!isRateLimit) {
        toast.error('Something went wrong. Please try again.')
        // setErrorMessage('Unable to connect. Please check your connection and try again.')
      }
    },
  })

  useAutoResume({
    autoResume: autoResume ?? true,
    initialMessages,
    experimental_resume,
    data,
    setMessages,
  })

  const scrollToBottom = useCallback(() => {
    if (!messagesEndRef.current) return
    const container = contentRef.current?.parentElement
    const scrollBehavior: ScrollBehavior = isLoading ? 'auto' : 'smooth'
    if (container && isMobile) {
      container.scrollTo({ top: container.scrollHeight, behavior: scrollBehavior })
    } else {
      messagesEndRef.current.scrollIntoView({ behavior: scrollBehavior, block: 'end' })
    }
  }, [isMobile, isLoading])

  const throttledScrollToBottom = useThrottle(scrollToBottom, 100)

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
    if (!isInitialRender && messages.length > 0 && isLoading) {
      throttledScrollToBottom()
    }
  }, [messages, isLoading, isInitialRender, throttledScrollToBottom])

  useEffect(() => {
    if (isLoading && !isInitialRender) {
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
  }, [isLoading, isInitialRender, throttledScrollToBottom])

  useEffect(() => {
    if (isMobile && !isInitialRender && messages.length > 0) {
      const timeoutId = setTimeout(() => {
        throttledScrollToBottom()
      }, 200)

      return () => clearTimeout(timeoutId)
    }
  }, [messages.length, isMobile, isInitialRender, throttledScrollToBottom])

  useEffect(() => {
    if (error) {
      const isRateLimit = checkForRateLimitError(error)

      if (!isRateLimit) {
        // setErrorMessage('Unable to connect. Please check your connection and try again.')
      }
    }
  }, [error, checkForRateLimitError])

  const handleFormSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (!input.trim()) return

      setShowFollowUpSuggestions(false)
      setLastUserMessage(input.trim())

      if (!showFullChat) {
        setShowFullChat(true)
        setIsFirstMessageInNewChat(true)
      }
      setErrorMessage(null)
      clearRateLimitError()
      setHasUserInitiatedConversation(true)

      originalHandleSubmit(e)
    },
    [
      input,
      showFullChat,
      clearRateLimitError,
      originalHandleSubmit,
      setShowFollowUpSuggestions,
      setLastUserMessage,
      setErrorMessage,
      setHasUserInitiatedConversation,
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

      await append({
        role: 'user',
        content: question,
      })
    },
    [
      showFullChat,
      clearRateLimitError,
      setInput,
      append,
      setShowFollowUpSuggestions,
      setLastUserMessage,
      setErrorMessage,
      setHasUserInitiatedConversation,
    ]
  )

  const handleToolSelection = (toolId: string) => {
    setSelectedTool(toolId)
  }

  const resetToHome = () => {
    router.push('/')
  }

  const openCanvas = () => {
    setCanvasOpen(true)
  }
  const createCanvasFromMessage = (content: string) => {
    setCanvasContent(content)
    setCanvasOpen(true)
  }

  const handleLoginClick = () => {
    const triggerEvent = new CustomEvent('vtopLoginTrigger', {
      detail: { command: 'attendance' },
    })
    window.dispatchEvent(triggerEvent)
  }

  const handlePlacementSearch = (company: string) => {
    append({
      role: 'user',
      content: `Get placement information for ${company}`,
    })
  }

  const handleVTOPCredentials = async (
    credentials: { username: string; encryptedPassword: string },
    originalToolCall: any
  ) => {
    try {
      const command = originalToolCall?.args?.command || originalToolCall?.result?.command
      if (!command) {
        console.error('No command found in original tool call')
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

      setMessages([...updatedMessagesForLoading])

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
          id: chatId || optimisticChatId,
        }),
      })

      if (response.ok) {
        const result = await response.json()
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

        if (
          result.result &&
          result.result.success !== false &&
          (result.result.data || result.result.output)
        ) {
          if (chatId) {
            setTimeout(async () => {
              try {
                const refreshResponse = await fetch(`/api/chats/${chatId}`)
                if (refreshResponse.ok) {
                  const chatData = await refreshResponse.json()
                  if (chatData.messages) {
                    setMessages(chatData.messages)
                  }
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
      } else {
        toast.error('Failed to retrieve VTOP data. Please try again.')
      }
    } catch (error) {
      console.error('Error executing VTOP tool:', error)
      toast.error('An error occurred while retrieving VTOP data.')
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

      const timeoutId = setTimeout(forceScrollToTop, 100)

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

  if (!showFullChat) {
    return (
      <VTOPToolHandler
        toolInvocations={messages[messages.length - 1]?.toolInvocations}
        onCredentialsSubmit={handleVTOPCredentials}
      >
        <ResearchPreviewModal />
        <OnboardingDialog isOpen={showOnboarding} onClose={closeOnboarding} />
        <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />{' '}
        <div className="flex flex-col h-[100dvh] bg-transparent text-foreground relative overflow-hidden mobile-viewport-fix">
          <div className="relative z-10 flex flex-col h-full">
            <header className="flex-shrink-0 sticky top-0 z-40">
              <div className="flex h-14 items-center px-4 gap-2">
                <HamburgerButton
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="md:hidden"
                />
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
                />{' '}
              </motion.div>

              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 text-center max-w-md"
                >
                  {errorMessage}
                </motion.div>
              )}

              <RateLimitErrorDisplay />

              {isLoading && input.trim() !== '' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center space-x-3 text-muted-foreground py-4"
                >
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                    <div
                      className="w-2 h-2 bg-primary rounded-full animate-pulse"
                      style={{ animationDelay: '0.2s' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-primary rounded-full animate-pulse"
                      style={{ animationDelay: '0.4s' }}
                    ></div>
                  </div>
                  <span className="text-sm">thinking...</span>
                </motion.div>
              )}

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
    <VTOPToolHandler
      toolInvocations={messages[messages.length - 1]?.toolInvocations}
      onCredentialsSubmit={handleVTOPCredentials}
    >
      <ResearchPreviewModal />
      <OnboardingDialog isOpen={showOnboarding} onClose={closeOnboarding} />
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <Canvas
        isOpen={canvasOpen}
        onClose={() => {
          setCanvasOpen(false)
          setCanvasContent('')
        }}
        chatId={optimisticChatId}
        initialDocument={
          canvasContent
            ? {
                title: 'New Document',
                content: canvasContent,
                type: 'document',
              }
            : undefined
        }
      />{' '}
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
            <HamburgerButton onClick={() => setSidebarOpen(!sidebarOpen)} className="md:block" />
            <Button
              variant="ghost"
              onClick={() => {
                router.push('/')
              }}
              className="h-9"
            >
              <Plus className="h-4 w-4 mr-2" />
              new chat
            </Button>
            <Button variant="ghost" onClick={openCanvas} className="ml-auto h-9">
              <FileText className="h-4 w-4 mr-2" />
              canvas
            </Button>
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
                messages={messages}
                chatId={optimisticChatId}
                onCreateCanvas={createCanvasFromMessage}
                onLoginClick={handleLoginClick}
                onPlacementSearch={handlePlacementSearch}
                maximizedItem={maximizedArtifact}
                setMaximizedItem={setMaximizedArtifact}
              />
              {isLoading &&
                messages.length > 0 &&
                (() => {
                  const last = messages[messages.length - 1]
                  if (last.role === 'user') return true
                  if (last.role === 'assistant') {
                    const kbInv = last.toolInvocations?.find(
                      (t: any) => t.toolName === 'knowledgeBase'
                    )
                    if (kbInv && kbInv.state !== 'result') return true
                  }
                  return false
                })() && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center space-x-3 text-muted-foreground py-4"
                  >
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                      <div
                        className="w-2 h-2 bg-primary rounded-full animate-pulse"
                        style={{ animationDelay: '0.2s' }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-primary rounded-full animate-pulse"
                        style={{ animationDelay: '0.4s' }}
                      ></div>
                    </div>
                    <span className="text-sm">thinking...</span>
                  </motion.div>
                )}
              <div ref={messagesEndRef} className={isLoading ? 'h-20' : 'h-0'} aria-hidden="true" />
            </div>
          </div>
        </div>
        <ScrollToTopButton />{' '}
        <div
          className={cn(
            'flex-shrink-0 sticky bottom-0 z-30',
            isMobile ? 'input-area' : 'input-area'
          )}
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
          )}{' '}
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
    </VTOPToolHandler>
  )
}

export const ChatInterface = memo(
  ({ initialMessages = [], chatId, autoResume = true }: ChatInterfaceProps) => {
    return (
      <RateLimitProvider>
        <VTOPProvider>
          <PureChatInterface
            initialMessages={initialMessages}
            chatId={chatId}
            autoResume={autoResume}
          />
        </VTOPProvider>
      </RateLimitProvider>
    )
  }
)
