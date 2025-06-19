'use client'

import type React from 'react'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import {
  MessageSquare,
  Plus,
  Settings,
  LogOut,
  Trash2,
  User,
  ChevronLeft,
  Loader2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'
import { SettingsDialog } from '@/components/settings-dialog'

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
  const [loadingMore, setLoadingMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [hovering, setHovering] = useState(false)
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [scrollPosition, setScrollPosition] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()

  const redactName = (name: string) => {
    if (!name) return 'User'
    const parts = name.split(' ')
    if (parts.length <= 3) return name
    return parts.slice(0, 3).join(' ')
  }

  useEffect(() => {
    fetchChats(true) // Reset and fetch initial chats
  }, [])

  useEffect(() => {
    const match = pathname.match(/\/chat\/(.+)$/)
    if (match) setSelectedChatId(match[1])
    else setSelectedChatId(null)
  }, [pathname])

  // Listen for new chat creation
  useEffect(() => {
    const handleNewChat = (event: CustomEvent) => {
      const newChat = event.detail
      console.log('📧 Sidebar received newChatCreated event:', newChat)
      setChats(prevChats => {
        console.log('📊 Adding new chat to list. Previous count:', prevChats.length)
        return [newChat, ...prevChats]
      })
    }

    window.addEventListener('newChatCreated', handleNewChat as EventListener)
    return () => {
      window.removeEventListener('newChatCreated', handleNewChat as EventListener)
    }
  }, [])

  // Listen for chat title updates
  useEffect(() => {
    const handleChatTitleUpdate = (event: CustomEvent) => {
      const { chatId, title } = event.detail
      console.log('📧 Sidebar received chatTitleUpdated event:', { chatId, title })
      console.log('📋 Current chats:', chats.map(c => ({ id: c.id, title: c.title })))
      
      setChats(prevChats => {
        const updated = prevChats.map(chat => {
          if (chat.id === chatId) {
            console.log('✅ Found matching chat, updating title from:', chat.title, 'to:', title)
            return { ...chat, title }
          }
          return chat
        })
        console.log('📊 Updated chats:', updated.map(c => ({ id: c.id, title: c.title })))
        return updated
      })
    }

    window.addEventListener('chatTitleUpdated', handleChatTitleUpdate as EventListener)
    return () => {
      window.removeEventListener('chatTitleUpdated', handleChatTitleUpdate as EventListener)
    }
  }, [])

  // Listen for bulk chat operations
  useEffect(() => {
    const handleChatsDeleted = () => {
      fetchChats(true) // Refresh the chat list
    }

    const handleChatsArchived = () => {
      fetchChats(true) // Refresh the chat list
    }

    window.addEventListener('chatsDeleted', handleChatsDeleted)
    window.addEventListener('chatsArchived', handleChatsArchived)
    
    return () => {
      window.removeEventListener('chatsDeleted', handleChatsDeleted)
      window.removeEventListener('chatsArchived', handleChatsArchived)
    }
  }, [])

  const fetchChats = async (reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true)
        setHasMore(true)
      } else {
        setLoadingMore(true)
      }

      const offset = reset ? 0 : chats.length
      const response = await fetch(`/api/chats?limit=15&offset=${offset}`)

      if (response.ok) {
        const data = await response.json()

        if (reset) {
          setChats(data)
        } else {
          setChats(prevChats => {
            const existingIds = new Set(prevChats.map(chat => chat.id))
            const newChats = data.filter((chat: Chat) => !existingIds.has(chat.id))
            
            if (process.env.NODE_ENV === 'development') {
              console.log('Existing chats:', prevChats.length)
              console.log('New chats fetched:', data.length)
              console.log('New chats after dedup:', newChats.length)
              console.log('Duplicate chat IDs found:', data.length - newChats.length)
            }
            
            return [...prevChats, ...newChats]
          })
        }

        if (data.length < 15) {
          setHasMore(false)
        }
      }
    } catch (error) {
      console.error('Error fetching chats:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
      setIsLoadingMore(false)
    }
  }

  const loadMoreChats = () => {
    if (!loadingMore && !isLoadingMore && hasMore) {
      setIsLoadingMore(true)
      fetchChats(false).finally(() => {
        setIsLoadingMore(false)
      })
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    setScrollPosition(scrollTop)
    
    if (scrollHeight - scrollTop - clientHeight < 10 && hasMore && !loadingMore && !isLoadingMore) {
      setTimeout(() => {
        if (hasMore && !loadingMore && !isLoadingMore) {
          loadMoreChats()
        }
      }, 100)
    }
  }

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const response = await fetch(`/api/chat/${chatId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        setChats(chats.filter(chat => chat.id !== chatId))
        if (pathname === `/chat/${chatId}`) {
          router.push('/')
        }
      }
    } catch (error) {
      console.error('Error deleting chat:', error)
    }
  }

  const startNewChat = () => {
    const tempId = `temp-${Date.now()}`
    setChats(prev => [
      {
        id: tempId,
        title: 'New Chat',
        path: `/chat/${tempId}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      ...prev,
    ])
    setSelectedChatId(tempId)
    router.push('/')
    if (window.innerWidth < 768) {
      onToggle()
    }
  }

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        const scrollElement = document.querySelector('.sidebar-scroll-area') as HTMLElement
        if (scrollElement) {
          scrollElement.style.display = 'none'
          scrollElement.offsetHeight
          scrollElement.style.display = ''
        }
      }
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [])

  useEffect(() => {
    const scrollArea = document.querySelector('.sidebar-mobile-scroll') as HTMLElement
    if (!scrollArea) return

    let isScrolling = false
    let startY = 0
    let scrollStartY = 0

    const handleTouchStart = (e: TouchEvent) => {
      isScrolling = true
      startY = e.touches[0].pageY
      scrollStartY = scrollArea.scrollTop
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isScrolling) return
      
      e.preventDefault()
      const currentY = e.touches[0].pageY
      const diff = startY - currentY
      scrollArea.scrollTop = scrollStartY + diff
    }

    const handleTouchEnd = () => {
      isScrolling = false
    }

    scrollArea.addEventListener('touchstart', handleTouchStart, { passive: false })
    scrollArea.addEventListener('touchmove', handleTouchMove, { passive: false })
    scrollArea.addEventListener('touchend', handleTouchEnd, { passive: false })

    return () => {
      scrollArea.removeEventListener('touchstart', handleTouchStart)
      scrollArea.removeEventListener('touchmove', handleTouchMove)
      scrollArea.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={onToggle}
              style={{ pointerEvents: 'auto' }}
              onTouchStart={(e) => {
                if (e.target === e.currentTarget) {
                onToggle()
              }
            }}
          />

          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="sidebar-container fixed left-0 top-0 z-50 h-full w-[var(--sidebar-width)] bg-background border-r border-border flex flex-col shadow-xl"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{ 
              pointerEvents: 'auto',
              touchAction: 'none'
            }}
            onTouchStart={(e) => {
              e.stopPropagation()
            }}
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {loading ? (
                  <div className="h-7 w-32 bg-muted/60 rounded sidebar-loading-item"></div>
                ) : (
                  <h2 className="text-lg font-medium text-foreground">the everything assistant</h2>
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
                <div
                  className="h-10 bg-muted/60 rounded-lg sidebar-loading-item"
                  style={{ '--delay': 0 } as React.CSSProperties}
                ></div>
              ) : (
                <Button
                  onClick={startNewChat}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 rounded-lg transition-all duration-200"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  new chat
                </Button>
              )}
            </div>

            <div 
              className="flex-1 min-h-0 flex flex-col"
            >
              <div 
                className="sidebar-mobile-scroll flex-1 p-4 overflow-y-auto overflow-x-hidden"
                onScroll={handleScroll}
                onTouchStart={(e) => {
                  e.stopPropagation()
                }}
                onTouchMove={(e) => {
                  e.stopPropagation()
                }}
                style={{
                  touchAction: 'pan-y',
                  WebkitOverflowScrolling: 'touch',
                  overscrollBehavior: 'contain',
                  pointerEvents: 'auto',
                }}
              >
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
                    <p className="text-sm font-medium mb-1">no chat history</p>
                    <p className="text-xs text-muted-foreground">
                      start a conversation to see your history here
                    </p>
                  </div>
                ) : (
                  <>
                    {chats.map((chat, index) => (
                      <motion.div
                        key={`chat-${chat.id}-${chat.updatedAt || index}`} // More robust unique key
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          'group relative flex items-center p-3 rounded-lg cursor-pointer transition-all',
                          selectedChatId === chat.id || pathname === `/chat/${chat.id}`
                            ? 'bg-muted text-foreground shadow-sm'
                            : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
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
                          <p className="text-xs text-muted-foreground">
                            {formatDate(chat.updatedAt)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                          onClick={e => deleteChat(chat.id, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </motion.div>
                    ))}

                    {(loadingMore || isLoadingMore) && hasMore && (
                      <div className="flex justify-center py-2 mt-2">
                        <div className="flex items-center text-muted-foreground text-xs">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          loading more...
                        </div>
                      </div>
                    )}
                    
                    {!hasMore && chats.length > 0 && (
                      <div className="text-center py-2 mt-2">
                        {/* <div className="text-xs text-muted-foreground/70">
                          no more chats to load
                        </div> */}
                      </div>
                    )}
                  </>
                )}
              </div>
              </div>
            </div>

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
                        src={session.user.image || '/placeholder.svg'}
                        alt={session.user.name || 'User'}
                        className="h-8 w-8 rounded-full"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {redactName(session?.user?.name || 'User')}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {session?.user?.email}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {!loading && (
                <div className="space-y-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    settings
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                    onClick={() => signOut()}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    sign out
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

    <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
  </>
  )
}
