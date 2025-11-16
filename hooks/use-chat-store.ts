'use client'

import { create } from 'zustand'

interface ChatStoreState {
  input: string
  showFullChat: boolean
  selectedTool: string
  lastUserMessage: string
  setInput: (value: string) => void
  setShowFullChat: (value: boolean) => void
  setSelectedTool: (value: string) => void
  setLastUserMessage: (value: string) => void
  reset: () => void
}

export const useChatStore = create<ChatStoreState>(set => ({
  input: '',
  showFullChat: false,
  selectedTool: '',
  lastUserMessage: '',
  setInput: input => set({ input }),
  setShowFullChat: showFullChat => set({ showFullChat }),
  setSelectedTool: selectedTool => set({ selectedTool }),
  setLastUserMessage: lastUserMessage => set({ lastUserMessage }),
  reset: () => set({ input: '', showFullChat: false, selectedTool: '', lastUserMessage: '' }),
}))
