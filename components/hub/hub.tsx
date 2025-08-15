'use client'

import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import HubShell from './hub-shell'

interface HubProps {
  isOpen: boolean
  onClose?: () => void
}

export default function Hub({ isOpen, onClose }: HubProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-2 sm:p-4 md:items-center overflow-y-auto"
          onClick={e => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 20 }}
            transition={{ duration: 0.18 }}
            className="bg-background rounded-xl w-full max-w-6xl h-[95vh] md:h-[90vh] flex flex-col overflow-hidden shadow-2xl my-2 md:my-0"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-2 border-b border-border/60 bg-card">
              <div className="px-2 text-sm font-medium">hub</div>
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
