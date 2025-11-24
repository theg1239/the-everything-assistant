'use client'

import type React from 'react'
import { useRef, useEffect, useCallback, memo, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpIcon, StopCircleIcon, PaperclipIcon, MicIcon, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { ToolsDropdown } from '@/components/tools-dropdown'
import { getAutocompleteSuggestionAction } from '@/app/actions/autocomplete'

interface MultimodalInputProps {
  input: string
  setInput: (value: string) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  lastPrompt?: string
  promptHistory?: string[]
  placeholder?: string
  className?: string
  stop?: () => void
  maxLength?: number
  autoFocus?: boolean
  showAttachments?: boolean
  onToolSelect?: (toolId: string) => void
  selectedTool?: string
  recentMessages?: { role: 'user' | 'assistant'; content: string }[]
  disabled?: boolean
}

const PureMultimodalInput = ({
  input,
  setInput,
  handleSubmit,
  isLoading,
  lastPrompt,
  promptHistory = [],
  placeholder,
  className,
  stop,
  maxLength = 1000,
  autoFocus = true,
  showAttachments = true,
  onToolSelect,
  selectedTool,
  recentMessages = [],
  disabled = false,
}: MultimodalInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [introPlayed, setIntroPlayed] = useState(false)
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [ghostSuggestion, setGhostSuggestion] = useState('')
  const [, startSuggestionTransition] = useTransition()
  const borderRef = useRef<HTMLDivElement | null>(null)
  const suggestionRequestRef = useRef(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [borderMetrics, setBorderMetrics] = useState<{
    width: number
    height: number
    radius: number
    borderWidth: number
    borderColor: string
  } | null>(null)

  const lightenColor = (color: string, amount = 0.22) => {
    const m = color.replace(/\s+/g, '').match(/^rgba?\((\d+),(\d+),(\d+)(?:,(\d*\.?\d+))?\)$/i)
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
      case 'web-search':
        return 'search the web for the latest info'
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

  const safeInput = input ?? ''
  const inputDisabled = disabled || isLoading

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
      if (inputDisabled) return
      const value = e.target.value
      if (maxLength && value.length <= maxLength) {
        setInput(value)
        // Clear ghost suggestion immediately on input change to avoid stale suggestions
        setGhostSuggestion('')
        // Cancel any pending autocomplete request
        suggestionRequestRef.current++
        adjustHeight()
      }
    },
    [setInput, adjustHeight, maxLength, inputDisabled]
  )

  const acceptSuggestion = useCallback(() => {
    if (!ghostSuggestion) return
    const nextValue = `${safeInput}${ghostSuggestion}`
    setInput(nextValue)
    setGhostSuggestion('')
    requestAnimationFrame(() => {
      adjustHeight()
      const el = textareaRef.current
      if (el) {
        const len = nextValue.length
        el.selectionStart = len
        el.selectionEnd = len
        el.focus()
      }
    })
  }, [ghostSuggestion, safeInput, setInput, adjustHeight])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (inputDisabled) return
      if ((e as any).isComposing || (e as any).keyCode === 229) return

      const caretAtEnd =
        textareaRef.current &&
        textareaRef.current.selectionStart === safeInput.length &&
        textareaRef.current.selectionEnd === safeInput.length

      const isTabAccept = e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey
      const isArrowAccept =
        e.key === 'ArrowRight' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey

      if (ghostSuggestion && caretAtEnd && (isTabAccept || isArrowAccept)) {
        e.preventDefault()
        acceptSuggestion()
        return
      }

      if (
        e.key === 'ArrowUp' &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        promptHistory.length > 0
      ) {
        e.preventDefault()
        const baseline = historyIndex < 0 && input.trim() ? promptHistory.length : historyIndex
        const nextIndex = baseline < 0 ? promptHistory.length - 1 : Math.max(0, baseline - 1)
        const nextValue = promptHistory[nextIndex] ?? lastPrompt ?? ''
        setHistoryIndex(nextIndex)
        setInput(nextValue)
        requestAnimationFrame(() => {
          adjustHeight()
          const el = textareaRef.current
          if (el) {
            const len = nextValue.length
            el.selectionStart = len
            el.selectionEnd = len
            el.focus()
          }
        })
        return
      }

      if (
        e.key === 'ArrowDown' &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        promptHistory.length > 0
      ) {
        e.preventDefault()
        const nextIndex = historyIndex < 0 ? -1 : historyIndex + 1
        if (nextIndex >= promptHistory.length) {
          setHistoryIndex(-1)
          setInput('')
          requestAnimationFrame(() => {
            adjustHeight()
            textareaRef.current?.focus()
          })
          return
        }
        const nextValue = promptHistory[nextIndex] ?? ''
        setHistoryIndex(nextIndex)
        setInput(nextValue)
        requestAnimationFrame(() => {
          adjustHeight()
          const el = textareaRef.current
          if (el) {
            const len = nextValue.length
            el.selectionStart = len
            el.selectionEnd = len
            el.focus()
          }
        })
        return
      }

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
    [
      input,
      isLoading,
      lastPrompt,
      promptHistory,
      historyIndex,
      adjustHeight,
      setInput,
      ghostSuggestion,
      safeInput,
      acceptSuggestion,
      inputDisabled,
    ]
  )

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      if (inputDisabled) return
      if (input.trim() && !isLoading) {
        handleSubmit(e)
        setInput('')
        setGhostSuggestion('')
        resetHeight()
      }
    },
    [input, isLoading, handleSubmit, resetHeight, setInput, inputDisabled]
  )
  const characterCount = safeInput.length
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
      setBorderMetrics({
        width: rect.width,
        height: rect.height,
        radius: r,
        borderWidth: bw,
        borderColor: color,
      })
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

  useEffect(() => {
    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    if (!isFocused || isLoading || disabled) {
      setGhostSuggestion('')
      return
    }

    const trimmed = safeInput.trim()
    if (trimmed.length < 6) {
      setGhostSuggestion('')
      return
    }

    const caretAtEnd =
      textareaRef.current &&
      textareaRef.current.selectionStart === safeInput.length &&
      textareaRef.current.selectionEnd === safeInput.length

    if (!caretAtEnd) return

    const requestId = ++suggestionRequestRef.current
    
    // Debounce: wait 400ms after user stops typing before fetching suggestion
    debounceTimerRef.current = setTimeout(() => {
      startSuggestionTransition(async () => {
        // Don't clear suggestion immediately to avoid flicker
        try {
          const suggestion = await getAutocompleteSuggestionAction({
            partial: trimmed,
            recentMessages,
          })
          // Only update if this is still the latest request
          if (suggestionRequestRef.current === requestId) {
            setGhostSuggestion(suggestion)
          }
        } catch (error) {
          if (suggestionRequestRef.current === requestId) {
            setGhostSuggestion('')
          }
        }
      })
    }, 400)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [safeInput, isFocused, isLoading, disabled, startSuggestionTransition, recentMessages])

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
              {(() => {
                const w = borderMetrics.width
                const h = borderMetrics.height
                const bw = borderMetrics.borderWidth
                const r = Math.max(0, Math.min(borderMetrics.radius, Math.min(w, h) / 2 - bw))
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
              })()}
            </motion.svg>
          )}{' '}
          <div className="relative flex items-end w-full">
            <div className="relative flex-1">
              {ghostSuggestion && isFocused && !isLoading && (
                <div
                  aria-hidden
                  className={cn(
                    'absolute inset-0 px-4 text-sm whitespace-pre-wrap break-words text-muted-foreground/55 [overflow-wrap:anywhere]',
                    'pb-2 pt-3',
                    showAttachments ? 'pt-1' : 'pt-3'
                  )}
                >
                  <span className="invisible">{safeInput || ' '}</span>
                  <button
                    type="button"
                    className="pointer-events-auto inline-block px-2 py-1 -mx-1 -my-1 border-0 bg-transparent text-left align-baseline rounded-sm"
                    onMouseDown={e => e.preventDefault()}
                    onClick={acceptSuggestion}
                  >
                    {ghostSuggestion}
                  </button>
                </div>
              )}
              <Textarea
                ref={textareaRef}
                value={safeInput}
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
                disabled={inputDisabled}
                autoComplete="off"
                style={{ height: '60px' }}
                maxLength={maxLength}
                aria-label="Message input"
                aria-describedby={showCharacterCount && maxLength ? 'composer-charcount' : undefined}
              />
            </div>

            <div className="flex items-end gap-2 p-2">

              <div className={cn(disabled && 'pointer-events-none opacity-50')}>
                <ToolsDropdown onToolSelect={onToolSelect} selectedTool={selectedTool} />
              </div>

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
                            disabled={!safeInput.trim() || inputDisabled}
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

          <div className="flex items-center justify-between px-3 pb-2">
            <p className="hidden sm:block text-[10px] text-muted-foreground">
              enter to send • shift+enter for newline • / to focus
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

        <div className="h-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-hidden />
      </form>
    </motion.div>
  )
}

export const MultimodalInput = memo(PureMultimodalInput)
