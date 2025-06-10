"use client"

import { useState, useRef, useEffect, memo } from "react"
import { useChat } from "ai/react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, FileText, Plus } from "lucide-react"
import { HamburgerButton } from "@/components/hamburger-button"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SuggestedQuestions } from "@/components/suggested-questions"
import { ChatHeader } from "@/components/chat-header"
import { MessageBubble } from "@/components/message-bubble"
import { MultimodalInput } from "@/components/multimodal-input"
import { Sidebar } from "@/components/sidebar"
import { Canvas } from "@/components/canvas"
import ResearchPreviewModal from "@/components/research-preview-modal"
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
  const [hasUserInitiatedConversation, setHasUserInitiatedConversation] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const [optimisticChatId, setOptimisticChatId] = useState<string | undefined>(chatId)

  // Persist sidebar state
  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = localStorage.getItem("sidebarOpen")
    if (saved !== null) setSidebarOpen(saved === "true")
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem("sidebarOpen", String(sidebarOpen))
  }, [sidebarOpen])

  useEffect(() => {
    const hasUser = initialMessages.some((m) => m.role === "user")
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
  } = useChat({
    api: "/api/chat",
    initialMessages: initialMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      toolInvocations: msg.toolInvocations,
    })),
    body: optimisticChatId
      ? { id: optimisticChatId }
      : chatId
      ? { id: chatId }
      : undefined,
    onResponse: (res) => {
      // make sure the full chat view is open
      if (!showFullChat) setShowFullChat(true)
      setErrorMessage(null)
      // grab new chatId & path headers
      const newId = res.headers.get("X-Chat-Id")
      const newPath = res.headers.get("X-Chat-Path")
      if (newId && newPath && !chatId) {
        setOptimisticChatId(newId)
        window.history.replaceState({}, "", newPath)
      }
    },
    onError: (err) => {
      console.error(err)
      toast.error("Something went wrong. Please try again.")
      setErrorMessage("Unable to connect. Please check your connection and try again.")
    },
  })

  // scroll as messages arrive or loading state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  // If there's a connectivity error
  useEffect(() => {
    if (error) {
      setErrorMessage("Unable to connect. Please check your connection and try again.")
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

  const handleSuggestedQuestion = (question: string) => {
    setInput(question)
    if (!showFullChat) setShowFullChat(true)
    setErrorMessage(null)
    setHasUserInitiatedConversation(true)

    // submit after a tiny delay so the input state settles
    setTimeout(() => {
      const form = document.createElement("form")
      const event = new Event("submit", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "target", { value: form, enumerable: true })
      Object.defineProperty(event, "preventDefault", { value: () => {}, enumerable: true })
      originalHandleSubmit(event as any)
    }, 100)
  }

  const resetToHome = () => {
    router.push("/")
  }
  const openCanvas = () => {
    setCanvasOpen(true)
  }
  const createCanvasFromMessage = (content: string) => {
    setCanvasContent(content)
    setCanvasOpen(true)
  }
  // first‐message UI
  if (!showFullChat) {
    return (
      <>
        <ResearchPreviewModal />
        <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex flex-col h-screen bg-background text-foreground relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
          <div className="relative z-10 flex flex-col h-full">
            <header className="flex-shrink-0 sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
              <div className="flex h-14 items-center px-4 gap-2">
                <HamburgerButton onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden" />
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
              </motion.div>              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 text-center max-w-md"
                >
                  {errorMessage}
                </motion.div>
              )}              {/* Show thinking indicator only when waiting for the first response */}
              {isLoading && input.trim() !== "" && (
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
              <SuggestedQuestions
                isFirstMessage={true}
                onQuestionClick={handleSuggestedQuestion}
                sidebarOpen={sidebarOpen}
              />
            </div>
          </div>
        </div>
      </>
    )  }

  // full‐chat UI
  return (
    <>
      <ResearchPreviewModal />
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <Canvas
        isOpen={canvasOpen}
        onClose={() => {
          setCanvasOpen(false)
          setCanvasContent("")
        }}
        chatId={optimisticChatId}
        initialDocument={
          canvasContent
            ? {
                title: "New Document",
                content: canvasContent,
                type: "document",
              }
            : undefined
        }      />

      <div className="flex flex-col h-screen bg-background text-foreground">
        <header className="flex-shrink-0 sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex h-14 items-center px-4 gap-2">
            <HamburgerButton onClick={() => setSidebarOpen(!sidebarOpen)} />
            <Button
              variant="outline"
              onClick={() => {
                router.push("/")
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
        </header>

        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-4 space-y-4 pb-10">
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
                {messages.map((message, idx) => (
                  <MessageBubble
                    key={`${message.id}-${idx}`}
                    message={message}
                    chatId={optimisticChatId}
                    onCreateCanvas={createCanvasFromMessage}
                  />
                ))}
              </AnimatePresence>              {/* Show "thinking..." indicator only when waiting for the first response */}
              {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
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

        <div className="flex-shrink-0 border-t border-border bg-background/95 backdrop-blur">
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
    </>
  )
}

export const ChatInterface = memo(PureChatInterface)
