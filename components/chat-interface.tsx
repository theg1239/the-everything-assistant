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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const [optimisticChatId, setOptimisticChatId] = useState<string | undefined>(chatId)
  const { updateToolResult } = useVTOP()

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
    // Mark initial render as complete after first render
    if (isInitialRender) {
      setIsInitialRender(false)
    }  }, [isInitialRender])
  
  useEffect(() => {
    // Only auto-scroll when user is actively typing and sending messages
    // This prevents auto-scrolling on initial page load
    if (!isInitialRender && messages.length > 0 && messages[messages.length - 1].role === 'user') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading, isInitialRender])

  // Add auto-scroll during message streaming
  useEffect(() => {
    // Auto-scroll during message streaming (when AI is responding)
    if (!isInitialRender && messages.length > 0 && isLoading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading, isInitialRender])

  // Create an auto-scroll function to monitor streaming content
  const contentRef = useRef<HTMLDivElement | null>(null)
  
  useEffect(() => {
    // Auto-scroll during streaming by monitoring content changes
    if (isLoading && !isInitialRender) {
      // Set up a mutation observer to watch for content changes
      const targetNode = contentRef.current
      if (!targetNode) return
      
      // Create a mutation observer to detect new content
      const observer = new MutationObserver(() => {
        // Scroll to the end when content changes
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
      
      // Start observing the target node for content changes
      observer.observe(targetNode, { 
        childList: true, 
        subtree: true, 
        characterData: true,
        attributes: false
      })
      
      // Clean up observer on effect cleanup
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
                toolCallId: toolCallId, // Ensure toolCallId is set
                state: 'call', // Set to loading state
                result: undefined, // Clear the credentials required result
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
          messages: [
            ...messages,
            {
              id: Date.now().toString(),
              role: 'user',
              content: `show me my vtop ${command}`,
            },
          ],
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

  // Add an effect to scroll to top when a chat page is first loaded
  useEffect(() => {
    if (chatId || optimisticChatId) {
      // This is a chat page, so scroll to top
      window.scrollTo(0, 0)
      
      // Also use setTimeout to ensure browser has time to render
      setTimeout(() => {
        window.scrollTo(0, 0)
      }, 100)
    }
  }, [chatId, optimisticChatId])  // Override auto-scrolling to preserve header visibility
  useEffect(() => {
    if (chatId || optimisticChatId) {
      // Create a function to manually force scroll to top
      const forceScrollToTop = () => {
        window.scrollTo(0, 0);
      };
      
      // Execute it on mount
      forceScrollToTop();
      
      // And after a delay to ensure rendering is complete
      const timeoutId = setTimeout(forceScrollToTop, 100);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [chatId, optimisticChatId]);

  if (!showFullChat) {
    return (      <VTOPToolHandler
        toolInvocations={messages[messages.length - 1]?.toolInvocations}
        onCredentialsSubmit={handleVTOPCredentials}
      >
        <ResearchPreviewModal />
        <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex flex-col h-[100dvh] bg-background text-foreground relative overflow-hidden mobile-viewport-fix">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
          <div className="relative z-10 flex flex-col h-full">
            <header className="flex-shrink-0 sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
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
                  placeholder="ask me for past papers..."
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
        }      />      <div className="flex flex-col h-[100dvh] bg-background text-foreground mobile-viewport-fix overflow-hidden">
        <header className="flex-shrink-0 fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-b border-border chat-page-header">
          <div className="flex h-14 items-center px-4 gap-2">
            <HamburgerButton onClick={() => setSidebarOpen(!sidebarOpen)} className="md:block" />
            <Button
              variant="outline"
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
        </header><div className="flex-1 relative overflow-hidden pt-1">          <div className="absolute inset-0 overflow-y-auto pb-[120px] md:pb-[100px] overflow-fix chat-content">
            <div ref={contentRef} className="max-w-3xl mx-auto px-4 py-4 space-y-4 pt-5">
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
                  </motion.div>                )}
              <div 
                ref={messagesEndRef} 
                className={isLoading ? "h-20" : "h-0"} 
                aria-hidden="true" 
              />
            </div>
          </div>
        </div>
        
        <ScrollToTopButton />
          <div className="flex-shrink-0 border-t border-border bg-background/95 backdrop-blur fixed bottom-0 left-0 right-0 z-30 mobile-pb-fix input-area">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <MultimodalInput
              input={input}
              setInput={setInput}
              handleSubmit={handleFormSubmit}
              isLoading={isLoading}
              placeholder="continue the conversation..."
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
