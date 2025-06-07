"use client"

import { useState, useRef, useEffect, memo } from "react"
import { useChat } from "ai/react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Menu, ArrowLeft, FileText, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SuggestedQuestions } from "@/components/suggested-questions"
import { ChatHeader } from "@/components/chat-header"
import { MessageBubble } from "@/components/message-bubble"
import { MultimodalInput } from "@/components/multimodal-input"
import { Sidebar } from "@/components/sidebar"
import { Canvas } from "@/components/canvas"
import React from "react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface ChatInterfaceProps {
  initialMessages?: any[]
  chatId?: string
}

const PureChatInterface = ({ initialMessages = [], chatId }: ChatInterfaceProps) => {
  const [showFullChat, setShowFullChat] = useState(initialMessages.length > 0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [canvasContent, setCanvasContent] = useState<string>("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  
  const [optimisticChatId, setOptimisticChatId] = useState<string | undefined>(chatId)

  useEffect(() => {
    if (typeof window === "undefined") return
    const savedSidebarState = localStorage.getItem('sidebarOpen')
    if (savedSidebarState !== null) {
      setSidebarOpen(savedSidebarState === 'true')
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem('sidebarOpen', String(sidebarOpen))
  }, [sidebarOpen])

  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, error, stop } = useChat({
    api: "/api/chat",
    initialMessages: initialMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      toolInvocations: msg.toolInvocations,
    })),
    body: optimisticChatId ? { id: optimisticChatId } : chatId ? { id: chatId } : undefined,
    onResponse: (response) => {
      if (!showFullChat) {
        setShowFullChat(true)
      }
      setErrorMessage(null)
      const newChatId = response.headers.get("X-Chat-Id")
      const newChatPath = response.headers.get("X-Chat-Path")
      if (newChatId && newChatPath && !chatId) {
        setOptimisticChatId(newChatId)
        window.history.replaceState({}, '', newChatPath)
      }
    },
    onError: (error) => {
      console.error("Chat error:", error)
      toast.error("Something went wrong. Please try again.")
      setErrorMessage("something went wrong. please try again.")
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    if (error) {
      setErrorMessage("unable to connect. please check your connection and try again.")
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
      const form = document.createElement("form")
      const event = new Event("submit", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "target", { value: form, enumerable: true })
      Object.defineProperty(event, "preventDefault", { value: () => {}, enumerable: true })
      handleSubmit(event as any)
    }, 100)
  }

  const resetToHome = () => {
    router.push("/")
  }
  const openCanvas = () => {
    setCanvasOpen(true)
  }
  const createCanvasFromMessage = (content: string) => {
    // Create a new canvas document with the message content
    setCanvasContent(content)
    setCanvasOpen(true)
  }
  if (!showFullChat) {
    return (
      <>
        <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex flex-col h-screen bg-background text-foreground relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
          <div className="relative z-10 flex flex-col h-full">
            {/* Header with sidebar toggle */}
            <header className="flex-shrink-0 sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
              <div className="flex h-14 items-center px-4 gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(true)}
                  className="md:hidden h-9 w-9"
                >
                  <Menu className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="outline"
                  className="ml-auto md:ml-0 h-9"
                  onClick={() => {
                    router.push('/')
                    router.refresh()
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Chat
                </Button>
              </div>
            </header>

            <div className="flex-1 flex flex-col items-center justify-center px-4 space-y-8">
              <ChatHeader />

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
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

              <SuggestedQuestions 
                isFirstMessage={true} 
                onQuestionClick={handleSuggestedQuestion} 
                sidebarOpen={sidebarOpen} 
              />
            </div>
          </div>
        </div>
      </>
    )
  }
  return (
    <>
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <Canvas 
        isOpen={canvasOpen} 
        onClose={() => {
          setCanvasOpen(false)
          setCanvasContent("")
        }} 
        chatId={optimisticChatId}
        initialDocument={canvasContent ? {
          title: "New Document",
          content: canvasContent,
          type: "document"
        } : undefined}
      />
      
      <div className="flex flex-col h-screen bg-background text-foreground">
        {/* Header */}
        <header className="flex-shrink-0 sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
          <div className="flex h-14 items-center px-4 gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="h-9 w-9"
            >
              <Menu className="h-4 w-4" />
            </Button>
            
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

            <Button
              variant="ghost"
              onClick={openCanvas}
              className="ml-auto h-9"
            >
              <FileText className="h-4 w-4 mr-2" />
              Canvas
            </Button>
          </div>
        </header>

        {/* Messages Container */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-32">
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 text-center"
                >
                  {errorMessage}
                </motion.div>
              )}

              <AnimatePresence>
                {messages.map((message, index) => (                  <MessageBubble
                    key={`${message.id}-${index}`}
                    message={{
                      ...message,
                      toolInvocations: message.toolInvocations
                    }}
                    chatId={optimisticChatId}
                    onCreateCanvas={createCanvasFromMessage}
                  />
                ))}
              </AnimatePresence>

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center space-x-3 text-muted-foreground py-4"
                >
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                    <div
                      className="w-2 h-2 bg-primary rounded-full animate-pulse"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-primary rounded-full animate-pulse"
                      style={{ animationDelay: "0.4s" }}
                    ></div>
                  </div>
                  <span className="text-sm">thinking...</span>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="max-w-3xl mx-auto px-4 py-4">
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
    </>
  )
}

export const ChatInterface = memo(PureChatInterface)
