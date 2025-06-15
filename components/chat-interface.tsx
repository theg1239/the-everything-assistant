'use client'

import { useState, useRef, useEffect, memo } from 'react'
import { useChat } from 'ai/react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Plus } from 'lucide-react'
import { HamburgerButton } from '@/components/hamburger-button'
import { Button } from '@/components/ui/button'
import { SuggestedQuestions } from '@/components/suggested-questions'
import { ChatHeader } from '@/components/chat-header'
import { MessageBubble } from '@/components/message-bubble'
import { MultimodalInput } from '@/components/multimodal-input'
import { Sidebar } from '@/components/sidebar'
import { Canvas } from '@/components/canvas'
import ResearchPreviewModal from '@/components/research-preview-modal'
import { VTOPToolHandler } from '@/components/vtop-tool-handler'
import { VTOPProvider, useVTOP } from '@/components/vtop-context'
import { toast } from 'sonner'
import ScrollToTopButton from '@/components/scroll-to-top-button'

const useViewportHeight = () => {
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01
      document.documentElement.style.setProperty('--vh', `${vh}px`)
      
      const viewport = window.visualViewport
      const height = viewport ? viewport.height : window.innerHeight
      document.documentElement.style.setProperty('--app-height', `${height}px`)
      
      if (mainRef.current) {
        mainRef.current.style.height = `calc(var(--vh, 1vh) * 100)`
      }
      
      if (window.innerWidth <= 768) {
        window.scrollTo(0, 0)
      }
    }

    setVh()
    window.addEventListener('resize', setVh)
    window.addEventListener('orientationchange', () => setTimeout(setVh, 100))
    
    return () => {
      window.removeEventListener('resize', setVh)
      window.removeEventListener('orientationchange', () => setTimeout(setVh, 100))
    }
  }, [])

  return mainRef
}

interface ChatInterfaceProps {
  initialMessages?: any[]
  chatId?: string
}

