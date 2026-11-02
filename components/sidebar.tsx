'use client'

import type React from 'react'
import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
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
import { useSidebar } from '@/contexts/sidebar-context'
import { readJson } from '@/lib/http'
import { isRecord } from '@/lib/json'
import {
  chatSummariesResponseSchema,
  chatSummarySchema,
  type ChatSummary as Chat,
} from '@/types/api/chats'
import { useChatPrefetch } from '@/hooks/use-chat-prefetch'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
}

/** Settings is rarely opened: load its (large) chunk on demand, never during SSR. */
const SettingsDialog = dynamic(
  () => import('@/components/settings-dialog').then(mod => mod.SettingsDialog),
  { ssr: false }
)

const CHATS_PAGE_SIZE = 15

/** Fetches one page of the chat list; null on network/HTTP failure. */
async function fetchChatPage(offset: number): Promise<Chat[] | null> {
  try {
    const response = await fetch(`/api/chats?limit=${CHATS_PAGE_SIZE}&offset=${offset}`)
    if (!response.ok) return null
    return await readJson(response, chatSummariesResponseSchema)
  } catch (error) {
    console.error('Error fetching chats:', error)
    return null
  }
}

/** Runs `callback` when the browser is idle (or after `timeout` ms); returns a canceller. */
function scheduleIdle(callback: () => void, timeout: number): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(callback, Math.min(timeout, 1500))
  return () => window.clearTimeout(id)
}

const SIDEBAR_WIDTH = 280

const sidebarVariants = {
  open: {
    x: 0,
    transition: {
      duration: 0.25,
    },
  },
  closed: {
    x: -SIDEBAR_WIDTH,
    transition: {
      duration: 0.2,
    },
  },
}

const overlayVariants = {
  open: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
  closed: {
    opacity: 0,
    transition: { duration: 0.15 },
  },
}

