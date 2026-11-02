import { createStore, type StoreApi } from 'zustand/vanilla'

/**
 * Composer text, held outside React state so keystrokes re-render only the composer that
 * subscribes to it, not the chat tree that owns the store. One store per chat instance.
 */
export interface ChatInputState {
  input: string
  setInput: (value: string) => void
}

export type ChatInputStore = StoreApi<ChatInputState>

/** DOM id of the composer textarea; used to recover text typed before hydration. */
export const CHAT_COMPOSER_INPUT_ID = 'chat-composer-input'

export const createChatInputStore = (initialInput = ''): ChatInputStore =>
  createStore<ChatInputState>()(set => ({
    input: initialInput,
    setInput: input => set({ input }),
  }))
