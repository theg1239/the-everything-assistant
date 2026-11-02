'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Lightbulb, X, ChevronRight, ChevronLeft } from 'lucide-react'
import * as z from 'zod'
import { readJson } from '@/lib/http'

/** `POST /api/suggestions` */
const suggestionsResponseSchema = z.object({ suggestions: z.array(z.string()) })

interface FollowUpSuggestionsProps {
  lastAssistantMessage?: string
  lastUserMessage?: string
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[]
  isVisible: boolean
  onSuggestionClick: (suggestion: string) => void
  onDismiss: () => void
  isMobile?: boolean
  inline?: boolean
}

export function FollowUpSuggestions(props: FollowUpSuggestionsProps) {
  const {
    lastAssistantMessage = '',
    lastUserMessage = '',
    conversationHistory,
    isVisible,
    onSuggestionClick,
    onDismiss,
    isMobile = false,
    inline = false,
  } = props
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (lastAssistantMessage && isVisible) {
      setSuggestions([])
      generateSuggestions()
    } else if (!isVisible) {
      setSuggestions([])
    }
  }, [lastAssistantMessage, isVisible])

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const scrollLeft = container.scrollLeft
      const maxScrollLeft = container.scrollWidth - container.clientWidth

      setCanScrollLeft(scrollLeft > 0)
      setCanScrollRight(scrollLeft < maxScrollLeft)
    }
  }

  useEffect(() => {
    const container = scrollContainerRef.current
    if (container && isMobile) {
      handleScroll()

      container.addEventListener('scroll', handleScroll)

      const resizeObserver = new ResizeObserver(() => {
        handleScroll()
      })
      resizeObserver.observe(container)

      return () => {
        container.removeEventListener('scroll', handleScroll)
        resizeObserver.disconnect()
      }
    }
    return undefined
  }, [suggestions, isMobile])
  const nextSlide = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const scrollAmount = container.clientWidth * 0.7
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' })
    }
  }

  const prevSlide = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const scrollAmount = container.clientWidth * 0.7
      container.scrollBy({ left: -scrollAmount, behavior: 'smooth' })
    }
  }

  const generateSuggestions = async () => {
    setIsLoading(true)
    setSuggestions([])

    try {
      const response = await fetch('/api/suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assistantMessage: lastAssistantMessage,
          userMessage: lastUserMessage,
          conversationHistory: conversationHistory?.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (response.ok) {
        const data = await readJson(response, suggestionsResponseSchema)
        setSuggestions(data.suggestions)
      } else {
        // No suggestions on failure; the strip hides itself when the list is empty.
        console.error('Failed to fetch AI suggestions:', response.status)
      }
    } catch (error) {
      console.error('Failed to generate AI suggestions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isVisible || (suggestions.length === 0 && !isLoading)) {
    return null
  }

  if (inline && !isMobile) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="mt-4 pt-3 border-t border-border/30"
        >
          <div className="flex items-center gap-2 mb-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-xs font-medium text-muted-foreground/70">follow up</span>
            <button
              onClick={onDismiss}
              className="ml-auto p-1 rounded-md hover:bg-muted/50 transition-colors opacity-60 hover:opacity-100"
              aria-label="Dismiss suggestions"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <motion.div
                key={suggestion}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15, delay: index * 0.04 }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-sm font-normal text-muted-foreground bg-muted/40 border border-border/40 hover:bg-muted/70 hover:text-foreground hover:border-border/60 transition-all duration-150 rounded-full px-3.5 py-1.5 h-auto"
                  onClick={() => onSuggestionClick(suggestion)}
                >
                  {suggestion}
                </Button>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    )
  }

  if (isMobile) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className="w-full mb-2"
        >
          <div className="relative bg-background/95 backdrop-blur-sm border-t border-border/50">
            <div className="flex items-center gap-2 px-4 py-2">
              <ChevronRight className="h-3 w-3 text-muted-foreground/70 flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground/80">follow up</span>
              <button
                onClick={onDismiss}
                className="ml-auto p-1 rounded-md hover:bg-muted/50 transition-colors"
                aria-label="Dismiss suggestions"
              >
                <X className="h-3 w-3 text-muted-foreground/60" />
              </button>
            </div>
            <div className="relative">
              {canScrollLeft && (
                <button
                  onClick={prevSlide}
                  className="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-background/95 backdrop-blur-sm border border-border/50 hover:bg-muted/90 transition-all duration-200 shadow-md"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="h-3 w-3 text-muted-foreground" />
                </button>
              )}

              <div
                ref={scrollContainerRef}
                className="flex gap-2 px-4 pb-3 horizontal-scroll-touch"
                data-allow-touch-scroll="true"
              >
                {suggestions.map((suggestion, index) => (
                  <motion.div
                    key={suggestion}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className="flex-shrink-0"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs font-normal text-muted-foreground bg-background/90 border-border/40 hover:bg-muted/80 hover:text-foreground transition-colors rounded-full px-3 py-1 h-7 whitespace-nowrap shadow-sm active:scale-95"
                      onClick={() => onSuggestionClick(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  </motion.div>
                ))}
              </div>

              {canScrollRight && (
                <button
                  onClick={nextSlide}
                  className="absolute right-1 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-background/95 backdrop-blur-sm border border-border/50 hover:bg-muted/90 transition-all duration-200 shadow-md"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    )
  }

  // Fallback desktop mode (above input) - should not be used anymore but kept for safety
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
        className="w-full mb-3"
      >
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-muted/30 border border-border/50 rounded-lg p-3 relative">
            <button
              onClick={onDismiss}
              className="absolute top-2 right-2 p-1 rounded-md hover:bg-background/50 transition-colors"
              aria-label="Dismiss suggestions"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>

            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <motion.div
                  key={suggestion}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.15, delay: index * 0.05 }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-sm font-normal text-muted-foreground bg-background/60 border border-border/40 hover:bg-background hover:text-foreground transition-colors rounded-full px-3 py-1.5 h-auto"
                    onClick={() => onSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
