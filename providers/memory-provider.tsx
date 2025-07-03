'use client'

import { MemoryProvider as MemoryContextProvider } from '@/contexts/memory-context'

export function MemoryProvider({ children }: { children: React.ReactNode }) {
  return <MemoryContextProvider>{children}</MemoryContextProvider>
}
