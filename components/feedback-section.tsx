'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useSession } from 'next-auth/react'
import { Loader2, MessageSquarePlus, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

interface KnowledgeChunk {
  id: number
  chunk: string
  metadata: any
}

type View = 'menu' | 'contribute' | 'feedback'

export function FeedbackSection() {
  const { data: session } = useSession()
  const [view, setView] = useState<View>('menu')
  const [knowledgeChunks, setKnowledgeChunks] = useState<KnowledgeChunk[]>([])
  const [editedChunks, setEditedChunks] = useState<Record<number, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [feedbackTitle, setFeedbackTitle] = useState('')
  const [feedbackBody, setFeedbackBody] = useState('')
  const [newChunks, setNewChunks] = useState<string[]>([])
  const [allChunksText, setAllChunksText] = useState('')

  const handleFetchAndSetView = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/knowledge')
      if (!response.ok) {
        throw new Error('Failed to fetch knowledge base.')
      }
      const data = await response.json()
      setKnowledgeChunks(data)
      const combinedText = data
        .map((chunk: KnowledgeChunk) => chunk.chunk.trim())
        .join('\n\n---\n\n')
      setAllChunksText(combinedText)
      setView('contribute')
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleChunkChange = (id: number, content: string) => {
    setEditedChunks(prev => ({ ...prev, [id]: content }))
  }

  const updateEditedChunksFromText = useCallback(
    (text: string) => {
      const chunks = text
        .split(/\n\s*---\s*\n/)
        .map(chunk => chunk.trim())
        .filter(chunk => chunk.length > 0)

      const newEditedChunks: Record<number, string> = {}
      knowledgeChunks.forEach((originalChunk, index) => {
        if (chunks[index] !== undefined && chunks[index] !== originalChunk.chunk.trim()) {
          newEditedChunks[originalChunk.id] = chunks[index]
        }
      })

      setEditedChunks(newEditedChunks)
    },
    [knowledgeChunks]
  )

  const handleAllChunksChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value
      setAllChunksText(newText)

      const timeoutId = setTimeout(() => {
        updateEditedChunksFromText(newText)
      }, 300) // 300ms debounce

      return () => clearTimeout(timeoutId)
    },
    [updateEditedChunksFromText]
  )

  const handleAddChunk = () => {
    setNewChunks(prev => [...prev, ''])
  }

  const handleNewChunkChange = (index: number, value: string) => {
    const updated = [...newChunks]
    updated[index] = value
    setNewChunks(updated)
  }

  const handleRemoveNewChunk = (index: number) => {
    setNewChunks(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmitContribution = async () => {
    setIsSubmitting(true)
    const changedChunks = Object.entries(editedChunks).map(([id, content]) => {
      const originalChunk = knowledgeChunks.find(c => String(c.id) === id)
      return {
        id,
        original: originalChunk?.chunk,
        new: content,
        metadata: originalChunk?.metadata,
      }
    })

    const editedChunksBody =
      changedChunks.length > 0
        ? `### Edited Chunks\n\n${changedChunks
            .map(
              (c, index) =>
                `**Knowledge #${index + 1} (ID: ${c.id})**\n*Metadata: ${JSON.stringify(
                  c.metadata
                )}*\n\n**--- Original ---**\n${c.original}\n\n**--- New ---**\n${c.new}`
            )
            .join('\n\n---\n')}`
        : ''

    const newChunksBody =
      newChunks.filter(c => c.trim() !== '').length > 0
        ? `### New Knowledge Suggestions\n\n${newChunks
            .filter(c => c.trim() !== '')
            .map((c, index) => `**Suggestion #${index + 1}**\n${c}`)
            .join('\n\n---\n')}`
        : ''

    const body = [editedChunksBody, newChunksBody].filter(Boolean).join('\n\n<br/>\n\n')

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'contribution',
          contribution: { title: 'Knowledge Base Update', body },
          user: session?.user,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit contribution.')

      const result = await response.json()
      toast.success('Contribution submitted!', {
        description: `Track your contribution on GitHub: ${result.issueUrl}`,
      })
      setEditedChunks({})
      setView('menu')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitFeedback = async () => {
    if (!feedbackTitle || !feedbackBody) {
      toast.error('Please fill out both the title and description.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'feedback',
          title: feedbackTitle,
          body: feedbackBody,
          user: session?.user,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit feedback.')

      const result = await response.json()
      toast.success('Feedback submitted!', {
        description: `Track your feedback on GitHub: ${result.issueUrl}`,
      })
      setFeedbackTitle('')
      setFeedbackBody('')
      setView('menu')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderContent = () => {
    switch (view) {
      case 'contribute':
        return (
          <motion.div
            key="contribute"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold">contribute to knowledge base</h3>
              <div className="flex flex-col xs:flex-row gap-2">
                <Button
                  size="sm"
                  onClick={handleSubmitContribution}
                  disabled={
                    isSubmitting ||
                    (Object.keys(editedChunks).length === 0 &&
                      newChunks.every(c => c.trim() === ''))
                  }
                  className="w-full xs:w-auto"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  <span className="hidden xs:inline">submit contribution</span>
                  <span className="xs:hidden">submit</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setView('menu')}
                  className="w-full xs:w-auto"
                >
                  back
                </Button>
              </div>
            </div>

            <div className="space-y-8">

              <div className="space-y-4">
                <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3">
                  <h4 className="font-medium text-base sm:text-lg">suggest new knowledge</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddChunk}
                    className="w-full xs:w-auto flex items-center justify-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="xs:hidden">add suggestion</span>
                  </Button>
                </div>

                {newChunks.map((chunk, index) => (
                  <div
                    key={index}
                    className="space-y-3 p-4 border border-border rounded-lg bg-background/30"
                  >
                    <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2">
                      <Label htmlFor={`new-chunk-${index}`} className="text-sm font-medium">
                        suggestion #{index + 1}
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveNewChunk(index)}
                        className="w-full xs:w-auto flex items-center justify-center gap-2 text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                        <span className="xs:hidden">remove</span>
                      </Button>
                    </div>
                    <Textarea
                      id={`new-chunk-${index}`}
                      value={chunk}
                      onChange={e => handleNewChunkChange(index, e.target.value)}
                      placeholder="add a new piece of knowledge..."
                      rows={4}
                      className="text-sm bg-background/50 min-h-[100px] resize-y"
                    />
                  </div>
                ))}
              </div>


              {knowledgeChunks.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-medium text-base sm:text-lg">edit existing knowledge</h4>
                  <div className="space-y-3 p-4 border border-border rounded-lg bg-background/30">
                    <Label htmlFor="all-chunks" className="text-sm font-medium block">
                      knowledge base
                    </Label>
                    <Textarea
                      id="all-chunks"
                      value={allChunksText}
                      onChange={handleAllChunksChange}
                      rows={20}
                      className="text-sm bg-background/50 min-h-[400px] resize-y font-mono"
                      placeholder="Edit all knowledge chunks here..."
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )

      case 'feedback':
        return (
          <motion.div
            key="feedback"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <h3 className="text-xl sm:text-2xl font-semibold">submit feedback</h3>
              <div className="flex flex-col xs:flex-row gap-2">
                <Button
                  size="sm"
                  onClick={handleSubmitFeedback}
                  disabled={isSubmitting || !feedbackTitle || !feedbackBody}
                  className="w-full xs:w-auto"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
                  <span className="hidden xs:inline">submit feedback</span>
                  <span className="xs:hidden">submit</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setView('menu')}
                  className="w-full xs:w-auto"
                >
                  back
                </Button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="feedback-title" className="text-sm font-medium">
                  title
                </Label>
                <Input
                  id="feedback-title"
                  placeholder="e.g., issue with chat history"
                  value={feedbackTitle}
                  onChange={e => setFeedbackTitle(e.target.value)}
                  className="bg-background/30 text-sm sm:text-base"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="feedback-body" className="text-sm font-medium">
                  description
                </Label>
                <Textarea
                  id="feedback-body"
                  placeholder="please provide as much detail as possible..."
                  rows={8}
                  value={feedbackBody}
                  onChange={e => setFeedbackBody(e.target.value)}
                  className="bg-background/30 text-sm sm:text-base min-h-[200px] resize-y"
                />
              </div>
            </div>
          </motion.div>
        )

      case 'menu':
      default:
        return (
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            <div className="space-y-6">
              <div>
                <h3 className="text-xl sm:text-2xl font-semibold mb-6">feedback & contributions</h3>
                <div className="space-y-4">

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border">
                    <div className="flex items-start sm:items-center gap-3">
                      <MessageSquarePlus className="w-4 h-4 flex-shrink-0 mt-0.5 sm:mt-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm md:text-base">
                          contribute to knowledge base
                        </p>
                        <p className="text-xs md:text-sm text-muted-foreground">
                          suggest edits to improve the assistant's knowledge and help make it more
                          accurate
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFetchAndSetView}
                      disabled={isLoading}
                      className="w-full sm:w-auto flex-shrink-0"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          loading...
                        </>
                      ) : (
                        'contribute'
                      )}
                    </Button>
                  </div>


                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg border border-border">
                    <div className="flex items-start sm:items-center gap-3">
                      <MessageSquarePlus className="w-4 h-4 flex-shrink-0 mt-0.5 sm:mt-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm md:text-base">submit feedback</p>
                        <p className="text-xs md:text-sm text-muted-foreground">
                          report an issue, request a new feature, or share your thoughts on
                          improvements
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setView('feedback')}
                      className="w-full sm:w-auto flex-shrink-0"
                    >
                      submit feedback
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )
    }
  }

  return <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">{renderContent()}</div>
}
