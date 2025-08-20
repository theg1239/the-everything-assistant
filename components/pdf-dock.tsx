"use client"

import React, { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { usePdfDock } from '@/contexts/pdf-dock-context'
import { X, FileSearch, ChevronDown } from 'lucide-react'

export const PdfDock: React.FC = () => {
  return null
}

export default PdfDock

export const MobilePdfDockButton: React.FC = () => {
  const { items, openPdf, removePdf } = usePdfDock()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const hasItems = items && items.length > 0

  return (
    <div ref={containerRef} className="relative md:hidden">
      <div className="flex items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={e => {
            e.stopPropagation()
            setOpen(o => !o)
          }}
          aria-expanded={open}
          title={hasItems ? `${items.length} open PDFs` : 'Open PDFs'}
          className="relative inline-flex items-center h-8 px-3 gap-2 rounded-md text-sm"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 5v4" stroke="currentColor" strokeWidth="1.5" />
          </svg>

          <span className="sr-only">Open PDFs</span>

          {hasItems && (
            <span className="absolute -top-1 -right-2 inline-flex items-center justify-center h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-medium">
              {items.length}
            </span>
          )}
        </motion.button>
      </div>

      <AnimatePresence>
        {open && hasItems && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="absolute right-0 mt-12 w-56 z-50"
            style={{ transformOrigin: 'top right' }}
          >
            <div className="bg-card border border-border rounded-xl p-2 shadow-2xl space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2">
                  <button
                    className="flex items-center gap-2 text-sm text-foreground truncate text-left flex-1 px-2 py-2 rounded-md transition-colors hover:bg-muted/40"
                    onClick={() => {
                      openPdf && openPdf(item.id)
                      setOpen(false)
                    }}
                    title={item.title || item.url}
                  >
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-muted/60 text-primary">
                      <FileSearch className="h-4 w-4" />
                    </span>
                    <span className="truncate">{item.title || 'PDF Document'}</span>
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground p-1 rounded"
                    onClick={() => removePdf && removePdf(item.id)}
                    aria-label="Close PDF"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

type DockButtonProps = {
  items: any[]
  openPdf: (id: string) => void
  removePdf: (id: string) => void
}

export const DesktopPdfDockButton: React.FC = () => {
  const { items, openPdf, removePdf } = usePdfDock()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState<string>('')
  const [showPreview, setShowPreview] = useState(false)
  const closeTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  const hasItems = items && items.length > 0

  if (!hasItems) return null

  return (
    <div ref={containerRef} className="hidden md:block relative">
      <div className="flex items-center">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={e => {
            e.stopPropagation()
            setOpen(o => !o)
          }}
          aria-expanded={open}
          title={`${items.length} open PDFs`}
          className="relative inline-flex items-center h-8 px-3 gap-2 rounded-md text-sm"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 5v4" stroke="currentColor" strokeWidth="1.5" />
          </svg>

          <span className="sr-only">Open PDFs</span>

          <span className="absolute -top-1 -right-2 inline-flex items-center justify-center h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-medium">
            {items.length}
          </span>
        </motion.button>
      </div>

      <AnimatePresence>
        {open && hasItems && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="absolute right-0 mt-10 w-72 z-50"
            style={{ transformOrigin: 'top right' }}
          >
            <div className="bg-card border border-border rounded-xl p-2 shadow-lg space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2">
                  <button
                    className="flex items-center gap-2 text-sm text-foreground truncate text-left flex-1"
                      onMouseEnter={() => {
                        if (closeTimerRef.current !== undefined) {
                          clearTimeout(closeTimerRef.current)
                          closeTimerRef.current = undefined
                        }
                        setPreviewUrl(item.url)
                        setPreviewTitle(item.title || 'PDF Document')
                        setShowPreview(true)
                      }}
                      onMouseLeave={() => {
                        if (closeTimerRef.current !== undefined) {
                          clearTimeout(closeTimerRef.current)
                        }
                        closeTimerRef.current = window.setTimeout(() => {
                          setShowPreview(false)
                          setPreviewUrl(null)
                          closeTimerRef.current = undefined
                        }, 120)
                      }}
                      onClick={() => {
                        openPdf && openPdf(item.id)
                        setOpen(false)
                      }}
                    title={item.title || item.url}
                  >
                    <FileSearch className="h-4 w-4 text-primary" />
                    <span className="truncate">{item.title || 'PDF Document'}</span>
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground p-1 rounded"
                    onClick={() => removePdf && removePdf(item.id)}
                    aria-label="Close PDF"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
        {typeof document !== 'undefined' && (
          <PreviewPortal
            show={showPreview}
            title={previewTitle}
            url={previewUrl}
            onClose={() => {
              setShowPreview(false)
              setPreviewUrl(null)
            }}
            onMouseEnter={() => {
              if (closeTimerRef.current !== undefined) {
                clearTimeout(closeTimerRef.current)
                closeTimerRef.current = undefined
              }
            }}
            onMouseLeave={() => {
              if (closeTimerRef.current !== undefined) {
                clearTimeout(closeTimerRef.current)
              }
              closeTimerRef.current = window.setTimeout(() => {
                setShowPreview(false)
                setPreviewUrl(null)
                closeTimerRef.current = undefined
              }, 120)
            }}
          />
        )}
    </div>
  )
}

  const PreviewPortal: React.FC<{
    show: boolean
    title?: string
    url?: string | null
    onClose?: () => void
    onMouseEnter?: () => void
    onMouseLeave?: () => void
  }> = ({ show, title, url, onClose, onMouseEnter, onMouseLeave }) => {
    if (!show || !url) return null

    const content = (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
        aria-hidden={!show}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 8 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="pointer-events-auto max-w-[80vw] w-[min(900px,80vw)] max-h-[80vh]"
        >
          <div className="bg-background/80 backdrop-blur-lg border border-border rounded-2xl overflow-hidden shadow-2xl ring-1 ring-black/5">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-muted/60 text-primary">
                  <FileSearch className="h-4 w-4" />
                </div>
                <div className="text-sm font-semibold truncate max-w-[60vw]">{title}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-muted-foreground hover:text-foreground p-1 rounded"
                  onClick={onClose}
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="w-full h-[70vh] bg-muted">
              <iframe src={url} title={title} className="w-full h-full border-0 bg-white" loading="lazy" />
            </div>
          </div>
        </motion.div>
      </div>
    )

    return ReactDOM.createPortal(content, document.body)
  }
