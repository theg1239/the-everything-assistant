'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Clock, User, Zap, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRateLimit } from '@/contexts/rate-limit-context'

export function RateLimitErrorDisplay() {
  const { rateLimitError, clearRateLimitError } = useRateLimit()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!mounted || !rateLimitError?.isRateLimit) return null

  const formatResetTime = (resetTime?: string) => {
    if (!resetTime) return null

    try {
      const resetDate = new Date(resetTime)
      const now = new Date()
      const diffMs = resetDate.getTime() - now.getTime()

      if (diffMs <= 0) return 'now'

      const diffMinutes = Math.ceil(diffMs / (1000 * 60))

      if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`
      } else {
        const diffHours = Math.ceil(diffMinutes / 60)
  return `${diffHours} hour${diffHours !== 1 ? 's' : ''}`
      }
    } catch {
      return null
    }
  }

  const resetTimeFormatted = formatResetTime(rateLimitError.resetTime)

  const estimated = rateLimitError.estimated ?? false

  const errorDisplay = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={clearRateLimitError}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md mx-auto bg-card/95 backdrop-blur-lg border border-border rounded-2xl shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-orange-500/10 ring-1 ring-orange-500/20">
                {rateLimitError.userLimit ? (
                  <User className="w-5 h-5 text-orange-500" />
                ) : (
                  <Zap className="w-5 h-5 text-orange-500" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">rate limit exceeded</h3>
                <p className="text-sm text-muted-foreground">
                  {rateLimitError.userLimit ? 'personal limit reached' : 'service limit reached'}
                </p>
              </div>
            </div>

            <Button
              onClick={clearRateLimitError}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="px-6 pb-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {rateLimitError.message ||
                (rateLimitError.userLimit
                  ? 'You have exceeded your rate limit. Please wait before sending another message.'
                  : 'The service is experiencing high demand. Please wait before trying again.')}
            </p>
          </div>

          {/* Reset Time and Tips Footer */}
          <div className="overflow-hidden rounded-b-2xl">
            {rateLimitError.resetTime && (
              <div className="px-6 py-3 bg-muted/30">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4 text-orange-500/70" />
                  <div>
                    <div>Rate limit resets in {resetTimeFormatted}</div>
                    {rateLimitError.resetTime && (
                      <div className="text-xs text-muted-foreground/80">
                        (at {new Date(rateLimitError.resetTime).toLocaleString()})
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {rateLimitError.userLimit && (
              <div className="px-6 py-3 border-t border-border/50 bg-muted/10">
                <p className="text-xs text-muted-foreground/80 text-center">
                  💡 try shorter messages or wait between requests
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )

  return createPortal(errorDisplay, document.body)
}
