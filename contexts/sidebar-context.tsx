'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { SIDEBAR_OPEN_COOKIE } from '@/contexts/sidebar-cookie'

interface Chat {
  id: string
  title: string
  path: string
  createdAt: string
  updatedAt: string
}

interface SidebarContextType {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  toggle: () => void
  isInitialized: boolean
  pdfOpen: boolean
  chats: Chat[]
  setChats: (chats: Chat[] | ((prev: Chat[]) => Chat[])) => void
  chatsLoaded: boolean
  setChatsLoaded: (loaded: boolean) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * `initialOpen` comes from the `sidebarOpen` cookie (read by the root layout), so
 * the server render and hydration agree. `undefined` = no cookie yet: fall back
 * to the legacy localStorage value after mount.
 */
export function SidebarProvider({
  children,
  initialOpen,
}: {
  children: React.ReactNode
  initialOpen?: boolean
}) {
  const [isOpen, setIsOpenState] = useState(initialOpen ?? false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [chats, setChats] = useState<Chat[]>([])
  const [chatsLoaded, setChatsLoaded] = useState(false)

  useEffect(() => {
    if (initialOpen === undefined && localStorage.getItem(SIDEBAR_OPEN_COOKIE) === 'true') {
      setIsOpenState(true)
    }
    setIsInitialized(true)
  }, [initialOpen])

  useEffect(() => {
    if (!isInitialized) return
    localStorage.setItem(SIDEBAR_OPEN_COOKIE, String(isOpen))
    document.cookie = `${SIDEBAR_OPEN_COOKIE}=${String(isOpen)}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`
  }, [isOpen, isInitialized])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handlePdfOpen = () => {
      setPdfOpen(true)
      setIsOpenState(false)
    }
    const handlePdfClose = () => setPdfOpen(false)
    window.addEventListener('pdfViewerOpen', handlePdfOpen)
    window.addEventListener('pdfViewerClosed', handlePdfClose)
    return () => {
      window.removeEventListener('pdfViewerOpen', handlePdfOpen)
      window.removeEventListener('pdfViewerClosed', handlePdfClose)
    }
  }, [])

  const setIsOpen = useCallback((open: boolean) => {
    setIsOpenState(open)
  }, [])

  const toggle = useCallback(() => {
    setIsOpenState(prev => !prev)
  }, [])

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        setIsOpen,
        toggle,
        isInitialized,
        pdfOpen,
        chats,
        setChats,
        chatsLoaded,
        setChatsLoaded,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider')
  }
  return context
}
