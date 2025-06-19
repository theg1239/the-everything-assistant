'use client'

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Clock, User, Zap, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRateLimit } from '@/components/rate-limit-context'

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
      }    } catch {
      return null
    }
  }

  const resetTimeFormatted = formatResetTime(rateLimitError.resetTime)

  const errorDisplay = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="fixed top-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:transform sm:-translate-x-1/2 z-50 w-auto sm:w-full sm:max-w-3xl"
      >
        <div className="flex gap-4 w-full bg-background/95 backdrop-blur-sm border border-orange-500/30 rounded-xl p-4 shadow-lg">
          <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-orange-500/30 bg-orange-500/10">
            <div className="translate-y-px">
              {rateLimitError.userLimit ? (
                <User className="w-4 h-4 text-orange-400" />
              ) : (
                <Zap className="w-4 h-4 text-orange-400" />
              )}
            </div>
          </div>
          
          <div className="flex flex-col gap-3 w-full">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <h3 className="text-sm font-semibold text-orange-400">
                  {rateLimitError.userLimit ? 'rate limit exceeded' : 'service rate limit exceeded'}
                </h3>
              </div>
              
              <Button
                onClick={clearRateLimitError}
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/50 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="prose prose-invert prose-sm max-w-none">
              <p className="mb-3 last:mb-0 leading-relaxed text-foreground">
                {rateLimitError.message || (rateLimitError.userLimit 
                  ? 'you have exceeded your rate limit. please wait before sending another message.'
                  : 'the service is experiencing high demand. please wait before trying again.')}
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
              {resetTimeFormatted && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>rate limit resets in {resetTimeFormatted}</span>
                </div>
              )}
              
              {rateLimitError.userLimit && (
                <div className="text-muted-foreground/80 sm:text-right">
                  try shorter messages or wait between requests
                </div>
              )}
            </div>
            
            <div className="sm:hidden">
              <Button
                onClick={clearRateLimitError}
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs bg-background/50 border-border/50 text-muted-foreground hover:bg-muted/50"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )

  return createPortal(errorDisplay, document.body)
}
