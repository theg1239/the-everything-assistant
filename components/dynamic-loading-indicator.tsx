'use client'

import React, { useEffect, useMemo, useRef, useState, memo } from 'react'
import { motion } from 'framer-motion'
import {
  Brain,
  Database,
  Search,
  Code,
  FileText,
  Globe,
  Calculator,
  BookOpen,
  Settings,
  Zap,
  Cloud,
  Mail,
  MessageSquare,
  User,
  Calendar,
  GraduationCap,
} from 'lucide-react'

/* ----------------------------- constants/helpers ---------------------------- */

interface ToolInfo {
  name: string
  icon: React.ComponentType<any>
  message: string
  description: string
  retryMessage?: string
  retryDescription?: string
}

const TOOL_CONFIGS: Record<string, ToolInfo> = {
  thinking: { name: 'thinking', icon: Brain, message: 'thinking...', description: 'Processing your request' },
  queryVTOP: { name: 'VTOP', icon: GraduationCap, message: 'accessing VTOP...', description: 'Connecting to VIT student portal', retryMessage: 'retrying VTOP...', retryDescription: 'Retrying connection to VTOP' },
  knowledgeBase: { name: 'Knowledge Base', icon: Database, message: 'searching knowledge...', description: 'Looking through VIT knowledge base' },
  searchRedditKnowledge: { name: 'Reddit Search', icon: MessageSquare, message: 'searching Reddit...', description: 'Finding discussions and experiences' },
  searchRedditWithContext: { name: 'Reddit Search', icon: MessageSquare, message: 'searching Reddit...', description: 'Finding relevant discussions' },
  getRedditOverview: { name: 'Reddit Overview', icon: MessageSquare, message: 'gathering Reddit overview...', description: 'Collecting community insights' },
  searchWeb: { name: 'Web Search', icon: Search, message: 'searching web...', description: 'Searching the internet' },
  findPastPapers: { name: 'Past Papers', icon: FileText, message: 'finding past papers...', description: 'Searching exam paper archives' },
  smartPaperSearch: { name: 'Smart Paper Search', icon: GraduationCap, message: 'searching papers semantically...', description: 'Finding relevant papers by content' },
  getCourseInfo: { name: 'Course Info', icon: BookOpen, message: 'getting course info...', description: 'Retrieving course details' },
  ffcs_planner: { name: 'FFCS Planner', icon: Calendar, message: 'planning FFCS...', description: 'Optimizing course selection' },
  getFacultyInfo: { name: 'Faculty Info', icon: User, message: 'getting faculty info...', description: 'Retrieving faculty details' },
  getPlacementInfo: { name: 'Placement Info', icon: GraduationCap, message: 'getting placement info...', description: 'Retrieving placement data' },
  getMessMenu: { name: 'Mess Menu', icon: Calendar, message: 'checking mess menu...', description: 'Getting dining hall information' },
  getCampusInfo: { name: 'Campus Info', icon: Settings, message: 'getting campus info...', description: 'Retrieving campus details' },
  executeCode: { name: 'Code Execution', icon: Code, message: 'executing code...', description: 'Running code in sandbox' },
  generateCode: { name: 'Code Generation', icon: Code, message: 'generating code...', description: 'Creating code solution' },
  createDocument: { name: 'Document Creation', icon: FileText, message: 'creating document...', description: 'Generating document' },
  analyzeDocument: { name: 'Document Analysis', icon: FileText, message: 'analyzing document...', description: 'Processing document content' },
  apiCall: { name: 'API Call', icon: Cloud, message: 'calling API...', description: 'Connecting to external service' },
  calculate: { name: 'Calculator', icon: Calculator, message: 'calculating...', description: 'Performing calculations' },
  research: { name: 'Research', icon: BookOpen, message: 'researching...', description: 'Gathering information' },
  saveMemory: { name: 'Memory', icon: Brain, message: 'saving to memory...', description: 'Storing important information' },
  retrieveMemory: { name: 'Memory', icon: Brain, message: 'accessing memory...', description: 'Retrieving stored information' },
  sendEmail: { name: 'Email', icon: Mail, message: 'sending email...', description: 'Composing and sending email' },
  checkCalendar: { name: 'Calendar', icon: Calendar, message: 'checking calendar...', description: 'Accessing schedule information' },
  default: { name: 'Processing', icon: Settings, message: 'processing...', description: 'Working on your request' },
}

