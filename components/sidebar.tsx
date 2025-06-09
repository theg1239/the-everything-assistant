"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MessageSquare, Plus, Settings, LogOut, Trash2, User, ChevronLeft } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/utils"

interface Chat {
  id: string
  title: string
  path: string
  createdAt: string
  updatedAt: string
}

interface SidebarProps {
  isOpen: boolean
  [key: string]: any
}

export function Sidebar(props: SidebarProps) {
  const { isOpen, onToggle } = props as { isOpen: boolean; onToggle: () => void }
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)
  const [hovering, setHovering] = useState(false)
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()

  useEffect(() => {
    fetchChats()
  }, [])

  useEffect(() => {
    const match = pathname.match(/\/chat\/(.+)$/)
    if (match) setSelectedChatId(match[1])
    else setSelectedChatId(null)
  }, [pathname])

  const fetchChats = async () => {
    try {
      const response = await fetch("/api/chats")
      if (response.ok) {
        const data = await response.json()
        setChats(data)
      }
    } catch (error) {
      console.error("Error fetching chats:", error)
    } finally {
      setLoading(false)
    }
  }

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const response = await fetch(`/api/chat/${chatId}`, {
        method: "DELETE",
      })
      if (response.ok) {
        setChats(chats.filter((chat) => chat.id !== chatId))
        if (pathname === `/chat/${chatId}`) {
          router.push("/")
        }
      }
    } catch (error) {
      console.error("Error deleting chat:", error)
    }
  }

  const startNewChat = () => {
    const tempId = `temp-${Date.now()}`
    setChats((prev) => [
      {
        id: tempId,
        title: "New Chat",
        path: `/chat/${tempId}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...prev,
    ])
    setSelectedChatId(tempId)
    router.push("/")
    if (window.innerWidth < 768) {
      onToggle()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onToggle}
          />

          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed left-0 top-0 z-50 h-full w-[var(--sidebar-width)] bg-background border-r border-border flex flex-col shadow-xl overflow-hidden"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {loading ? (
                  <div className="h-7 w-32 bg-muted/60 rounded sidebar-loading-item"></div>
                ) : (
                  <h2 className="text-lg font-medium text-foreground">vit assistant</h2>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                className="text-muted-foreground hover:text-foreground ml-auto"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="p-4 border-b border-border">
              {loading ? (
                <div className="h-10 bg-muted/60 rounded-lg sidebar-loading-item" style={{ '--delay': 0 } as React.CSSProperties}></div>
              ) : (
                <Button 
                  onClick={startNewChat} 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 rounded-lg transition-all duration-200"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Chat
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-1">
                {loading ? (
                  <div className="h-full w-full flex flex-col space-y-3">
                    <div className="flex flex-col space-y-2">
                      {[...Array(8)].map((_, i) => (
                        <div 
                          key={i} 
                          className="h-12 bg-muted/60 rounded-lg sidebar-loading-item" 
                          style={{ '--delay': i } as React.CSSProperties} 
                        >
                          <div className="flex items-center p-3">
                            <div className="w-4 h-4 rounded-full bg-muted-foreground/20 mr-3"></div>
                            <div className="flex-1">
                              <div className="h-3 bg-muted-foreground/20 rounded w-3/4 mb-2"></div>
                              <div className="h-2 bg-muted-foreground/10 rounded w-1/2"></div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : chats.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">
                    <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="h-8 w-8 opacity-50" />
                    </div>
                    <p className="text-sm font-medium mb-1">No chat history</p>
                    <p className="text-xs text-muted-foreground">Start a conversation to see your history here</p>
                  </div>
                ) : (
                  chats.map((chat) => (
                    <motion.div
                      key={chat.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "group relative flex items-center p-3 rounded-lg cursor-pointer transition-all",
                        (selectedChatId === chat.id || pathname === `/chat/${chat.id}`)
                          ? "bg-muted text-foreground shadow-sm"
                          : "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => {
                        setSelectedChatId(chat.id)
                        router.replace(`/chat/${chat.id}`)
                        if (window.innerWidth < 768) {
                          onToggle()
                        }
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-3 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{chat.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(chat.updatedAt)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                        onClick={(e) => deleteChat(chat.id, e)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </motion.div>
                  ))
                )}
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-border bg-muted/30 sidebar-user-section">
              {loading ? (
                <div className="sidebar-loading-profile">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="h-8 w-8 rounded-full bg-muted-foreground/20"></div>
                    <div className="flex-1 min-w-0">
                      <div className="h-3 bg-muted-foreground/20 rounded w-3/4 mb-2"></div>
                      <div className="h-2 bg-muted-foreground/10 rounded w-1/2"></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-8 bg-muted-foreground/10 rounded-md"></div>
                    <div className="h-8 bg-muted-foreground/10 rounded-md"></div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center space-x-3 mb-3">
                    {session?.user?.image ? (
                      <img
                        src={session.user.image || "/placeholder.svg"}
                        alt={session.user.name || "User"}
                        className="h-8 w-8 rounded-full"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{session?.user?.name || "User"}</p>
                      <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
                    </div>
                  </div>
                </>
              )}

              {!loading && (
                <div className="space-y-1">
                  <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                    onClick={() => signOut()}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
