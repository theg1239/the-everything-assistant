'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import HubShell from './hub-shell'

interface HubProps {
  isOpen: boolean
  onClose?: () => void
}

export default function Hub({ isOpen, onClose }: HubProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock background scroll and enable Esc to close while open
  useEffect(() => {
    if (!mounted) return
    const prevOverflow = document.body.style.overflow
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = prevOverflow
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mounted, isOpen, onClose])

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-start justify-center p-2 sm:p-4 md:items-center overflow-y-auto"
          onClick={e => e.target === e.currentTarget && onClose?.()}
          aria-modal="true"
          role="dialog"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 20 }}
            transition={{ duration: 0.18 }}
            className="relative bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur-xl rounded-2xl w-full max-w-6xl h-[95vh] md:h-[90vh] flex flex-col overflow-hidden shadow-2xl ring-1 ring-border/60 my-2 md:my-0"
            onClick={e => e.stopPropagation()}
          >
            {/* subtle top gradient accent */}
            <div className="pointer-events-none absolute inset-x-0 -top-32 h-32 bg-gradient-to-b from-blue-500/20 via-transparent to-transparent blur-2xl" />

            <div className="flex items-center justify-between p-2 border-b border-border/60 bg-card/60">
              <div className="px-2 text-sm font-semibold tracking-wide">hub</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0 rounded-full hover:bg-muted"
                aria-label="Close hub"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 min-h-0">
              <HubShell />
            </div>

            {/* mobile safe-area spacing */}
            <div className="h-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  if (!mounted) return null
  return createPortal(content, document.body)
}
