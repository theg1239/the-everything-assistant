'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

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
  chats: Chat[]
  setChats: (chats: Chat[] | ((prev: Chat[]) => Chat[])) => void
  chatsLoaded: boolean
  setChatsLoaded: (loaded: boolean) => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpenState] = useState(() => {
    if (typeof window === 'undefined') return false
    const saved = localStorage.getItem('sidebarOpen')
    return saved !== null ? saved === 'true' : false
  })
  const [isInitialized, setIsInitialized] = useState(false)
  const [chats, setChats] = useState<Chat[]>([])
  const [chatsLoaded, setChatsLoaded] = useState(false)

  useEffect(() => {
    setIsInitialized(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('sidebarOpen', String(isOpen))
  }, [isOpen])

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