const PureChatInterface = ({ initialMessages = [], chatId }: ChatInterfaceProps) => {
  const [showFullChat, setShowFullChat] = useState(initialMessages.length > 0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [canvasContent, setCanvasContent] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hasUserInitiatedConversation, setHasUserInitiatedConversation] = useState(false)
  const [isInitialRender, setIsInitialRender] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const [optimisticChatId, setOptimisticChatId] = useState<string | undefined>(chatId)
  const { updateToolResult } = useVTOP()
  
  const mainRef = useViewportHeight()
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    if (window.innerWidth <= 768) {
      window.scrollTo(0, 0)
      document.body.style.overflow = 'hidden'
      
      return () => {
        window.removeEventListener('resize', checkMobile)
        document.body.style.overflow = ''
      }
    }
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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
    const hasUser = initialMessages.some(m => m.role === 'user')
    setHasUserInitiatedConversation(hasUser)
  }, [initialMessages])
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    isLoading,
    setInput,
    error,
    stop,
    append,
    setMessages,
    reload,
  } = useChat({
    api: '/api/chat',
    initialMessages: initialMessages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      toolInvocations: msg.toolInvocations,
    })),
    body: optimisticChatId ? { id: optimisticChatId } : chatId ? { id: chatId } : undefined,
    onResponse: res => {
      if (!showFullChat) setShowFullChat(true)
      setErrorMessage(null)
      const newId = res.headers.get('X-Chat-Id')
      const newPath = res.headers.get('X-Chat-Path')
      if (newId && newPath && !chatId) {
        setOptimisticChatId(newId)
        window.history.replaceState({}, '', newPath)
      }
    },
    onError: err => {
      console.error(err)
      toast.error('Something went wrong. Please try again.')
      setErrorMessage('Unable to connect. Please check your connection and try again.')
    },
  })
  
  useEffect(() => {
    if (isInitialRender) {
      setIsInitialRender(false)
      
      // Ensure header is visible on mobile after initial render
      if (isMobile) {
        setTimeout(() => {
          window.scrollTo(0, 0)
        }, 100)
      }
    }
  }, [isInitialRender, isMobile])
  useEffect(() => {
    if (!isInitialRender && messages.length > 0 && messages[messages.length - 1].role === 'user') {
      // On mobile, only scroll if user has initiated conversation to prevent header hiding
      if (!isMobile || hasUserInitiatedConversation) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [messages, isLoading, isInitialRender, isMobile, hasUserInitiatedConversation])

  useEffect(() => {
    if (!isInitialRender && messages.length > 0 && isLoading) {
      // On mobile, only scroll if user has initiated conversation
      if (!isMobile || hasUserInitiatedConversation) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [messages, isLoading, isInitialRender, isMobile, hasUserInitiatedConversation])

  useEffect(() => {
    if (isLoading && !isInitialRender) {
      const targetNode = contentRef.current
      if (!targetNode) return

      const observer = new MutationObserver(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      })

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
  }, [isLoading, isInitialRender])

  useEffect(() => {
    if (error) {
      setErrorMessage('Unable to connect. Please check your connection and try again.')
    }
  }, [error])

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return

    if (!showFullChat) setShowFullChat(true)
    setErrorMessage(null)
    setHasUserInitiatedConversation(true)
    originalHandleSubmit(e)
  }
  const handleSuggestedQuestion = async (question: string) => {
    setInput('')
    if (!showFullChat) setShowFullChat(true)
    setErrorMessage(null)
    setHasUserInitiatedConversation(true)

    await append({
      role: 'user',
      content: question,
    })
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
      //console.log('Handling VTOP credentials for toolCallId:', toolCallId, 'command:', command)
      const updatedMessagesForLoading = messages.map((message: any) => {
        if (message.toolInvocations) {
          const updatedToolInvocations = message.toolInvocations.map((toolInvocation: any) => {
            if (toolInvocation.toolCallId && toolInvocation.toolCallId === toolCallId) {
              //console.log('Clearing credentials state for toolCallId:', toolCallId)
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

      // const loadingToast = toast.loading(`Executing VTOP ${command} command...`)

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

      // toast.dismiss(loadingToast)

      if (response.ok) {
        const result = await response.json()

        console.log('VTOP credential submission result:', result)
        if (toolCallId) {
          updateToolResult(toolCallId, command, result.result)
        }
        const updatedMessages = messages.map((message: any) => {
          if (message.toolInvocations) {
            const updatedToolInvocations = message.toolInvocations.map((toolInvocation: any) => {
              if (toolInvocation.toolCallId && toolInvocation.toolCallId === toolCallId) {
                console.log(
                  'Updating tool invocation with result:',
                  result.result,
                  'for toolCallId:',
                  toolCallId
                )
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
                //console.warn('Failed to refresh conversation after VTOP data retrieval:', error)
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
          } else {
            // toast.error(`VTOP Error: ${errorMessage}`)
          }
        } else {
          // toast.success(`VTOP ${command} command executed successfully!`)
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

  if (!showFullChat) {
    return (
      <VTOPToolHandler
        toolInvocations={messages[messages.length - 1]?.toolInvocations}
        onCredentialsSubmit={handleVTOPCredentials}
      >
        <ResearchPreviewModal />
        <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex flex-col h-[100dvh] bg-background text-foreground relative overflow-hidden mobile-viewport-fix">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
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
                  placeholder="ask anything..."
                  stop={stop}
                />
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
      />{' '}      <div 
        ref={mainRef}
        className="flex flex-col h-[calc(var(--vh,1vh)*100)] bg-background text-foreground overflow-hidden"
        style={{ 
          height: 'var(--app-height, 100vh)',
          position: isMobile ? 'fixed' : 'relative',
          width: '100%',
          top: 0,
          left: 0
        }}
      ><header className="flex-shrink-0 fixed top-0 left-0 right-0 z-40 bg-background/95 border-b border-border chat-page-header">
          <div className="flex h-14 items-center px-4 gap-2" style={{ height: 'var(--header-height, 60px)' }}>
            <HamburgerButton onClick={() => setSidebarOpen(!sidebarOpen)} className="md:block" />
            <Button
              variant="ghost"
              onClick={() => {
                router.push('/')
                router.refresh()
              }}
              className="h-9"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Chat
            </Button>
            <Button variant="ghost" onClick={openCanvas} className="ml-auto h-9">
              <FileText className="h-4 w-4 mr-2" />
              Canvas
            </Button>
          </div>
        </header>        <div className="flex-1 relative overflow-hidden">
          <div className="absolute inset-0 overflow-y-auto chat-content">
            <div ref={contentRef} className="max-w-3xl mx-auto px-4 space-y-6 pt-5">
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 text-center"
                >
                  {errorMessage}
                </motion.div>
              )}{' '}
              <AnimatePresence>
                {messages.map((message, idx) => (
                  <MessageBubble
                    key={`${message.id}-${idx}`}
                    message={message}
                    chatId={optimisticChatId}
                    onCreateCanvas={createCanvasFromMessage}
                    onLoginClick={handleLoginClick}
                  />
                ))}
              </AnimatePresence>
              {isLoading &&
                messages.length > 0 &&
                messages[messages.length - 1].role === 'user' && (
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
        <ScrollToTopButton />{' '}        <div className="flex-shrink-0 fixed bottom-0 left-0 right-0 z-30 input-area">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, transparent, rgb(2, 6, 23) 50%)',
              borderTop: 'none',
            }}
          ></div>{' '}
          <div className="relative z-10">
            <MultimodalInput
              input={input}
              setInput={setInput}
              handleSubmit={handleFormSubmit}
              isLoading={isLoading}
              placeholder="ask anything..."
              stop={stop}
            />
          </div>
        </div>
      </div>
    </VTOPToolHandler>
  )
}

export const ChatInterface = memo(({ initialMessages = [], chatId }: ChatInterfaceProps) => {
  return (
    <VTOPProvider>
      <PureChatInterface initialMessages={initialMessages} chatId={chatId} />
    </VTOPProvider>
  )
})
