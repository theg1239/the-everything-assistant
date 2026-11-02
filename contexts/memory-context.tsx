'use client'

import { createContext, useCallback, useContext, ReactNode, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useMemories } from '@/hooks/use-memories'
import type { MemorySettings, MemoryWithId } from '@/hooks/use-memories'

interface MemoryContextType {
  memories: MemoryWithId[]
  isLoading: boolean
  error: Error | null
  refreshMemories: () => Promise<void>

  createMemory: (content: string, importance?: number, tags?: string[]) => Promise<void>
  updateMemory: (id: string, content: string, importance?: number, tags?: string[]) => Promise<void>
  deleteMemory: (id: string) => Promise<void>

  isMemoryEnabled: boolean
  autoSave: boolean
  autoSaveFilter: 'low' | 'medium' | 'high'
  updateSettings: (settings: {
    isEnabled?: boolean
    autoSave?: boolean
    autoSaveFilter?: 'low' | 'medium' | 'high'
  }) => Promise<void>
}

interface MemoryContextInternal extends MemoryContextType {
  /** Start fetching memories + settings (idempotent). */
  activate: () => void
}

/**
 * Same query key / endpoint as `useMemorySettings` in hooks/use-memories, but
 * gated on `enabled` so nothing is fetched until a consumer asks for the data.
 */
const MEMORY_SETTINGS_QUERY_KEY = ['memorySettings'] as const

function useLazyMemorySettings(enabled: boolean) {
  return useQuery<MemorySettings, Error>({
    queryKey: MEMORY_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/memories/settings')
      if (!response.ok) {
        throw new Error('Failed to fetch memory settings')
      }
      return response.json()
    },
    enabled,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: previousData => previousData,
  })
}

const MemoryContext = createContext<MemoryContextInternal | undefined>(undefined)

/**
 * Memory data is loaded lazily: nothing is fetched on page load, only once some
 * component calls `useMemory()` (which activates the provider on mount).
 */
export function MemoryProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [active, setActive] = useState(false)
  const activate = useCallback(() => setActive(true), [])
  const enabled = active && Boolean(session?.user)

  const {
    data: memoriesData,
    isLoading: isMemoriesLoading,
    error: memoriesError,
    refetch: refetchMemories,
  } = useMemories({ enabled: active })

  const {
    data: settingsData,
    isLoading: isSettingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useLazyMemorySettings(enabled)

  const memories = memoriesData?.data || []
  const isLoading = isMemoriesLoading || isSettingsLoading
  const error = memoriesError || settingsError

  const isMemoryEnabled = settingsData?.isEnabled ?? true
  const autoSave = settingsData?.autoSave ?? true
  const autoSaveFilter = (settingsData?.autoSaveFilter as 'low' | 'medium' | 'high') ?? 'medium'

  const refreshMemories = async () => {
    await refetchMemories()
  }

  const createMemory = async (content: string, importance?: number, tags: string[] = []) => {
    if (!session?.user?.id) throw new Error('Not authenticated')

    const response = await fetch('/api/memories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        importance,
        tags,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to create memory')
    }

    await refreshMemories()
  }

  const updateMemory = async (
    id: string,
    content: string,
    importance?: number,
    tags: string[] = []
  ) => {
    if (!session?.user?.id) throw new Error('Not authenticated')

    const response = await fetch(`/api/memories/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        importance,
        tags,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to update memory')
    }

    await refreshMemories()
  }

  const deleteMemory = async (id: string) => {
    if (!session?.user?.id) throw new Error('Not authenticated')

    const response = await fetch(`/api/memories/${id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      throw new Error('Failed to delete memory')
    }

    await refreshMemories()
  }

  const updateSettings = async (settings: {
    isEnabled?: boolean
    autoSave?: boolean
    autoSaveFilter?: 'low' | 'medium' | 'high'
  }) => {
    if (!session?.user?.id) throw new Error('Not authenticated')

    const response = await fetch('/api/memories/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    })

    if (!response.ok) {
      throw new Error('Failed to update memory settings')
    }

    await refetchSettings()
  }

  const contextValue: MemoryContextInternal = {
    activate,
    memories,
    isLoading,
    error,
    refreshMemories,

    createMemory,
    updateMemory,
    deleteMemory,

    isMemoryEnabled,
    autoSave,
    autoSaveFilter,
    updateSettings,
  }

  return <MemoryContext.Provider value={contextValue}>{children}</MemoryContext.Provider>
}

export function useMemory(): MemoryContextType {
  const context = useContext(MemoryContext)
  if (context === undefined) {
    throw new Error('useMemory must be used within a MemoryProvider')
  }
  const { activate } = context
  useEffect(() => {
    activate()
  }, [activate])
  return context
}
