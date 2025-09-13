import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Memory, MemoryImportance } from '@/lib/memory/memory-service'

export interface MemoryWithId extends Omit<Memory, 'id'> {
  id: string
}

interface MemoriesResponse {
  data: MemoryWithId[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

const memoryKeys = {
  all: ['memories'] as const,
  lists: () => [...memoryKeys.all, 'list'] as const,
  list: (filters: { page?: number; pageSize?: number } = {}) =>
    [...memoryKeys.lists(), filters] as const,
  detail: (id: string) => [...memoryKeys.all, 'detail', id] as const,
  settings: () => ['memorySettings'] as const,
}

// Cache memories for 5 minutes
const MEMORIES_STALE_TIME = 1000 * 60 * 5 // 5 minutes
const MEMORIES_GC_TIME = 1000 * 60 * 15 // 15 minutes

export function useMemories({
  page = 1,
  pageSize = 20,
  enabled = true,
}: {
  page?: number
  pageSize?: number
  enabled?: boolean
} = {}) {
  const { data: session } = useSession()
  const hasSession = !!session?.user

  return useQuery<MemoriesResponse, Error>({
    queryKey: memoryKeys.list({ page, pageSize }),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })

      const response = await fetch(`/api/memories?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch memories')
      }
      return response.json()
    },
    enabled: hasSession && enabled,
    staleTime: MEMORIES_STALE_TIME,
    gcTime: MEMORIES_GC_TIME,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: previousData => previousData,
  })
}

interface CreateMemoryData {
  content: string
  importance?: MemoryImportance
  tags?: string[]
}

export function useCreateMemory() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()

  return useMutation<MemoryWithId, Error, CreateMemoryData>({
    mutationFn: async data => {
      const response = await fetch('/api/memories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Failed to create memory')
      }

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.lists() })
    },
  })
}

interface UpdateMemoryData {
  id: string
  content?: string
  importance?: MemoryImportance
  tags?: string[]
}

export function useUpdateMemory() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()

  return useMutation<MemoryWithId, Error, UpdateMemoryData>({
    mutationFn: async data => {
      const { id, ...updateData } = data
      const response = await fetch(`/api/memories/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      })

      if (!response.ok) {
        throw new Error('Failed to update memory')
      }

      return response.json()
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.lists() })
      queryClient.invalidateQueries({ queryKey: memoryKeys.detail(id) })
    },
  })
}

export function useDeleteMemory() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()

  return useMutation<void, Error, string>({
    mutationFn: async id => {
      const response = await fetch(`/api/memories/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete memory')
      }
    },
    onSuccess: (_, id) => {
      queryClient.setQueryData<{ data: MemoryWithId[] }>(memoryKeys.lists(), oldData => ({
        ...oldData!,
        data: oldData?.data?.filter(memory => memory.id !== id) || [],
      }))
    },
  })
}

interface MemorySettings {
  isEnabled: boolean
  autoSave: boolean
  autoSaveFilter: 'low' | 'medium' | 'high'
  maxOutputTokens: number
}

const MEMORY_SETTINGS_STALE_TIME = 1000 * 60 * 10
const MEMORY_SETTINGS_GC_TIME = 1000 * 60 * 30

export function useMemorySettings() {
  const { data: session } = useSession()
  const hasSession = !!session?.user

  return useQuery<MemorySettings, Error>({
    queryKey: memoryKeys.settings(),
    queryFn: async () => {
      const response = await fetch('/api/memories/settings')
      if (!response.ok) {
        throw new Error('Failed to fetch memory settings')
      }
      return response.json()
    },
    enabled: hasSession,
    staleTime: MEMORY_SETTINGS_STALE_TIME,
    gcTime: MEMORY_SETTINGS_GC_TIME,
    // Only refetch when the window regains focus if data is stale
    refetchOnWindowFocus: false,
    // Don't retry failed fetches too aggressively
    retry: 1,
    // Keep previous data while refetching
    placeholderData: previousData => previousData,
  })
}

interface UpdateMemorySettingsData {
  isEnabled?: boolean
  autoSave?: boolean
  autoSaveFilter?: 'low' | 'medium' | 'high'
  maxOutputTokens?: number
}

export function useUpdateMemorySettings() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()

  return useMutation<MemorySettings, Error, UpdateMemorySettingsData>({
    mutationFn: async settings => {
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

      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: memoryKeys.settings() })
    },
  })
}
