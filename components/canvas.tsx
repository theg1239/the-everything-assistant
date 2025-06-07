"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { X, Save, FileText, Download, Edit3 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import ReactMarkdown from "react-markdown"

interface CanvasDocument {
  id?: string
  title: string
  content: string
  type: string
  createdAt?: string
  updatedAt?: string
}

interface CanvasProps {
  isOpen: boolean
  onClose: () => void
  chatId?: string
  initialDocument?: CanvasDocument
}

export function Canvas({ isOpen, onClose, chatId, initialDocument }: CanvasProps) {
  const [document, setDocument] = useState<CanvasDocument>(
    initialDocument || {
      title: "Untitled Document",
      content: "",
      type: "document",
    },
  )
  const [isEditing, setIsEditing] = useState(!initialDocument)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (initialDocument) {
      setDocument(initialDocument)
      setIsEditing(false)
    }
  }, [initialDocument])

  const saveDocument = async () => {
    if (!chatId) return

    setIsSaving(true)
    try {
      const url = document.id ? "/api/canvas" : "/api/canvas"
      const method = document.id ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: document.id,
          chatId,
          title: document.title,
          content: document.content,
          type: document.type,
        }),
      })

      if (response.ok) {
        const savedDoc = await response.json()
        if (!document.id) {
          setDocument((prev) => ({ ...prev, id: savedDoc.id }))
        }
        setIsEditing(false)
      }
    } catch (error) {
      console.error("Error saving document:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const downloadDocument = () => {
    const blob = new Blob([document.content], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${document.title}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-blue-400" />
                {isEditing ? (
                  <Input
                    value={document.title}
                    onChange={(e) => setDocument((prev) => ({ ...prev, title: e.target.value }))}
                    className="bg-transparent border-none text-lg font-medium text-white p-0 h-auto focus:ring-0"
                  />
                ) : (
                  <h2 className="text-lg font-medium text-white">{document.title}</h2>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                  className="text-slate-400 hover:text-white"
                >
                  <Edit3 className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadDocument}
                  className="text-slate-400 hover:text-white"
                >
                  <Download className="h-4 w-4" />
                </Button>

                {isEditing && (
                  <Button
                    onClick={saveDocument}
                    disabled={isSaving}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    {isSaving ? "saving..." : "save"}
                  </Button>
                )}

                <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {isEditing ? (
                <Textarea
                  value={document.content}
                  onChange={(e) => setDocument((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="Start writing your document..."
                  className="w-full h-full resize-none border-none bg-transparent text-slate-200 p-6 focus:ring-0"
                />
              ) : (
                <div className="h-full overflow-y-auto p-6">
                  <div className="prose prose-invert prose-slate max-w-none">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => <h1 className="text-2xl font-bold text-white mb-4">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-xl font-semibold text-white mb-3">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-lg font-medium text-white mb-2">{children}</h3>,
                        p: ({ children }) => <p className="text-slate-300 mb-3 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-6 mb-3 text-slate-300">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-6 mb-3 text-slate-300">{children}</ol>,
                        li: ({ children }) => <li className="mb-1">{children}</li>,
                        code: ({ children }) => (
                          <code className="bg-slate-800 px-2 py-1 rounded text-blue-300 text-sm">{children}</code>
                        ),
                        pre: ({ children }) => (
                          <pre className="bg-slate-800 p-4 rounded-lg overflow-x-auto mb-3 border border-slate-700">
                            {children}
                          </pre>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-blue-500 pl-4 italic text-slate-400 mb-3">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {document.content || "*No content yet. Click edit to start writing.*"}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