const PRIORITY: Record<string, number> = {
  queryVTOP: 10,
  knowledgeBase: 9,
  smartPaperSearch: 8,
  findPastPapers: 8,
  getCourseInfo: 7,
  getFacultyInfo: 7,
  getPlacementInfo: 6,
  searchRedditKnowledge: 5,
  searchRedditWithContext: 5,
  saveMemory: 4,
  getMessMenu: 3,
  getCampusInfo: 3,
}

function getPriority(toolName: string): number {
  return PRIORITY[toolName] ?? 1
}

function pickActiveToolFromInvocations(invocations: any[] | undefined) {
  if (!invocations?.length) return null

  const active = invocations.filter((t: any) => {
    // active if calling OR not yet 'result' OR result missing
    return t.state === 'call' || t.state !== 'result' || !t.result
  })

  if (!active.length) return null

  active.sort((a: any, b: any) => {
    const ap = getPriority(a.toolName)
    const bp = getPriority(b.toolName)
    if (ap !== bp) return bp - ap
    if (a.state === 'call' && b.state !== 'call') return -1
    if (b.state === 'call' && a.state !== 'call') return 1
    return 0
  })

  const chosen = active[0]
  return chosen?.toolName ? (TOOL_CONFIGS[chosen.toolName] ?? TOOL_CONFIGS.default) : null
}

function deriveSmartPaperRunId(lastAssistant: any | null) {
  if (!lastAssistant?.toolInvocations?.length) return null
  // find an in-flight smartPaperSearch
  const inv = [...lastAssistant.toolInvocations].reverse().find(
    (i: any) => i.toolName === 'smartPaperSearch' && i.state === 'call' && !i.result
  )
  if (!inv) return null

  const args = inv.args as any
  if (args?.course && args?.question) {
    const params = `${args.course}-${args.question}`.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    return `smartpaper_${params}`.slice(0, 60)
  }
  return `smartpaper_${Math.random().toString(36).slice(2, 10)}`
}

/* ---------------------------------- props ---------------------------------- */

interface DynamicLoadingIndicatorProps {
  messages: any[]
  isLoading: boolean
  status: 'idle' | 'loading' | 'streaming' | 'error' | 'submitted' | 'ready'
  showForFirstMessage?: boolean
  className?: string
  retryCount?: number
}

/* --------------------------------- labels ---------------------------------- */

const labelMap: Record<string, string> = {
  start: 'Starting smart paper search...',
  resolveCourse: 'Identifying course code...',
  fetchedMetadata: 'Found candidate papers...',
  selectedSubset: 'Picking the most relevant papers...',
  processPaperStart: 'Analyzing paper...',
  paperDownloadFailed: 'Could not download a paper (skipped)',
  duplicateContent: 'Skipping duplicate content...',
  paperTextInsufficient: 'Paper text too small (skipped)',
  extractedQuestions: 'Extracting possible questions...',
  chunked: 'Breaking content into chunks...',
  chunkEmbeddings: 'Creating vector embeddings...',
  questionEmbeddings: 'Embedding your question...',
  questionEmbeddingsFailed: 'Question embedding failed (retrying)...',
  questionEmbedded: 'Preparing similarity search...',
  indexBuilt: 'Index ready for search...',
  rankingComplete: 'Ranking most relevant papers...',
  ranking: 'Ranking papers...',
  done: 'All set — results ready.',
}

