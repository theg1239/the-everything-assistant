'use client'

import type React from 'react'
import { useRef, useEffect, useCallback, memo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpIcon, StopCircleIcon, PaperclipIcon, MicIcon, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { ToolsDropdown } from '@/components/controls/tools-dropdown'

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
  onToolSelect?: (toolId: string) => void
  selectedTool?: string
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
  onToolSelect,
  selectedTool,
}: MultimodalInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [introPlayed, setIntroPlayed] = useState(false)
  const borderRef = useRef<HTMLDivElement | null>(null)
  const [borderMetrics, setBorderMetrics] = useState<{
    width: number
    height: number
    radius: number
    borderWidth: number
    borderColor: string
  } | null>(null)

  const lightenColor = (color: string, amount = 0.22) => {
    const m = color
      .replace(/\s+/g, '')
      .match(/^rgba?\((\d+),(\d+),(\d+)(?:,(\d*\.?\d+))?\)$/i)
    if (m) {
      const r = Math.min(255, Math.max(0, parseInt(m[1], 10)))
      const g = Math.min(255, Math.max(0, parseInt(m[2], 10)))
      const b = Math.min(255, Math.max(0, parseInt(m[3], 10)))
      const a = m[4] !== undefined ? Math.max(0, Math.min(1, parseFloat(m[4]))) : 1
      const nr = Math.round(r + (255 - r) * amount)
      const ng = Math.round(g + (255 - g) * amount)
      const nb = Math.round(b + (255 - b) * amount)
      return `rgba(${nr}, ${ng}, ${nb}, ${a})`
    }
    const pct = Math.round(amount * 100)
    return `color-mix(in oklab, ${color} ${100 - pct}%, white ${pct}%)`
  }

  const getPlaceholderText = () => {
    if (!selectedTool) return placeholder || 'ask anything...'

    switch (selectedTool) {
      case 'reddit-search':
        return 'search related subreddits'
      case 'vtop-query':
        return 'ask about your VTOP data (marks, attendance, timetable)'
      case 'past-papers':
        return 'find past papers for any course'
      case 'mess-menu':
        return 'ask about the mess menu'
      default:
        return placeholder || 'ask anything...'
    }
  }

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
      if ((e as any).isComposing || (e as any).keyCode === 229) return
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
  const showCharacterCount = Boolean(maxLength) && characterCount > 0
  const isNearLimit = Boolean(maxLength) && maxLength ? characterCount > maxLength * 0.8 : false
  
  useEffect(() => {
    const t = setTimeout(() => setIntroPlayed(true), 1600)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!borderRef.current) return
    const node = borderRef.current

    const compute = () => {
      if (!node) return
      const rect = node.getBoundingClientRect()
      const cs = getComputedStyle(node)
      const rStr = cs.borderTopLeftRadius || '0px'
      const bwStr = cs.borderWidth || '1px'
      const r = parseFloat(rStr) || 0
      const bw = parseFloat(bwStr) || 1
      const color = cs.borderColor || 'hsl(var(--border))'
      setBorderMetrics({ width: rect.width, height: rect.height, radius: r, borderWidth: bw, borderColor: color })
    }

    compute()
    const RO = (window as any).ResizeObserver
    const ro = RO ? new RO(() => compute()) : null
    if (ro) ro.observe(node)
    window.addEventListener('resize', compute)
    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn('relative w-full flex justify-center', className)}
    >
      <form
        onSubmit={onSubmit}
        className="relative max-w-3xl w-full px-4"
        aria-label="Chat composer"
      >
        <motion.div
          ref={borderRef}
          initial={{ borderColor: 'rgba(255, 255, 255, 0)' }}
          animate={{ borderColor: 'rgba(255, 255, 255, 0.14)' }}
          transition={{ duration: 0.9, delay: 0.1 }}
          className={cn(
            'relative flex flex-col w-full rounded-2xl bg-transparent backdrop-blur-md overflow-hidden transition-all duration-200 border',
            isFocused ? 'border-white/55' : ''
          )}
        >
          {!introPlayed && borderMetrics && (
            <motion.svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              width={borderMetrics.width}
              height={borderMetrics.height}
              viewBox={`0 0 ${borderMetrics.width} ${borderMetrics.height}`}
              preserveAspectRatio="none"
              initial={false}
            >
              {
                (() => {
                  const w = borderMetrics.width
                  const h = borderMetrics.height
                  const bw = borderMetrics.borderWidth
                  const r = Math.max(
                    0,
                    Math.min(borderMetrics.radius, Math.min(w, h) / 2 - bw)
                  )
                  const x0 = bw / 2
                  const y0 = bw / 2
                  const x1 = w - bw / 2
                  const y1 = h - bw / 2
                  const strokeColor = lightenColor(borderMetrics.borderColor, 0.25)
                  const strokeWidth = Math.max(1, bw)
                  const d = [
                    `M ${w / 2} ${y1}`,
                    `H ${x1 - r}`,
                    `A ${r} ${r} 0 0 0 ${x1} ${y1 - r}`,
                    `V ${y0 + r}`,
                    `A ${r} ${r} 0 0 0 ${x1 - r} ${y0}`,
                    `H ${x0 + r}`,
                    `A ${r} ${r} 0 0 0 ${x0} ${y0 + r}`,
                    `V ${y1 - r}`,
                    `A ${r} ${r} 0 0 0 ${x0 + r} ${y1}`,
                    `H ${w / 2}`,
                  ].join(' ')
                  return (
                    <motion.path
                      d={d}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.3, ease: 'easeOut' }}
                    />
                  )
                })()
              }
            </motion.svg>
          )}
          {' '}
          <div className="relative flex items-end w-full">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={getPlaceholderText()}
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
              aria-describedby={showCharacterCount && maxLength ? 'composer-charcount' : undefined}
            />

            <div className="flex items-end gap-2 p-2">
              {/* Tools Dropdown */}
              <ToolsDropdown onToolSelect={onToolSelect} selectedTool={selectedTool} />

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
                            className="size-10 sm:size-9 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm"
                            aria-label="Stop generating"
                          >
                            <StopCircleIcon size={16} />
                            <span className="sr-only">stop generating</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>stop generating</TooltipContent>
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
                            className="size-10 sm:size-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
                            aria-label="Send message"
                          >
                            <ArrowUpIcon size={16} />
                            <span className="sr-only">send message</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>send message</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          {/* Footer: shortcuts + character count */}
          <div className="flex items-center justify-between px-3 pb-2">
            <p className="hidden sm:block text-[10px] text-muted-foreground">
              Enter to send • Shift+Enter for newline • / to focus
            </p>
            <div
              className={cn(
                'ml-auto text-[10px] tabular-nums',
                isNearLimit ? 'text-amber-500' : 'text-muted-foreground'
              )}
              aria-live="polite"
              id="composer-charcount"
            >
              {showCharacterCount && maxLength ? `${characterCount} / ${maxLength}` : null}
            </div>
          </div>
        </motion.div>
        {/* Safe-area spacer for iOS home indicator */}
        <div className="h-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-hidden />
      </form>
    </motion.div>
  )
}

export const MultimodalInput = memo(PureMultimodalInput)
