'use client'

import React, { useEffect, useState, useRef } from 'react'
import { X, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createPortal } from 'react-dom'

interface PdfViewerProps {}

export default function PdfViewer(_: PdfViewerProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [embedUrl, setEmbedUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState<string | undefined>(undefined)
  const [isMaximized, setIsMaximized] = useState(false)
  const [height, setHeight] = useState(480)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  useEffect(() => {
    const openHandler = (e: any) => {
      const d = e?.detail || {}
      const theUrl = d.url
      const theTitle = d.title
      if (theUrl) {
        setEmbedUrl(
          String(theUrl).replace('/view?usp=sharing', '/preview').replace('/view', '/preview')
        )
        setTitle(theTitle)
        setIsLoading(true)
        setOpen(true)
        setTimeout(() => setIsLoading(false), 800)
      }
    }
    const closeHandler = () => {
      setOpen(false)
      setEmbedUrl(null)
      setTitle(undefined)
      setIsLoading(false)
    }
    window.addEventListener('pdfViewerOpen', openHandler)
    window.addEventListener('pdfViewerClose', closeHandler)
    return () => {
      window.removeEventListener('pdfViewerOpen', openHandler)
      window.removeEventListener('pdfViewerClose', closeHandler)
    }
  }, [])

  if (!open) return null

  const node = typeof window !== 'undefined' ? document.body : null

  const startDrag = (e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startH: height }
    window.addEventListener('mousemove', doDrag)
    window.addEventListener('mouseup', endDrag)
  }

  const doDrag = (ev: MouseEvent) => {
    if (!dragRef.current) return
    const delta = dragRef.current.startY - ev.clientY
    const next = Math.min(1200, Math.max(240, dragRef.current.startH + delta))
    setHeight(next)
  }

  const endDrag = () => {
    dragRef.current = null
    window.removeEventListener('mousemove', doDrag)
    window.removeEventListener('mouseup', endDrag)
  }

  const close = () => {
    setIsMaximized(false)
    const ev = new CustomEvent('pdfViewerClosed')
    window.dispatchEvent(ev)
    setOpen(false)
    setEmbedUrl(null)
    setTitle(undefined)
  }

  const body = (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
      <div
        ref={containerRef}
        style={{
          width: isMaximized ? '95%' : 'min(900px,95%)',
          height: isMaximized ? '90%' : `${height}px`,
        }}
        className={`bg-background/95 backdrop-blur shadow-xl overflow-hidden ring-1 ring-border/40 rounded-lg flex flex-col`}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sm font-medium truncate">{title || 'PDF Preview'}</div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMaximized(v => !v)}
              className="h-8 w-8"
            >
              {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={close} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0">
          {isLoading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                <p className="text-sm text-muted-foreground">Loading PDF...</p>
              </div>
            </div>
          )}
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={title || 'PDF Preview'}
              className="w-full h-full border-0 bg-white"
              allowFullScreen
              loading="lazy"
              onLoad={() => setIsLoading(false)}
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">No PDF URL available.</div>
          )}
        </div>


        {!isMaximized && (
          <div
            onMouseDown={startDrag}
            className="h-2 cursor-row-resize bg-transparent hover:bg-border/20"
            title="Drag to resize"
          />
        )}
      </div>
    </div>
  )

  return node ? createPortal(body, node) : body
}
