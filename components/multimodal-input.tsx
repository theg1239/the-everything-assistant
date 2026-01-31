'use client'

import type React from 'react'
import { useRef, useEffect, useCallback, memo, useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowUpIcon,
  StopCircleIcon,
  PaperclipIcon,
  MicIcon,
  ImageIcon,
  XIcon,
  FileIcon,
  BrainIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { ToolsDropdown } from '@/components/tools-dropdown'
import { getAutocompleteSuggestionAction } from '@/app/actions/autocomplete'
import type { Attachment } from '@/types/attachment'
import { AttachmentPreview } from '@/components/attachment-preview'
import type { MCPClientConfig } from '@/lib/mcp-config'
import { Streamdown } from 'streamdown'
import { streamdownRehypePlugins, streamdownRemarkPlugins } from '@/lib/streamdown-config'

type PdfLibModule = typeof import('pdf-lib')
type MammothModule = typeof import('mammoth/mammoth.browser')
type Html2CanvasModule = typeof import('html2canvas')
type DocxPreviewModule = typeof import('docx-preview')

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
  onMCPConfigsChange?: (configs: MCPClientConfig[]) => void
  recentMessages?: { role: 'user' | 'assistant'; content: string }[]
  disabled?: boolean
  attachments?: Attachment[]
  onSelectFiles?: (files: FileList | File[]) => Promise<void> | void
  onRemoveAttachment?: (url: string) => void
  uploadingAttachments?: Array<{ id: string; name: string; contentType: string }>
  maxAttachments?: number
  allowAttachments?: boolean
  thinkHarder?: boolean
  onThinkHarderChange?: (value: boolean) => void
  isSignedIn?: boolean
  quotedText?: string | null
  onClearQuote?: () => void
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
  onMCPConfigsChange,
  recentMessages = [],
  disabled = false,
  attachments = [],
  onSelectFiles,
  onRemoveAttachment,
  uploadingAttachments = [],
  maxAttachments = 6,
  allowAttachments = true,
  thinkHarder = false,
  onThinkHarderChange,
  isSignedIn = false,
  quotedText,
  onClearQuote,
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

  const wrapTextToLines = useCallback(
    (text: string, font: { widthOfTextAtSize: (t: string, size: number) => number }, fontSize: number, maxWidth: number) => {
      const words = text.replace(/\s+/g, ' ').trim().split(' ')
      const lines: string[] = []
      let current = ''

      for (const word of words) {
        if (!word) continue
        const candidate = current ? `${current} ${word}` : word
        const candidateWidth = font.widthOfTextAtSize(candidate, fontSize)
        if (candidateWidth <= maxWidth) {
          current = candidate
          continue
        }

        if (current) {
          lines.push(current)
          current = ''
        }

        const wordWidth = font.widthOfTextAtSize(word, fontSize)
        if (wordWidth <= maxWidth) {
          current = word
          continue
        }

        let slice = ''
        for (const char of word) {
          const nextSlice = slice ? `${slice}${char}` : char
          const sliceWidth = font.widthOfTextAtSize(nextSlice, fontSize)
          if (sliceWidth <= maxWidth) {
            slice = nextSlice
          } else {
            if (slice) lines.push(slice)
            slice = char
          }
        }
        if (slice) current = slice
      }

      if (current) lines.push(current)
      return lines
    },
    []
  )

  const isDocLikeFile = useCallback((file: File) => {
    const lowerName = file.name.toLowerCase()
    const type = (file.type || '').toLowerCase()
    return (
      lowerName.endsWith('.doc') ||
      lowerName.endsWith('.docx') ||
      type === 'application/msword' ||
      type.includes('officedocument.wordprocessingml')
    )
  }, [])

  const convertDocLikeToPdf = useCallback(
    async (file: File): Promise<File | null> => {
      const cleanUpNode = (node: HTMLElement | null) => {
        if (node && node.parentNode) {
          node.parentNode.removeChild(node)
        }
      }

      try {
        const isDocx = file.name.toLowerCase().endsWith('.docx')
        const [pdfLib, html2canvas, docxPreview] = await Promise.all([
          import('pdf-lib') as Promise<PdfLibModule>,
          import('html2canvas') as Promise<Html2CanvasModule>,
          (isDocx ? import('docx-preview') : Promise.resolve(null)) as Promise<DocxPreviewModule | null>,
        ])

        const { PDFDocument, StandardFonts, rgb } = pdfLib

        const buffer = await file.arrayBuffer()

        if (isDocx && docxPreview) {
          const container = document.createElement('div')
          container.style.position = 'absolute'
          container.style.left = '-99999px'
          container.style.top = '0'
          container.style.width = '816px' // 8.5" at 96dpi - letter size
          container.style.background = '#ffffff'
          container.style.pointerEvents = 'none'
          container.style.overflow = 'visible'
          document.body.appendChild(container)

          try {
            await docxPreview.renderAsync(buffer, container, undefined, {
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              className: 'docx-render',
            })

            // Wait for images/fonts to load
            await new Promise(resolve => setTimeout(resolve, 300))

            // Try to find individual pages first
            let pageNodes = Array.from(container.querySelectorAll('.docx-render section.docx')) as HTMLElement[]
            
            // If no section pages, try wrapper articles or the main wrapper
            if (!pageNodes.length) {
              pageNodes = Array.from(container.querySelectorAll('.docx-wrapper > article, .docx-wrapper section')) as HTMLElement[]
            }

            // Fallback: render the entire container as one page
            if (!pageNodes.length) {
              const wrapper = container.querySelector('.docx-wrapper') as HTMLElement
              if (wrapper) {
                pageNodes = [wrapper]
              } else if (container.children.length) {
                pageNodes = [container]
              }
            }

            if (pageNodes.length) {
              const pdf = await PDFDocument.create()

              for (const pageNode of pageNodes) {
                pageNode.style.display = 'block'
                pageNode.style.visibility = 'visible'
                
                const canvas = await html2canvas.default(pageNode, {
                  scale: 2,
                  backgroundColor: '#ffffff',
                  useCORS: true,
                  logging: false,
                  allowTaint: true,
                  windowWidth: 816,
                })

                const dataUrl = canvas.toDataURL('image/png')
                const pngBytes = await (await fetch(dataUrl)).arrayBuffer()
                const png = await pdf.embedPng(new Uint8Array(pngBytes))
                const { width, height } = png.size()
                const page = pdf.addPage([width, height])
                page.drawImage(png, { x: 0, y: 0, width, height })
              }

              const pdfBytes = await pdf.save()
              const pdfBuffer = pdfBytes.buffer.slice(
                pdfBytes.byteOffset,
                pdfBytes.byteOffset + pdfBytes.byteLength
              ) as ArrayBuffer
              const pdfName = file.name.replace(/\.docx?$/i, '.pdf') || `${file.name}.pdf`
              return new File([pdfBuffer], pdfName, { type: 'application/pdf' })
            }
          } finally {
            cleanUpNode(container)
          }
        }

        // Fallback: text-based conversion (DOC or if rendering failed)
        const decoder = new TextDecoder('utf-8', { fatal: false })
        const textContent = decoder
          .decode(new Uint8Array(buffer))
          .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ')
          .trim() || 'Converted document — formatting may be reduced.'

        const pdf = await PDFDocument.create()
        const font = await pdf.embedFont(StandardFonts.Helvetica)
        const pageSize: [number, number] = [595.28, 841.89]
        let page = pdf.addPage(pageSize)
        const margin = 36
        const fontSize = 12
        const maxWidth = page.getSize().width - margin * 2
        let y = page.getSize().height - margin

        const lines = wrapTextToLines(textContent, font, fontSize, maxWidth)
        for (const line of lines) {
          if (y < margin) {
            page = pdf.addPage(pageSize)
            y = page.getSize().height - margin
          }
          page.drawText(line, {
            x: margin,
            y,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          })
          y -= fontSize * 1.4
        }

        const pdfBytes = await pdf.save()
        const pdfBuffer = pdfBytes.buffer.slice(
          pdfBytes.byteOffset,
          pdfBytes.byteOffset + pdfBytes.byteLength
        ) as ArrayBuffer
        const pdfName = file.name.replace(/\.docx?$/i, '.pdf') || `${file.name}.pdf`
        return new File([pdfBuffer], pdfName, { type: 'application/pdf' })
      } catch (error) {
        console.error('doc->pdf conversion failed', error)
        return null
      }
    },
    [wrapTextToLines]
  )

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

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!onSelectFiles || !allowAttachments || inputDisabled) return
      const dt = e.clipboardData
      if (!dt) return

      const pastedFiles = Array.from(dt.items || [])
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile())
        .filter((file): file is File => Boolean(file))

      if (pastedFiles.length === 0 && dt.files?.length) {
        pastedFiles.push(...Array.from(dt.files))
      }

      const eligible = pastedFiles.filter(file => {
        const type = (file.type || '').toLowerCase()
        return (
          type.startsWith('image/') ||
          type === 'application/pdf' ||
          isDocLikeFile(file)
        )
      })

      if (!eligible.length) return

      const availableSlots = Math.max(0, maxAttachments - attachments.length - uploadingAttachments.length)
      if (availableSlots <= 0) return

      // Prevent inserting the image blob url into the textarea when only files are being pasted
      if (!dt.getData('text')) {
        e.preventDefault()
      }

      const toUpload = eligible.slice(0, availableSlots)
      const processed: File[] = []

      for (const file of toUpload) {
        if (isDocLikeFile(file)) {
          const converted = await convertDocLikeToPdf(file)
          if (converted) {
            processed.push(converted)
          }
          continue
        }
        processed.push(file)
      }

      if (!processed.length) return

      try {
        await onSelectFiles(processed)
      } catch (error) {
        console.error('failed to add pasted files', error)
      }
    },
    [
      onSelectFiles,
      allowAttachments,
      inputDisabled,
      maxAttachments,
      attachments.length,
      uploadingAttachments.length,
      isDocLikeFile,
      convertDocLikeToPdf,
    ]
  )

  const handleFileButton = useCallback(() => {
    if (!onSelectFiles) return
    fileInputRef.current?.click()
  }, [onSelectFiles])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!onSelectFiles) return
      const files = e.target.files
      if (files && files.length > 0) {
        const incoming = Array.from(files)
        const processed: File[] = []

        for (const file of incoming) {
          if (isDocLikeFile(file)) {
            const converted = await convertDocLikeToPdf(file)
            if (converted) {
              processed.push(converted)
            }
            continue
          }
          processed.push(file)
        }

        if (processed.length) {
          await onSelectFiles(processed)
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [onSelectFiles, convertDocLikeToPdf, isDocLikeFile]
  )

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
          )}

          {/* Attachments row - above the input */}
          {quotedText && (
            <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-border/30 bg-muted/20">
              <div className="flex-1 text-sm text-muted-foreground border-l-2 border-primary/50 pl-3 py-1 line-clamp-3">
                <Streamdown
                  className="streamdown-content"
                  remarkPlugins={streamdownRemarkPlugins}
                  rehypePlugins={streamdownRehypePlugins}
                >
                  {quotedText}
                </Streamdown>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mt-1 hover:bg-background/50"
                onClick={onClearQuote}
              >
                <XIcon className="h-3 w-3" />
              </Button>
            </div>
          )}

          {allowAttachments && (attachments.length > 0 || uploadingAttachments.length > 0) && (
            <div className="flex flex-wrap gap-3 px-4 pt-4 pb-3 border-b border-border/30">
              {attachments.map(att => (
                <AttachmentPreview
                  key={att.url}
                  attachment={att}
                  onRemove={onRemoveAttachment}
                />
              ))}
              {uploadingAttachments.map(uploading => (
                <AttachmentPreview
                  key={uploading.id}
                  attachment={{ 
                    url: uploading.id, 
                    name: uploading.name, 
                    contentType: uploading.contentType 
                  }}
                  isUploading
                />
              ))}
            </div>
          )}

          {/* Main input area */}
          <div className="relative flex-1">
            {ghostSuggestion && isFocused && !isLoading && (
              <div
                aria-hidden
                className="absolute inset-0 px-3 sm:px-4 py-3 text-sm whitespace-pre-wrap break-words text-muted-foreground/55 pointer-events-none"
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
              onPaste={handlePaste}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={getPlaceholderText()}
              className="min-h-[52px] max-h-[200px] w-full resize-none border-0 bg-transparent px-3 sm:px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={inputDisabled}
              autoComplete="off"
              style={{ height: '52px' }}
              maxLength={maxLength}
              aria-label="Message input"
              aria-describedby={showCharacterCount && maxLength ? 'composer-charcount' : undefined}
            />
          </div>

          <div className="flex items-center justify-between gap-2 px-2 sm:px-3 py-1.5 border-t border-border/20">
            <div className="flex items-center gap-1">
              <div className={cn((disabled || !allowAttachments) && 'pointer-events-none opacity-50')}>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg hover:bg-muted/50"
                        onClick={handleFileButton}
                        disabled={disabled || isLoading || !allowAttachments || attachments.length >= maxAttachments}
                        aria-label="Attach files"
                      >
                        <PaperclipIcon className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>attach image or pdf</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <div className={cn(disabled && 'pointer-events-none opacity-50')}>
                <ToolsDropdown 
                  onToolSelect={onToolSelect} 
                  selectedTool={selectedTool}
                  onMCPConfigsChange={onMCPConfigsChange}
                />
              </div>

              {isSignedIn && onThinkHarderChange && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={cn(
                          "h-8 px-2 text-muted-foreground hover:text-foreground transition-all",
                          thinkHarder && "text-blue-500 hover:text-blue-600 bg-blue-50/50 dark:bg-blue-950/20"
                        )}
                        onClick={() => onThinkHarderChange(!thinkHarder)}
                        disabled={disabled || isLoading}
                        aria-label={thinkHarder ? "Disable think harder mode" : "Enable think harder mode"}
                        aria-pressed={thinkHarder}
                      >
                        <BrainIcon className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {thinkHarder ? "think harder mode enabled" : "think harder"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Right side - character count and send button */}
            <div className="flex items-center gap-2 sm:gap-3">
              {showCharacterCount && maxLength && (
                <span
                  className={cn(
                    'text-[10px] tabular-nums hidden sm:inline',
                    isNearLimit ? 'text-amber-500' : 'text-muted-foreground/70'
                  )}
                  aria-live="polite"
                  id="composer-charcount"
                >
                  {characterCount}/{maxLength}
                </span>
              )}
              
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
                            className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            aria-label="Stop generating"
                          >
                            <StopCircleIcon className="h-4 w-4" />
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
                            className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                            aria-label="Send message"
                          >
                            <ArrowUpIcon className="h-4 w-4" />
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
        </motion.div>

        <div className="h-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-hidden />
      </form>
    </motion.div>
  )
}

export const MultimodalInput = memo(PureMultimodalInput)
