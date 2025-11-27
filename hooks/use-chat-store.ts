'use client'

import { create } from 'zustand'

interface ChatStoreState {
  showFullChat: boolean
  selectedTool: string | null
  lastUserMessage: string
  thinkHarder: boolean
  setShowFullChat: (value: boolean) => void
  setSelectedTool: (value: string | null) => void
  setLastUserMessage: (value: string) => void
  setThinkHarder: (value: boolean) => void
  reset: () => void
}

export const useChatStore = create<ChatStoreState>(set => ({
  showFullChat: false,
  selectedTool: null,
  lastUserMessage: '',
  thinkHarder: false,
  setShowFullChat: showFullChat => set({ showFullChat }),
  setSelectedTool: selectedTool => set({ selectedTool }),
  setLastUserMessage: lastUserMessage => set({ lastUserMessage }),
  setThinkHarder: thinkHarder => set({ thinkHarder }),
  reset: () => set({ showFullChat: false, selectedTool: null, lastUserMessage: '', thinkHarder: false }),
}))
