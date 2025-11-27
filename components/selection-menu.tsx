'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquarePlus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface SelectionMenuProps {
  containerRef: React.RefObject<HTMLElement>
  onQuote: (text: string) => void
}

export function SelectionMenu({ containerRef, onQuote }: SelectionMenuProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [selectedText, setSelectedText] = useState('')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        setPosition(null)
        setSelectedText('')
        return
      }

      const range = selection.getRangeAt(0)
      
      // Check if the selection is within the container
      if (!container.contains(range.commonAncestorContainer)) {
        // It's possible the selection starts or ends in the container but commonAncestor is higher up.
        // But for a message bubble, we usually want the selection to be fully inside or at least relevant to it.
        // Let's be strict for now.
        return
      }

      const text = selection.toString().trim()
      if (!text) {
        setPosition(null)
        setSelectedText('')
        return
      }

      const rect = range.getBoundingClientRect()
      setPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 32 // Moved significantly higher to avoid overlap
      })
      setSelectedText(text)
    }

    // Debounce or throttle could be good, but selectionchange is usually fine for this.
    document.addEventListener('selectionchange', handleSelectionChange)
    
    // Hide on scroll to prevent floating ghost menu
    const handleScroll = () => {
        if (position) {
            setPosition(null)
            window.getSelection()?.removeAllRanges()
        }
    }
    window.addEventListener('scroll', handleScroll, { capture: true })

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      window.removeEventListener('scroll', handleScroll, { capture: true })
    }
  }, [containerRef, position])

  if (!position) return null

  return createPortal(
    <AnimatePresence>
      <motion.button
        initial={{ opacity: 0, y: 5, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 5, scale: 0.95 }}
        className="fixed z-50 flex items-center gap-1.5 px-2.5 py-1.5 bg-foreground/90 text-background rounded-full shadow-xl backdrop-blur-sm text-xs font-medium cursor-pointer hover:bg-foreground transition-colors -translate-x-1/2 -translate-y-full"
        style={{
          left: position.x,
          top: position.y,
        }}
        onMouseDown={(e) => {
            e.preventDefault() // Prevent losing selection immediately
            e.stopPropagation()
            onQuote(selectedText)
            window.getSelection()?.removeAllRanges()
            setPosition(null)
        }}
      >
        <MessageSquarePlus className="w-3.5 h-3.5" />
        Ask AI
      </motion.button>
    </AnimatePresence>,
    document.body
  )
}