/* --------------------------------- component -------------------------------- */

export const DynamicLoadingIndicator = memo(function DynamicLoadingIndicator({
  messages,
  isLoading,
  status,
  showForFirstMessage = false,
  className = '',
}: DynamicLoadingIndicatorProps) {
  const [paperStatus, setPaperStatus] = useState<{
    runId: string
    lastStep?: string
    steps: { step: string; detail?: any; ts: number }[]
  } | null>(null)

  const activeRunRef = useRef<string | null>(null)
  const cleanupTimerRef = useRef<number | null>(null)

  // only the last assistant message (this cuts down on huge re-calcs per token)
  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') return messages[i]
    }
    return null
  }, [messages])

  // which tool should we display?
  const toolInfo: ToolInfo | null = useMemo(() => {
    if (status === 'loading' || status === 'submitted') return TOOL_CONFIGS.thinking
    if (status === 'streaming') {
      const info = pickActiveToolFromInvocations(lastAssistant?.toolInvocations)
      if (info) return info
      // fallback: if there were tool invocations but none active, show last one’s tool
      const lastTool = lastAssistant?.toolInvocations?.[lastAssistant.toolInvocations.length - 1]
      if (lastTool?.toolName) return TOOL_CONFIGS[lastTool.toolName] ?? TOOL_CONFIGS.default
    }
    return null
  }, [status, lastAssistant])

  // derive run id only from the last assistant message
  const smartPaperRunId = useMemo(() => deriveSmartPaperRunId(lastAssistant), [lastAssistant])

  // Connect SSE only when runId changes (NOT on every messages change)
  useEffect(() => {
    // no active smartPaperSearch
    if (!smartPaperRunId) {
      if (paperStatus !== null) setPaperStatus(null)
      activeRunRef.current = null
      if (cleanupTimerRef.current) {
        window.clearTimeout(cleanupTimerRef.current)
        cleanupTimerRef.current = null
      }
      return
    }

    // already connected for this run
    if (activeRunRef.current === smartPaperRunId) return
    activeRunRef.current = smartPaperRunId

    // initialize status if needed
    setPaperStatus(prev => (prev?.runId === smartPaperRunId ? prev : { runId: smartPaperRunId, steps: [] }))

    const source = new EventSource(`/api/paper-progress/${smartPaperRunId}`)

    source.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        if (data.step && data.step !== 'connected') {
          setPaperStatus(prev => {
            if (!prev || prev.runId !== smartPaperRunId) {
              return { runId: smartPaperRunId, steps: [data], lastStep: data.step }
            }
            const idx = prev.steps.findIndex(s => s.step === data.step)
            const steps = idx >= 0 ? prev.steps.map((s, i) => (i === idx ? data : s)) : [...prev.steps, data]
            // guard: avoid useless state updates if nothing changed
            if (prev.lastStep === data.step && idx >= 0 && prev.steps[idx] === data) return prev
            return { ...prev, steps, lastStep: data.step }
          })
        }
      } catch (e) {
        // just ignore bad frames
        // console.error('[DLI] bad SSE frame', e)
      }
    }

    source.onerror = () => {
      source.close()
    }

    const handleGlobalProgress = (event: Event) => {
      const data = (event as CustomEvent).detail
      if (!data || data.runId !== smartPaperRunId || !data.step) return
      setPaperStatus(prev => {
        if (!prev || prev.runId !== smartPaperRunId) {
          return { runId: smartPaperRunId, steps: [data], lastStep: data.step }
        }
        const idx = prev.steps.findIndex(s => s.step === data.step)
        const steps = idx >= 0 ? prev.steps.map((s, i) => (i === idx ? data : s)) : [...prev.steps, data]
        if (prev.lastStep === data.step && idx >= 0 && prev.steps[idx] === data) return prev
        return { ...prev, steps, lastStep: data.step }
      })
    }

    window.addEventListener('paper-progress' as any, handleGlobalProgress)

    // auto-close after 30s in case the backend forgets to end the stream
    if (cleanupTimerRef.current) window.clearTimeout(cleanupTimerRef.current)
    cleanupTimerRef.current = window.setTimeout(() => {
      source.close()
      window.removeEventListener('paper-progress' as any, handleGlobalProgress)
      cleanupTimerRef.current = null
    }, 30000)

    return () => {
      source.close()
      window.removeEventListener('paper-progress' as any, handleGlobalProgress)
      if (cleanupTimerRef.current) {
        window.clearTimeout(cleanupTimerRef.current)
        cleanupTimerRef.current = null
      }
    }
  }, [smartPaperRunId]) // <— key change; no more dependency on the whole messages array

  const isDoneStep = paperStatus?.lastStep === 'done'
  const [hideAfterDone, setHideAfterDone] = useState(false)
  const [hideAfterNoProgress, setHideAfterNoProgress] = useState(false)

  // finish animation -> hide soon after
  useEffect(() => {
    if (isDoneStep) {
      const t = window.setTimeout(() => setHideAfterDone(true), 800)
      return () => window.clearTimeout(t)
    }
    if (hideAfterDone) setHideAfterDone(false)
  }, [isDoneStep]) // eslint-disable-line react-hooks/exhaustive-deps

  // if nothing ever arrives and loading stops, hide
  useEffect(() => {
    if (!isLoading && paperStatus && paperStatus.steps.length === 0) {
      const t = window.setTimeout(() => setHideAfterNoProgress(true), 1000)
      return () => window.clearTimeout(t)
    }
    if (hideAfterNoProgress) setHideAfterNoProgress(false)
  }, [isLoading, paperStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!toolInfo) return null
  if (isDoneStep || hideAfterDone || hideAfterNoProgress) return null

  const currentPaperLabel = paperStatus?.lastStep ? (labelMap[paperStatus.lastStep] ?? paperStatus.lastStep) : null

  const isSmartPaperSearch =
    toolInfo.name === 'Smart Paper Search' ||
    !!lastAssistant?.toolInvocations?.some((inv: any) => inv.toolName === 'smartPaperSearch')

  let primaryMessage = currentPaperLabel ?? (isSmartPaperSearch ? 'searching papers semantically...' : toolInfo.message)

  const getDotColor = (toolName: string) => {
    if (toolName === 'VTOP') return 'bg-blue-500'
    if (toolName.includes('Reddit')) return 'bg-orange-500'
    if (['Knowledge Base', 'Past Papers', 'Course Info', 'Smart Paper Search'].includes(toolName)) return 'bg-green-500'
    if (['Faculty Info', 'Placement Info'].includes(toolName)) return 'bg-purple-500'
    if (toolName === 'Memory') return 'bg-yellow-500'
    return 'bg-primary'
  }
  const dotColor = getDotColor(toolInfo.name)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`flex items-center justify-center space-x-3 text-muted-foreground py-4 ${className}`}
    >
      <div className="flex items-center space-x-3">
        <div className="flex space-x-1">
          <div className={`w-2 h-2 ${dotColor} rounded-full animate-pulse`} />
          <div className={`w-2 h-2 ${dotColor} rounded-full animate-pulse`} style={{ animationDelay: '0.2s' }} />
          <div className={`w-2 h-2 ${dotColor} rounded-full animate-pulse`} style={{ animationDelay: '0.4s' }} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{primaryMessage}</span>
        </div>
      </div>
    </motion.div>
  )
})

/* ----------------------------- external helper ----------------------------- */

export function getCurrentActiveTool(messages: any[]): string | null {
  if (!messages?.length) return null
  let lastAssistant: any = null
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') {
      lastAssistant = messages[i]
      break
    }
  }
  const info = pickActiveToolFromInvocations(lastAssistant?.toolInvocations)
  return info ? info.name : null
}
