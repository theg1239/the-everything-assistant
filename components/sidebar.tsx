"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MessageSquare, Plus, Settings, LogOut, Trash2, User } from "lucide-react"
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
  onToggle: () => void
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()

  useEffect(() => {
    fetchChats()
  }, [])

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
    router.push("/")
    if (window.innerWidth < 768) {
      onToggle()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onToggle}
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed left-0 top-0 z-50 h-full w-80 bg-slate-900/95 backdrop-blur-xl border-r border-slate-700/50 flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">vit assistant</h2>
                <Button variant="ghost" size="sm" onClick={startNewChat} className="text-slate-400 hover:text-white">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <Button onClick={startNewChat} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                new chat
              </Button>
            </div>

            {/* Chat History */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-2">
                {loading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-12 bg-slate-800/50 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : chats.length === 0 ? (
                  <div className="text-center text-slate-400 py-8">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">no chats yet</p>
                    <p className="text-xs">start a conversation to see your history</p>
                  </div>
                ) : (
                  chats.map((chat) => (
                    <motion.div
                      key={chat.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "group relative flex items-center p-3 rounded-lg cursor-pointer transition-colors",
                        pathname === `/chat/${chat.id}`
                          ? "bg-blue-600/20 border border-blue-600/30"
                          : "hover:bg-slate-800/50",
                      )}
                      onClick={() => {
                        router.push(`/chat/${chat.id}`)
                        if (window.innerWidth < 768) {
                          onToggle()
                        }
                      }}
                    >
                      <MessageSquare className="h-4 w-4 text-slate-400 mr-3 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{chat.title}</p>
                        <p className="text-xs text-slate-400">{formatDate(chat.updatedAt)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-slate-400 hover:text-red-400"
                        onClick={(e) => deleteChat(chat.id, e)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </motion.div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* User Menu */}
            <div className="p-4 border-t border-slate-700/50">
              <div className="flex items-center space-x-3 mb-3">
                {session?.user?.image ? (
                  <img
                    src={session.user.image || "/placeholder.svg"}
                    alt={session.user.name || "User"}
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{session?.user?.name || "User"}</p>
                  <p className="text-xs text-slate-400 truncate">{session?.user?.email}</p>
                </div>
              </div>

              <div className="space-y-1">
                <Button variant="ghost" size="sm" className="w-full justify-start text-slate-400 hover:text-white">
                  <Settings className="h-4 w-4 mr-2" />
                  settings
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-slate-400 hover:text-white"
                  onClick={() => signOut()}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  sign out
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
