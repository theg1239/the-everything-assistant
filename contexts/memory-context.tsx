'use client'

import { createContext, useContext, ReactNode, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useMemories, useMemorySettings } from '@/hooks/use-memories'
import type { MemoryWithId } from '@/hooks/use-memories'

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

const MemoryContext = createContext<MemoryContextType | undefined>(undefined)

export function MemoryProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()

  const {
    data: memoriesData,
    isLoading: isMemoriesLoading,
    error: memoriesError,
    refetch: refetchMemories,
  } = useMemories()

  const {
    data: settingsData,
    isLoading: isSettingsLoading,
    error: settingsError,
    refetch: refetchSettings,
  } = useMemorySettings()

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

  const contextValue: MemoryContextType = {
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

export function useMemory() {
  const context = useContext(MemoryContext)
  if (context === undefined) {
    throw new Error('useMemory must be used within a MemoryProvider')
  }
  return context
}