export const Sidebar = memo(
  function Sidebar(props: SidebarProps) {
    const { isOpen, onToggle } = props
    const { chats, setChats, chatsLoaded, setChatsLoaded, pdfOpen } = useSidebar()

    const hasLoadedOnceRef = useRef(chatsLoaded)
    useEffect(() => {
      if (chatsLoaded) {
        hasLoadedOnceRef.current = true
      }
    }, [chatsLoaded])

    // Same as `!hasLoadedOnceRef.current` at mount (the ref is seeded from `chatsLoaded`).
    const [loading, setLoading] = useState(() => !chatsLoaded)
    const [loadingMore, setLoadingMore] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    // Mount the lazily-loaded settings dialog on first open, then keep it so its close animation plays.
    const [settingsMounted, setSettingsMounted] = useState(false)
    const [settingsInitialSection, setSettingsInitialSection] = useState<string | undefined>()
    const [mounted, setMounted] = useState(false)
    const [touchStartY, setTouchStartY] = useState(0)
    const [touchStartScrollTop, setTouchStartScrollTop] = useState(0)
    const [isDragging, setIsDragging] = useState(false)

    // Swipe tracking lives in refs: every touch anywhere on the page used to set state here,
    // re-rendering the sidebar and re-subscribing these document listeners.
    const swipeStartRef = useRef({ x: 0, y: 0 })
    const isSwipeGestureRef = useRef(false)
    const [showSwipeHint, setShowSwipeHint] = useState(false)
    const router = useRouter()
    const pathname = usePathname()
    const { data: session } = useSession()
    const { prefetchOnHover, prefetchOnFocus } = useChatPrefetch()

    useEffect(() => {
      setMounted(true)
    }, [])

    // `openSettings` (section: feedback) is handled by SettingsDialog itself once mounted; before
    // its lazy chunk is mounted, open it here on the requested section.
    useEffect(() => {
      if (settingsMounted) return
      const handleOpenSettings = (event: Event) => {
        if (!(event instanceof CustomEvent)) return
        const detail: unknown = event.detail
        if (!isRecord(detail) || detail.section !== 'feedback') return
        setSettingsInitialSection('feedback')
        setSettingsMounted(true)
        setSettingsOpen(true)
      }
      window.addEventListener('openSettings', handleOpenSettings)
      return () => window.removeEventListener('openSettings', handleOpenSettings)
    }, [settingsMounted])

    useEffect(() => {
      const handleGlobalTouchStart = (e: TouchEvent) => {
        const touch = e.touches[0]
        if (!touch) return
        swipeStartRef.current = { x: touch.clientX, y: touch.clientY }

        if (touch.clientX < 20 && !isOpen) {
          isSwipeGestureRef.current = true
          setShowSwipeHint(true)
        }
      }

      const handleGlobalTouchMove = (e: TouchEvent) => {
        if (!isSwipeGestureRef.current) return

        const touch = e.touches[0]
        if (!touch) return
        const deltaX = touch.clientX - swipeStartRef.current.x
        const deltaY = Math.abs(touch.clientY - swipeStartRef.current.y)

        if (deltaX > 50 && deltaX > deltaY * 2) {
          isSwipeGestureRef.current = false
          setShowSwipeHint(false)
          onToggle()
        } else if (deltaY > 50 || deltaX < -10) {
          isSwipeGestureRef.current = false
          setShowSwipeHint(false)
        }
      }

      const handleGlobalTouchEnd = () => {
        isSwipeGestureRef.current = false
        setShowSwipeHint(false)
      }

      document.addEventListener('touchstart', handleGlobalTouchStart, { passive: true })
      document.addEventListener('touchmove', handleGlobalTouchMove, { passive: true })
      document.addEventListener('touchend', handleGlobalTouchEnd, { passive: true })

      return () => {
        document.removeEventListener('touchstart', handleGlobalTouchStart)
        document.removeEventListener('touchmove', handleGlobalTouchMove)
        document.removeEventListener('touchend', handleGlobalTouchEnd)
      }
    }, [isOpen, onToggle])

    const redactName = useCallback((name: string) => {
      if (!name) return 'User'
      const parts = name.split(' ')
      if (parts.length <= 3) return name
      return parts.slice(0, 3).join(' ')
    }, [])

    const userInfo = useMemo(
      () => ({
        name: redactName(session?.user?.name || 'User'),
        email: session?.user?.email,
        image: session?.user?.image,
      }),
      [session?.user, redactName]
    )

    const fetchChats = useCallback(
      async (reset: boolean = false, forceLoading: boolean = false) => {
        if (reset) {
          if (!hasLoadedOnceRef.current || forceLoading) {
            setLoading(true)
          }
          setHasMore(true)
        } else {
          setLoadingMore(true)
        }

        const data = await fetchChatPage(reset ? 0 : chats.length)

        if (data) {
          if (reset) {
            setChats(data)
            setChatsLoaded(true)
            hasLoadedOnceRef.current = true
          } else {
            setChats(prevChats => {
              const existingIds = new Set(prevChats.map(chat => chat.id))
              const newChats = data.filter(chat => !existingIds.has(chat.id))
              return [...prevChats, ...newChats]
            })
          }

          if (data.length < CHATS_PAGE_SIZE) {
            setHasMore(false)
          }
        }

        setLoading(false)
        setLoadingMore(false)
        setIsLoadingMore(false)
      },
      [chats.length, setChats, setChatsLoaded]
    )

    // Initial chat list: fetched right away when the sidebar is open, otherwise once the browser
    // is idle so it doesn't compete with the first render (and is ready before the user opens it).
    // Chat routes are prefetched on hover/focus intent only (see the list items below).
    const initialFetchStartedRef = useRef(false)
    useEffect(() => {
      if (chatsLoaded || initialFetchStartedRef.current) return
      const start = () => {
        if (initialFetchStartedRef.current) return
        initialFetchStartedRef.current = true
        void fetchChats(true).then(() => {
          initialFetchStartedRef.current = false
        })
      }
      if (isOpen) {
        start()
        return undefined
      }
      return scheduleIdle(start, 4000)
    }, [chatsLoaded, fetchChats, isOpen])

    useEffect(() => {
      const match = pathname.match(/\/chat\/(.+)$/)
      setSelectedChatId(match?.[1] ?? null)
    }, [pathname])

    useEffect(() => {
      const handleNewChat = (event: Event) => {
        if (!(event instanceof CustomEvent)) return
        const parsed = chatSummarySchema.safeParse(event.detail)
        if (!parsed.success) return
        const newChat = parsed.data
        setChats(prevChats => {
          const exists = prevChats.some(chat => chat.id === newChat.id)
          if (exists) return prevChats
          return [newChat, ...prevChats]
        })
      }

      window.addEventListener('newChatCreated', handleNewChat)
      return () => {
        window.removeEventListener('newChatCreated', handleNewChat)
      }
    }, [setChats])

    useEffect(() => {
      const handleChatTitleUpdate = (event: Event) => {
        if (!(event instanceof CustomEvent)) return
        const detail: unknown = event.detail
        if (!isRecord(detail) || typeof detail.title !== 'string') return
        const { chatId, title } = detail
        setChats(prevChats =>
          prevChats.map(chat => (chat.id === chatId ? { ...chat, title } : chat))
        )
      }

      window.addEventListener('chatTitleUpdated', handleChatTitleUpdate)
      return () => {
        window.removeEventListener('chatTitleUpdated', handleChatTitleUpdate)
      }
    }, [setChats])

    useEffect(() => {
      const handleChatsDeleted = () => fetchChats(true, true)
      const handleChatsArchived = () => fetchChats(true, true)

      window.addEventListener('chatsDeleted', handleChatsDeleted)
      window.addEventListener('chatsArchived', handleChatsArchived)

      return () => {
        window.removeEventListener('chatsDeleted', handleChatsDeleted)
        window.removeEventListener('chatsArchived', handleChatsArchived)
      }
    }, [fetchChats])

    const loadMoreChats = useCallback(() => {
      if (!loadingMore && !isLoadingMore && hasMore) {
        setIsLoadingMore(true)
        fetchChats(false).finally(() => {
          setIsLoadingMore(false)
        })
      }
    }, [loadingMore, isLoadingMore, hasMore, fetchChats])

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget

        if (
          scrollHeight - scrollTop - clientHeight < 10 &&
          hasMore &&
          !loadingMore &&
          !isLoadingMore
        ) {
          requestAnimationFrame(() => {
            if (hasMore && !loadingMore && !isLoadingMore) {
              loadMoreChats()
            }
          })
        }
      },
      [hasMore, loadingMore, isLoadingMore, loadMoreChats]
    )

    const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0]
      if (!touch) return
      const scrollContainer = e.currentTarget
      setTouchStartY(touch.clientY)
      setTouchStartScrollTop(scrollContainer.scrollTop)
      setIsDragging(true)
    }, [])

    const handleTouchMove = useCallback(
      (e: React.TouchEvent<HTMLDivElement>) => {
        if (!isDragging) return

        const touch = e.touches[0]
        if (!touch) return
        const scrollContainer = e.currentTarget
        const deltaY = touchStartY - touch.clientY
        const newScrollTop = touchStartScrollTop + deltaY

        scrollContainer.scrollTop = Math.max(
          0,
          Math.min(newScrollTop, scrollContainer.scrollHeight - scrollContainer.clientHeight)
        )
      },
      [isDragging, touchStartY, touchStartScrollTop]
    )

    const handleTouchEnd = useCallback(() => {
      setIsDragging(false)
    }, [])

    const deleteChat = useCallback(
      async (chatId: string, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        try {
          const response = await fetch(`/api/chat/${chatId}`, {
            method: 'DELETE',
          })
          if (response.ok) {
            setChats(prevChats => prevChats.filter(chat => chat.id !== chatId))
            if (pathname === `/chat/${chatId}`) {
              router.push('/')
            }
          }
        } catch (error) {
          console.error('Error deleting chat:', error)
        }
      },
      [pathname, router, setChats]
    )

    const startNewChat = useCallback(() => {
      const existingTemp = chats.find(chat => chat.id.startsWith('temp-'))

      if (existingTemp) {
        setSelectedChatId(existingTemp.id)
        return
      }

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
      if (typeof window !== 'undefined') {
        try {
          window.history.replaceState({}, '', '/')
        } catch {}
      }
      router.push('/')
    }, [router, setChats, chats, pathname])

    const handleChatClick = useCallback(
      (chatId: string) => {
        setSelectedChatId(chatId)
        router.replace(`/chat/${chatId}`)
      },
      [router]
    )

    const handleOverlayClick = useCallback(
      (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault()
        e.stopPropagation()

        if (e.target === e.currentTarget) {
          onToggle()
        }
      },
      [onToggle]
    )

    const sidebarContent = (
      <>
        <AnimatePresence>
          {showSwipeHint && !isOpen && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="fixed left-0 top-1/2 z-30 -translate-y-1/2 w-1 h-16 bg-primary/60 rounded-r-full md:hidden"
              style={{
                pointerEvents: 'none',
              }}
            />
          )}
        </AnimatePresence>

    <AnimatePresence mode="sync">
          {isOpen && !pdfOpen && (
            <>
              <motion.div
                key="overlay"
                variants={overlayVariants}
                initial="closed"
                animate="open"
                exit="closed"
                className="fixed inset-0 bg-black/50 z-40 md:hidden"
                onClick={handleOverlayClick}
                onTouchEnd={handleOverlayClick}
                style={{
                  pointerEvents: 'auto',
                  willChange: 'opacity',
                  touchAction: 'none',
                }}
              />

              <motion.div
                key="sidebar"
                variants={sidebarVariants}
                initial="closed"
                animate="open"
                exit="closed"
                className="fixed left-0 top-0 z-50 h-full w-[280px] bg-background/80 backdrop-blur-sm border-r border-border/50 flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
                onTouchEnd={e => e.stopPropagation()}
                style={{
                  pointerEvents: 'auto',
                  willChange: 'transform',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'translate3d(0, 0, 0)',
                  touchAction: 'pan-y',
                }}
              >

                <div className="h-14 px-4 border-b border-border/50 flex items-center justify-between bg-transparent">
                  <div className="flex items-center space-x-2">
                    {loading ? (
                      <div className="h-7 w-32 bg-muted/60 rounded animate-pulse"></div>
                    ) : (
                      <h2 className="text-lg font-medium text-foreground">
                        the everything assistant
                      </h2>
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


                <div className="h-14 px-4 border-b border-border/50 bg-transparent flex items-center">
                  {loading ? (
                    <div className="h-10 bg-muted/60 rounded-lg animate-pulse"></div>
                  ) : (
                    <Button
                      onClick={startNewChat}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground border-0 rounded-lg transition-colors duration-150"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      new chat
                    </Button>
                  )}
                </div>


                <div className="flex-1 min-h-0 flex flex-col">
                  <div
                    className="p-4 overflow-auto flex-1 min-h-0"
                    onScroll={handleScroll}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    style={{
                      WebkitOverflowScrolling: 'touch',
                      overscrollBehavior: 'contain',
                      transform: 'translate3d(0, 0, 0)',
                      willChange: 'scroll-position',
                    }}
                  >
                    <div className="space-y-1">
                      {loading ? (
                        <div className="space-y-2">
                          {[...Array(8)].map((_, i) => (
                            <div
                              key={i}
                              className="h-12 bg-muted/60 rounded-lg animate-pulse"
                              style={{
                                animationDelay: `${i * 50}ms`,
                                animationDuration: '1.5s',
                              }}
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
                          {chats.map(chat => (
                            <div
                              key={`chat-${chat.id}`}
                              className={cn(
                                'group relative flex items-center p-3 rounded-lg cursor-pointer transition-colors duration-150 min-h-12',
                                selectedChatId === chat.id || pathname === `/chat/${chat.id}`
                                  ? 'bg-muted text-foreground shadow-sm'
                                  : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                              )}
                              onClick={() => handleChatClick(chat.id)}
                              onMouseEnter={() => prefetchOnHover(chat.id)}
                              onFocus={() => prefetchOnFocus(chat.id)}
                              onPointerDown={() => prefetchOnFocus(chat.id)}
                              role="button"
                              tabIndex={0}
                              aria-current={
                                selectedChatId === chat.id || pathname === `/chat/${chat.id}`
                                  ? 'page'
                                  : undefined
                              }
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  handleChatClick(chat.id)
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
                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 transition-opacity duration-150"
                                onClick={e => deleteChat(chat.id, e)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}

                          {(loadingMore || isLoadingMore) && hasMore && (
                            <div className="flex justify-center py-2 mt-2">
                              <div className="flex items-center text-muted-foreground text-xs">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                loading more...
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>


                <div
                  className="p-4 border-t border-border bg-transparent"
                  style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
                >
                  {loading ? (
                    <div className="animate-pulse">
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
                        {userInfo.image ? (
                          <img
                            src={userInfo.image || '/placeholder.svg'}
                            alt={userInfo.name}
                            className="h-8 w-8 rounded-full"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                            <User className="h-4 w-4 text-primary-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{userInfo.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{userInfo.email}</p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors duration-150"
                          onClick={() => {
                            setSettingsMounted(true)
                            setSettingsOpen(true)
                          }}
                          aria-label="Open settings"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          settings
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors duration-150"
                          onClick={() => signOut()}
                          aria-label="Sign out"
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          sign out
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    )

    return (
      <>
        {mounted && typeof window !== 'undefined'
          ? createPortal(sidebarContent, document.body)
          : null}
        {settingsMounted && (
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            initialSection={settingsInitialSection}
            onTriggerOnboarding={() => {
              window.dispatchEvent(new CustomEvent('triggerOnboarding'))
            }}
          />
        )}
      </>
    )
  },
  (prevProps, nextProps) => {
    return prevProps.isOpen === nextProps.isOpen && prevProps.onToggle === nextProps.onToggle
  }
)
