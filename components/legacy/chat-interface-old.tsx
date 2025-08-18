'use client'

import { useState, useRef, useEffect, memo } from 'react'
import { useChat } from 'ai/react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, ArrowLeft, FileText, ChevronRight, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SuggestedQuestions } from '@/components/suggested-questions'
import { ChatHeader } from '@/components/chat/header'
import { MessageBubble } from '@/components/chat/message-bubble'
import { MultimodalInput } from '@/components/multimodal-input'
import { Sidebar } from '@/components/navigation/sidebar'
import { Canvas } from '@/components/graphics/canvas'
import React from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface ChatInterfaceProps {
  initialMessages?: any[]
  chatId?: string
}

const PureChatInterface = ({ initialMessages = [], chatId }: ChatInterfaceProps) => {
  const [showFullChat, setShowFullChat] = useState(initialMessages.length > 0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const [optimisticChatId, setOptimisticChatId] = useState<string | undefined>(chatId)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedSidebarState = localStorage.getItem('sidebarOpen')
    if (savedSidebarState !== null) {
      setSidebarOpen(savedSidebarState === 'true')
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('sidebarOpen', String(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('sidebar-open')
    } else {
      document.body.classList.remove('sidebar-open')
    }
    return () => {
      document.body.classList.remove('sidebar-open')
    }
  }, [sidebarOpen])

  useEffect(() => {
    if (showFullChat && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showFullChat])
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, error, stop } =
    useChat({
      api: '/api/chat',
      initialMessages: initialMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        toolInvocations: msg.toolInvocations,
      })),
      body: optimisticChatId ? { id: optimisticChatId } : chatId ? { id: chatId } : undefined,
      onResponse: response => {
        if (!showFullChat) {
          setShowFullChat(true)
        }
        setErrorMessage(null)
        const newChatId = response.headers.get('X-Chat-Id')
        const newChatPath = response.headers.get('X-Chat-Path')
        if (newChatId && newChatPath && !chatId) {
          setOptimisticChatId(newChatId)
          window.history.replaceState({}, '', newChatPath)
        }
      },
      onError: error => {
        console.error('Chat error:', error)
        toast.error('Something went wrong. Please try again.')
        // setErrorMessage('something went wrong. please try again.')
      },
    })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (error) {
      setErrorMessage('unable to connect. please check your connection and try again.')
    }
  }, [error])

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (input.trim()) {
      if (!showFullChat) {
        setShowFullChat(true)
      }
      setErrorMessage(null)
      handleSubmit(e)
    }
  }

  const handleSuggestedQuestion = (question: string) => {
    setInput(question)
    if (!showFullChat) {
      setShowFullChat(true)
    }
    setErrorMessage(null)

    setTimeout(() => {
      const form = document.createElement('form')
      const event = new Event('submit', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'target', { value: form, enumerable: true })
      Object.defineProperty(event, 'preventDefault', { value: () => {}, enumerable: true })
      handleSubmit(event as any)
    }, 100)
  }

  const resetToHome = () => {
    router.push('/')
  }

  const openCanvas = () => {
    setCanvasOpen(true)
  }

  useEffect(() => {
    if (optimisticChatId && optimisticChatId !== chatId) {
      setShowFullChat(true)
      setErrorMessage(null)
      setInput('')
    }
  }, [optimisticChatId, chatId])

  const SidebarToggleButton = () =>
    !sidebarOpen && (
      <motion.button
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        onClick={() => setSidebarOpen(true)}
        className="sidebar-toggle-collapsed md:flex hidden"
        aria-label="Open sidebar"
      >
        <ChevronRight className="w-5 h-5" />
      </motion.button>
    )

  const chatContainerClasses =
    'chat-container h-full flex flex-col justify-between max-w-5xl w-full mx-auto px-4'

  if (!showFullChat) {
    return (
      <>
        <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
        <SidebarToggleButton />

        <motion.div initial={{ opacity: 1 }} className={chatContainerClasses} key="home-view">
          <div className="flex items-center justify-between py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="text-slate-400 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>

          <ChatHeader />

          <div className="mt-8">
            <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="text-center space-y-6"
              >
                <div className="space-y-3">
                  <h1 className="text-5xl font-extralight text-white tracking-wide">
                    vit assistant
                  </h1>
                  <p className="text-slate-400 text-xl max-w-2xl mx-auto leading-relaxed">
                    comprehensive knowledge base for vit vellore - courses, exams, faculty,
                    placements, research, and everything you need to know
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
                className="w-full max-w-3xl"
              >
                <SearchBar
                  input={input}
                  handleInputChange={handleInputChange}
                  handleSubmit={handleFormSubmit}
                  isLoading={isLoading}
                  placeholder="ask anything about vit vellore..."
                  ref={inputRef}
                />
              </motion.div>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/20 border border-red-500/30 text-white rounded-xl p-4 text-center max-w-md"
                >
                  {errorMessage}
                </motion.div>
              )}

              <SuggestedQuestions
                isFirstMessage={true}
                onQuestionClick={handleSuggestedQuestion}
                sidebarOpen={sidebarOpen}
              />
            </div>
          </div>
        </motion.div>
      </>
    )
  }

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <Canvas isOpen={canvasOpen} onClose={() => setCanvasOpen(false)} chatId={optimisticChatId} />
      <SidebarToggleButton />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className={chatContainerClasses}
        key="chat-view"
      >
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-slate-700/30 bg-slate-800/80 backdrop-blur-xl rounded-t-3xl"
        >
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="text-slate-400 hover:text-white"
            >
              <Menu className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetToHome}
              className="text-slate-400 hover:text-white hover:bg-slate-700/30 rounded-xl"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              back to home
            </Button>
          </div>

          <div className="text-center">
            <h2 className="text-lg font-light text-white">vit assistant</h2>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={openCanvas}
            className="text-slate-400 hover:text-white"
          >
            <FileText className="w-4 h-4 mr-2" />
            canvas
          </Button>
        </motion.div>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="flex flex-col p-6 space-y-6 bg-slate-800/10 backdrop-blur-xl custom-scrollbar w-full">
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/20 border border-red-500/30 text-white rounded-xl p-4 text-center w-full mx-auto"
              >
                {errorMessage}
              </motion.div>
            )}

            <AnimatePresence>
              {messages.map((message, index) => (
                <MessageBubble
                  key={`${message.id}-${index}`}
                  message={{
                    ...message,
                    toolInvocations: message.toolInvocations,
                  }}
                  chatId={optimisticChatId}
                />
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center space-x-3 text-slate-400 w-full max-w-5xl mx-auto"
              >
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <div
                    className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"
                    style={{ animationDelay: '0.2s' }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
                    style={{ animationDelay: '0.4s' }}
                  ></div>
                </div>
                <span className="text-sm">thinking...</span>
              </motion.div>
            )}

            <div ref={messagesEndRef} />

            {!showFullChat && messages.length > 0 && messages.length < 4 && !isLoading && (
              <SuggestedQuestions
                isFirstMessage={false}
                onQuestionClick={handleSuggestedQuestion}
                sidebarOpen={sidebarOpen}
              />
            )}
          </div>
        </ScrollArea>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="sticky bottom-0 z-10 p-4 border-t border-slate-700/30 bg-slate-800/80 backdrop-blur-xl rounded-b-3xl mt-auto w-full"
        >
          <div className="w-full">
            <SearchBar
              input={input}
              handleInputChange={handleInputChange}
              handleSubmit={handleFormSubmit}
              isLoading={isLoading}
              placeholder="continue the conversation..."
              ref={inputRef}
            />
          </div>
        </motion.div>
      </motion.div>
    </>
  )
}

interface SearchBarProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  placeholder: string
}

const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(
  ({ input, handleInputChange, handleSubmit, isLoading, placeholder }, ref) => {
    return (
      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-3xl blur opacity-20 group-hover:opacity-30 transition duration-300 animated-gradient"></div>
        <div className="relative flex items-center bg-slate-800/40 backdrop-blur-xl border border-slate-700/30 rounded-3xl overflow-hidden">
          <Input
            ref={ref}
            value={input}
            onChange={handleInputChange}
            placeholder={placeholder}
            className="flex-1 bg-transparent border-0 text-white placeholder-slate-400 text-lg px-8 py-5 focus:ring-0 focus:outline-none focus:border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={isLoading}
            autoComplete="off"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="m-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0 rounded-2xl px-8 py-3 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </form>
    )
  }
)

SearchBar.displayName = 'SearchBar'
