import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function StreamingErrorDisplay({ message }: { message?: string }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!mounted) return null

  const errorDisplay = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md mx-auto bg-card/95 backdrop-blur-lg border border-border rounded-2xl shadow-2xl"
        >
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500/10 ring-1 ring-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">an error occurred</h3>
                <p className="text-sm text-muted-foreground">
                  {message || 'Please start a new chat.'}
                </p>
              </div>
            </div>
            <Button
              onClick={() => window.location.reload()}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )

  return createPortal(errorDisplay, document.body)
}
