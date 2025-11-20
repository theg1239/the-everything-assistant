'use client'

import { create } from 'zustand'

interface ChatStoreState {
  showFullChat: boolean
  selectedTool: string | null
  lastUserMessage: string
  setShowFullChat: (value: boolean) => void
  setSelectedTool: (value: string | null) => void
  setLastUserMessage: (value: string) => void
  reset: () => void
}

export const useChatStore = create<ChatStoreState>(set => ({
  showFullChat: false,
  selectedTool: null,
  lastUserMessage: '',
  setShowFullChat: showFullChat => set({ showFullChat }),
  setSelectedTool: selectedTool => set({ selectedTool }),
  setLastUserMessage: lastUserMessage => set({ lastUserMessage }),
  reset: () => set({ showFullChat: false, selectedTool: null, lastUserMessage: '' }),
}))
