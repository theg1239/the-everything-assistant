'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { X, Save, FileText, Download, Edit3, Copy, RefreshCw, FileDown, Type, Code, List, Bold, Italic, Link2, Plus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import { toast } from 'sonner'

interface CanvasDocument {
  id?: string
  title: string
  content: string
  type: string
  createdAt?: string
  updatedAt?: string
  created_at?: string
  updated_at?: string
}

interface CanvasProps {
  isOpen: boolean
  onClose?: () => void
  chatId?: string
  initialDocument?: CanvasDocument
}

function CanvasContent({ isOpen, onClose, chatId, initialDocument }: CanvasProps) {
  const [document, setDocument] = useState<CanvasDocument>(
    initialDocument || {
      title: 'Untitled Document',
      content: '',
      type: 'document',
    }
  )
  const [isEditing, setIsEditing] = useState(!initialDocument)
  const [isSaving, setIsSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit')
  const [existingDocuments, setExistingDocuments] = useState<CanvasDocument[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  useEffect(() => {
    if (isOpen && chatId && !initialDocument) {
      setIsLoading(true)
      fetch(`/api/canvas?chatId=${chatId}`)
        .then(res => res.json())
        .then((docs: CanvasDocument[]) => {
          setExistingDocuments(docs)
          setTimeout(() => {
            if (docs.length > 0) {
              const mostRecent = docs[0]
              setDocument(mostRecent)
              setSelectedDocumentId(mostRecent.id!)
              setIsEditing(false)
              setViewMode('preview')
            }
            setIsLoading(false)
          }, 100)
        })
        .catch(error => {
          console.error('Error loading canvas documents:', error)
          toast.error('Failed to load documents')
          setIsLoading(false)
        })
    }
  }, [isOpen, chatId, initialDocument])

  useEffect(() => {
    if (initialDocument) {
      setDocument(initialDocument)
      setIsEditing(false)
      setViewMode('preview')
      setSelectedDocumentId(null)
    }
  }, [initialDocument])

  const saveDocument = useCallback(async () => {
    if (!chatId) return

    setIsSaving(true)
    try {
      const url = '/api/canvas'
      const method = document.id ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: document.id,
          chatId,
          title: document.title,
          content: document.content,
          type: document.type,        }),
      })

      if (response.ok) {
        const savedDoc = await response.json()
        if (!document.id) {
          setDocument(prev => ({ ...prev, id: savedDoc.id }))
          setSelectedDocumentId(savedDoc.id)
        }
        
        // Refresh the documents list
        if (chatId) {
          fetch(`/api/canvas?chatId=${chatId}`)
            .then(res => res.json())
            .then((docs: CanvasDocument[]) => {
              setExistingDocuments(docs)
            })
            .catch(error => console.error('Error refreshing documents:', error))
        }
        
        toast.success('Document saved successfully!')
      } else {
        toast.error('Failed to save document')
      }
    } catch (error) {
      console.error('Error saving document:', error)
      toast.error('Error saving document')    } finally {
      setIsSaving(false)
    }
  }, [chatId, document])

  const createNewDocument = useCallback(() => {
    const newDoc = {
      title: 'Untitled Document',
      content: '',
      type: 'document',
    }
    setDocument(newDoc)
    setSelectedDocumentId(null)
    setIsEditing(true)
    setViewMode('edit')
    toast.success('New document created')
  }, [])

  const loadDocument = useCallback((doc: CanvasDocument) => {
    setDocument(doc)
    setSelectedDocumentId(doc.id!)
    setIsEditing(false)
    setViewMode('preview')
  }, [])

  const downloadDocument = useCallback(() => {
    const blob = new Blob([document.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = window.document.createElement('a')
    a.href = url
    a.download = `${document.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`
    window.document.body.appendChild(a)
    a.click()
    window.document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Document downloaded!')
  }, [document])

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(document.content)
    toast.success('Content copied to clipboard!')
  }, [document.content])
  const insertMarkdown = useCallback((syntax: string) => {
    const textarea = window.document.querySelector('textarea')
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = document.content
    const before = text.substring(0, start)
    const selected = text.substring(start, end)
    const after = text.substring(end)

    let newText = ''
    let newCursorPos = start

    switch (syntax) {
      case 'bold':
        newText = `${before}**${selected || 'bold text'}**${after}`
        newCursorPos = start + 2 + (selected || 'bold text').length + 2
        break
      case 'italic':
        newText = `${before}*${selected || 'italic text'}*${after}`
        newCursorPos = start + 1 + (selected || 'italic text').length + 1
        break
      case 'code':
        newText = `${before}\`${selected || 'code'}\`${after}`
        newCursorPos = start + 1 + (selected || 'code').length + 1
        break
      case 'link':
        newText = `${before}[${selected || 'link text'}](url)${after}`
        newCursorPos = start + (selected ? selected.length + 3 : 12)
        break
      case 'heading':
        newText = `${before}## ${selected || 'Heading'}${after}`
        newCursorPos = start + 3 + (selected || 'Heading').length
        break
      case 'list':
        newText = `${before}- ${selected || 'List item'}${after}`
        newCursorPos = start + 2 + (selected || 'List item').length
        break
      default:
        return
    }

    setDocument(prev => ({ ...prev, content: newText }))
    
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }, [document.content])
  const handleClose = useCallback(() => {
    onClose?.()
  }, [onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-background border border-border rounded-xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border bg-card">
              <div className="flex items-center space-x-3 flex-1">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <Input
                    value={document.title}
                    onChange={e => setDocument(prev => ({ ...prev, title: e.target.value }))}
                    className="bg-transparent border-none text-lg font-semibold text-foreground p-0 h-auto focus:ring-0 focus:border-none"
                    placeholder="Document title..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {document.content.length} characters • {document.content.split(/\s+/).filter(Boolean).length} words
                  </p>                </div>
              </div>

              {/* {!initialDocument && existingDocuments.length > 0 && (
                <div className="flex items-center space-x-2 mx-4">
                  <select 
                    value={selectedDocumentId || ''}
                    onChange={(e) => {
                      const docId = e.target.value
                      if (docId) {
                        const doc = existingDocuments.find(d => d.id === docId)
                        if (doc) loadDocument(doc)
                      }
                    }}
                    className="bg-muted border border-border rounded px-2 py-1 text-sm"
                  >
                    <option value="">Select Document</option>
                    {existingDocuments.map(doc => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title} - {new Date(doc.createdAt || doc.created_at || '').toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={createNewDocument}
                    className="h-8 px-3"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    New
                  </Button>
                </div>
              )} */}

              {/* Loading Indicator
              {isLoading && (
                <div className="flex items-center space-x-2 mx-4">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading documents...</span>
                </div>
              )} */}

              <div className="flex items-center space-x-1 mx-4">
                <Button
                  variant={viewMode === 'edit' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('edit')}
                  className="h-8 px-3"
                >
                  <Edit3 className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant={viewMode === 'preview' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('preview')}
                  className="h-8 px-3"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Preview
                </Button>
                <Button
                  variant={viewMode === 'split' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('split')}
                  className="h-8 px-3"
                >
                  <List className="h-3 w-3 mr-1" />
                  Split
                </Button>
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyToClipboard}
                  className="h-8 px-3 text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadDocument}
                  className="h-8 px-3 text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Export
                </Button>

                {chatId && (
                  <Button
                    onClick={saveDocument}
                    disabled={isSaving}
                    size="sm"
                    className="h-8 px-3 bg-primary hover:bg-primary/90"
                  >
                    <Save className="h-3 w-3 mr-1" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {(viewMode === 'edit' || viewMode === 'split') && (
              <div className="flex items-center space-x-1 p-2 border-b border-border bg-muted/30">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertMarkdown('bold')}
                  className="h-7 w-7 p-0"
                  title="Bold"
                >
                  <Bold className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertMarkdown('italic')}
                  className="h-7 w-7 p-0"
                  title="Italic"
                >
                  <Italic className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertMarkdown('code')}
                  className="h-7 w-7 p-0"
                  title="Code"
                >
                  <Code className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertMarkdown('link')}
                  className="h-7 w-7 p-0"
                  title="Link"
                >
                  <Link2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertMarkdown('heading')}
                  className="h-7 w-7 p-0"
                  title="Heading"
                >
                  <Type className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => insertMarkdown('list')}
                  className="h-7 w-7 p-0"
                  title="List"
                >
                  <List className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
              {viewMode === 'edit' && (
                <Textarea
                  value={document.content}
                  onChange={e => setDocument(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Start writing your document... You can use Markdown syntax for formatting."
                  className="w-full h-full resize-none border-none bg-transparent text-foreground p-6 focus:ring-0 font-mono text-sm leading-relaxed"
                />
              )}

              {viewMode === 'preview' && (                <div className="h-full overflow-y-auto p-6 bg-muted/20">
                  <div className="prose prose-slate dark:prose-invert max-w-none">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => (
                          <h1 className="text-3xl font-bold text-foreground mb-6 pb-2 border-b border-border">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-2xl font-semibold text-foreground mb-4 mt-8">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-xl font-medium text-foreground mb-3 mt-6">{children}</h3>
                        ),
                        p: ({ children }) => (
                          <p className="text-foreground mb-4 leading-relaxed">{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc pl-6 mb-4 text-foreground space-y-1">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal pl-6 mb-4 text-foreground space-y-1">{children}</ol>
                        ),
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        code: ({ children }) => (
                          <code className="bg-muted px-2 py-1 rounded text-sm font-mono border">
                            {children}
                          </code>
                        ),
                        pre: ({ children }) => (
                          <pre className="bg-muted p-4 rounded-lg overflow-x-auto mb-4 border border-border">
                            <code className="text-sm font-mono">{children}</code>
                          </pre>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground mb-4 bg-muted/50 py-2 rounded-r">
                            {children}
                          </blockquote>
                        ),
                        a: ({ children, href }) => (
                          <a href={href} className="text-primary hover:text-primary/80 underline" target="_blank" rel="noopener noreferrer">
                            {children}
                          </a>
                        ),
                        table: ({ children }) => (
                          <div className="overflow-x-auto mb-4">
                            <table className="min-w-full divide-y divide-border">{children}</table>
                          </div>
                        ),
                        th: ({ children }) => (
                          <th className="px-4 py-2 bg-muted text-left text-sm font-medium text-foreground">{children}</th>
                        ),
                        td: ({ children }) => (
                          <td className="px-4 py-2 text-sm text-foreground border-t border-border">{children}</td>
                        ),
                      }}
                    >
                      {document.content || '*No content yet. Switch to edit mode to start writing.*'}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {viewMode === 'split' && (
                <div className="flex h-full">
                  <div className="w-1/2 border-r border-border">
                    <Textarea
                      value={document.content}
                      onChange={e => setDocument(prev => ({ ...prev, content: e.target.value }))}
                      placeholder="Start writing your document..."
                      className="w-full h-full resize-none border-none bg-transparent text-foreground p-4 focus:ring-0 font-mono text-sm leading-relaxed"
                    />
                  </div>                  <div className="w-1/2 overflow-y-auto p-4 bg-muted/20">
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      <ReactMarkdown
                        components={{
                        h1: ({ children }) => (
                          <h1 className="text-2xl font-bold text-foreground mb-4 pb-2 border-b border-border">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-xl font-semibold text-foreground mb-3 mt-6">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-lg font-medium text-foreground mb-2 mt-4">{children}</h3>
                        ),
                        p: ({ children }) => (
                          <p className="text-foreground mb-3 leading-relaxed text-sm">{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc pl-4 mb-3 text-foreground text-sm">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal pl-4 mb-3 text-foreground text-sm">{children}</ol>
                        ),
                        li: ({ children }) => <li className="mb-1">{children}</li>,
                        code: ({ children }) => (
                          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono border">
                            {children}
                          </code>
                        ),
                        pre: ({ children }) => (
                          <pre className="bg-muted p-3 rounded overflow-x-auto mb-3 border border-border">
                            <code className="text-xs font-mono">{children}</code>
                          </pre>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-primary pl-3 italic text-muted-foreground mb-3 text-sm">
                            {children}
                          </blockquote>                        ),
                      }}
                    >
                      {document.content || '*No content yet...*'}
                    </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Canvas(props: CanvasProps) {
  return <CanvasContent {...props} />
}
