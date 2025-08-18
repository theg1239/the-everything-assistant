'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Trash2, Edit, Save, X, Plus, Search, Star, Calendar, Tag } from 'lucide-react'
import { toast } from 'sonner'

export interface Memory {
  id: string
  content: string
  importance: 1 | 2 | 3 | 4 | 5
  tags: string[]
  createdAt: string
  updatedAt: string
}

type View = 'list' | 'edit' | 'new'

export function MemoryManagement() {
  const { data: session } = useSession()
  const [view, setView] = useState<View>('list')
  const [memories, setMemories] = useState<Memory[]>([])
  const [filteredMemories, setFilteredMemories] = useState<Memory[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editingMemory, setEditingMemory] = useState<Memory | null>(null)
  const [memoryContent, setMemoryContent] = useState('')
  const [memoryImportance, setMemoryImportance] = useState<1 | 2 | 3 | 4 | 5>(3)
  const [memoryTags, setMemoryTags] = useState('')
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null)

  const {
    data: memoriesData,
    isLoading: isLoadingMemories,
    error: memoriesError,
    refetch,
  } = useQuery({
    queryKey: ['memories'],
    queryFn: async () => {
      const response = await fetch('/api/memories')
      if (!response.ok) {
        throw new Error('Failed to fetch memories')
      }
      return response.json()
    },
    enabled: !!session?.user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (memoriesData) {
      setMemories(memoriesData)
      setFilteredMemories(memoriesData)
    }
  }, [memoriesData])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredMemories(memories)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = memories.filter(
      memory =>
        memory.content.toLowerCase().includes(query) ||
        memory.tags.some(tag => tag.toLowerCase().includes(query))
    )
    setFilteredMemories(filtered)
  }, [searchQuery, memories])

  useEffect(() => {
    setIsLoading(isLoadingMemories)
  }, [isLoadingMemories])

  useEffect(() => {
    if (memoriesError) {
      setError(memoriesError.message)
      toast.error('Failed to load memories')
    }
  }, [memoriesError])

  const refreshMemories = useCallback(() => {
    refetch()
  }, [refetch])

  const handleDeleteMemory = async (id: string) => {
    if (deletingMemoryId === id) {
      // Confirm delete
      try {
        setIsLoading(true)
        const response = await fetch(`/api/memories/${id}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          throw new Error('Failed to delete memory')
        }

        toast.success('Memory deleted')
        setDeletingMemoryId(null)
        await refreshMemories()
      } catch (err: any) {
        toast.error(err.message)
      } finally {
        setIsLoading(false)
      }
    } else {
      // Show confirmation
      setDeletingMemoryId(id)
      // Auto-cancel confirmation after 3 seconds
      setTimeout(() => {
        setDeletingMemoryId(null)
      }, 3000)
    }
  }

  const handleEditMemory = (memory: Memory) => {
    setEditingMemory(memory)
    setMemoryContent(memory.content)
    setMemoryImportance(memory.importance)
    setMemoryTags(memory.tags.join(', '))
    setView('edit')
  }

  const handleNewMemory = () => {
    setEditingMemory(null)
    setMemoryContent('')
    setMemoryImportance(3)
    setMemoryTags('')
    setView('new')
  }

  const handleSaveMemory = async () => {
    if (!memoryContent.trim()) {
      toast.error('Memory content cannot be empty')
      return
    }

    const memoryData = {
      content: memoryContent,
      importance: memoryImportance,
      tags: memoryTags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean),
    }

    try {
      setIsLoading(true)
      const url = editingMemory ? `/api/memories/${editingMemory.id}` : '/api/memories'

      const method = editingMemory ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(memoryData),
      })

      if (!response.ok) {
        throw new Error(editingMemory ? 'Failed to update memory' : 'Failed to create memory')
      }

      toast.success(editingMemory ? 'Memory updated' : 'Memory saved')
      setView('list')
      await refreshMemories()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const renderStars = (
    importance: number,
    interactive = false,
    onClick?: (level: number) => void
  ) => {
    return Array(5)
      .fill(0)
      .map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 transition-colors ${
            i < importance
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-gray-300 hover:text-yellow-300'
          } ${interactive ? 'cursor-pointer' : ''}`}
          onClick={() => interactive && onClick && onClick(i + 1)}
        />
      ))
  }

  const getImportanceLabel = (level: number) => {
    const labels = {
      1: 'very low',
      2: 'low',
      3: 'medium',
      4: 'high',
      5: 'very high',
    }
    return labels[level as keyof typeof labels]
  }

  // Render list view
  if (view === 'list') {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold">your memories</h2>
              <p className="text-sm text-muted-foreground mt-1">
                manage your personal knowledge and important information
              </p>
            </div>
            <Button
              onClick={handleNewMemory}
              className="w-full sm:w-auto flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden xs:inline">new memory</span>
              <span className="xs:hidden">new</span>
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="search memories and tags..."
              className="pl-10 bg-background/30"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">loading memories...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex justify-center py-12">
              <div className="text-center">
                <p className="text-sm text-destructive mb-2">{error}</p>
                <Button variant="outline" size="sm" onClick={refreshMemories}>
                  try again
                </Button>
              </div>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="flex justify-center py-12">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <Star className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-medium mb-2">
                  {searchQuery ? 'no matching memories found' : 'no memories yet'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery
                    ? 'try adjusting your search terms or browse all memories'
                    : 'create your first memory to start building your personal knowledge base'}
                </p>
                {searchQuery ? (
                  <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                    show all memories
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleNewMemory}>
                    <Plus className="w-4 h-4 mr-2" />
                    create memory
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {filteredMemories.length} of {memories.length} memories
                </p>
              </div>

              <div className="grid gap-4 max-h-none md:max-h-[60vh] md:overflow-y-auto pr-2">
                {filteredMemories.map(memory => (
                  <motion.div
                    key={memory.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-border/50 rounded-lg p-4 sm:p-6 bg-background/30 hover:bg-background/50 transition-all duration-200"
                  >
                    <div className="flex flex-col gap-4">
                      {/* Content */}
                      <div className="flex-1">
                        <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                          {memory.content}
                        </p>
                      </div>

                      {/* Tags */}
                      {memory.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {memory.tags.map(tag => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full"
                            >
                              <Tag className="w-3 h-3" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 pt-2 border-t border-border/50">
                        <div className="flex flex-col xs:flex-row xs:items-center gap-3">
                          <div className="flex items-center gap-2">
                            <div className="flex">{renderStars(memory.importance)}</div>
                            <span className="text-xs text-muted-foreground">
                              {getImportanceLabel(memory.importance)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {new Date(memory.updatedAt).toLocaleDateString()}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditMemory(memory)}
                            className="flex items-center gap-2"
                          >
                            <Edit className="h-4 w-4" />
                            <span className="hidden xs:inline">edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMemory(memory.id)}
                            className={`flex items-center gap-2 ${
                              deletingMemoryId === memory.id
                                ? 'bg-destructive/10 border-destructive/30 text-destructive'
                                : 'text-destructive hover:text-destructive'
                            }`}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="hidden xs:inline">
                              {deletingMemoryId === memory.id ? 'confirm?' : 'delete'}
                            </span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    )
  }

  // Render edit/new form
  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold">
              {editingMemory ? 'edit memory' : 'new memory'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {editingMemory
                ? 'update your memory content and settings'
                : 'add a new piece of information to remember'}
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => setView('list')}
            className="w-full sm:w-auto flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            cancel
          </Button>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Content */}
          <div className="space-y-3">
            <Label htmlFor="content" className="text-sm font-medium">
              content
            </Label>
            <Textarea
              id="content"
              value={memoryContent}
              onChange={e => setMemoryContent(e.target.value)}
              placeholder="what would you like me to remember..."
              className="min-h-[120px] bg-background/30 text-sm sm:text-base resize-y"
              rows={6}
            />
          </div>

          {/* Importance */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">importance level</Label>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex">
                  {renderStars(memoryImportance, true, level =>
                    setMemoryImportance(level as 1 | 2 | 3 | 4 | 5)
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {getImportanceLabel(memoryImportance)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                higher importance memories will be prioritized when recalling information
              </p>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-3">
            <Label htmlFor="tags" className="text-sm font-medium">
              tags
            </Label>
            <Input
              id="tags"
              value={memoryTags}
              onChange={e => setMemoryTags(e.target.value)}
              placeholder="e.g., personal, work, important"
              className="bg-background/30 text-sm sm:text-base"
            />
            <p className="text-xs text-muted-foreground">
              separate multiple tags with commas to help organize and search your memories
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col xs:flex-row gap-3 pt-6 border-t border-border">
          <Button
            onClick={handleSaveMemory}
            disabled={!memoryContent.trim() || isLoading}
            className="w-full xs:w-auto flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : editingMemory ? (
              <Save className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {editingMemory ? 'update memory' : 'save memory'}
          </Button>

          <Button variant="outline" onClick={() => setView('list')} className="w-full xs:w-auto">
            cancel
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
