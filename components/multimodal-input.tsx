'use client'

import type React from 'react'
import { useRef, useEffect, useCallback, memo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpIcon, StopCircleIcon, PaperclipIcon, MicIcon, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

interface MultimodalInputProps {
  input: string
  setInput: (value: string) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  placeholder?: string
  className?: string
  stop?: () => void
  maxLength?: number
  autoFocus?: boolean
  showAttachments?: boolean
}

const PureMultimodalInput = ({
  input,
  setInput,
  handleSubmit,
  isLoading,
  placeholder,
  className,
  stop,
  maxLength = 1000,
  autoFocus = true,
  showAttachments = true,
}: MultimodalInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight + 2, 200)}px`
    }
  }, [])

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = '60px'
    }
  }, [])

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight()
      if (autoFocus && window.innerWidth >= 768) {
        textareaRef.current.focus()
      }
    }
  }, [adjustHeight, autoFocus])

  useEffect(() => {
    const handleResize = () => {
      adjustHeight()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [adjustHeight])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && textareaRef.current) {
        setTimeout(adjustHeight, 100)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [adjustHeight])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      if (maxLength && value.length <= maxLength) {
        setInput(value)
        adjustHeight()
      }
    },
    [setInput, adjustHeight, maxLength]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (input.trim() && !isLoading) {
          const form = e.currentTarget.form
          if (form) {
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
            form.dispatchEvent(submitEvent)
          }
        }
      }
    },
    [input, isLoading]
  )

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (input.trim() && !isLoading) {
        handleSubmit(e)
        resetHeight()
      }
    },
    [input, isLoading, handleSubmit, resetHeight]
  )

  const characterCount = input.length
  const showCharacterCount = maxLength && characterCount > 0
  const isNearLimit = maxLength && characterCount > maxLength * 0.8
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('relative w-full flex justify-center', className)}
    >
      <form onSubmit={onSubmit} className="relative max-w-3xl w-full px-4">
        <div
          className={cn(
            'relative flex flex-col w-full rounded-2xl bg-transparent backdrop-blur-md overflow-hidden transition-all duration-200 border border-white/10',
            isFocused ? 'border-white/20' : ''
          )}
        >
          {' '}
          <div className="relative flex items-end w-full">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              className={cn(
                'min-h-[64px] max-h-[200px] w-full resize-none border-0 bg-transparent px-4 py-4 text-sm',
                'ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
                'pb-2 pt-3',
                showAttachments ? 'pt-1' : 'pt-3'
              )}
              disabled={isLoading}
              autoComplete="off"
              style={{ height: '60px' }}
              maxLength={maxLength}
              aria-label="Message input"
            />

            <div className="flex items-end p-2">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    key="stop"
                    transition={{ duration: 0.15 }}
                  >
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="sm"
                            onClick={stop}
                            className="size-9 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm"
                          >
                            <StopCircleIcon size={16} />
                            <span className="sr-only">Stop generating</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Stop generating</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    key="submit"
                    transition={{ duration: 0.15 }}
                  >
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={!input.trim() || isLoading}
                            className="size-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
                          >
                            <ArrowUpIcon size={16} />
                            <span className="sr-only">Send message</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Send message</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </form>
    </motion.div>
  )
}

export const MultimodalInput = memo(PureMultimodalInput)
