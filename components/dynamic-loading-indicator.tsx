'use client'

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

interface ToolInfo {
  name: string
  icon: React.ComponentType<any>
  message: string
  description: string
  retryMessage?: string
  retryDescription?: string
}
import React from 'react'

const TOOL_CONFIGS: Record<string, ToolInfo> = {
  thinking: {
    name: 'thinking',
    icon: Brain,
    message: 'thinking...',
    description: 'Processing your request',
  },

  queryVTOP: {
    name: 'VTOP',
    icon: GraduationCap,
    message: 'accessing VTOP...',
    description: 'Connecting to VIT student portal',
    retryMessage: 'retrying VTOP...',
    retryDescription: 'Retrying connection to VTOP',
  },

  knowledgeBase: {
    name: 'Knowledge Base',
    icon: Database,
    message: 'searching knowledge...',
    description: 'Looking through VIT knowledge base',
  },

  searchRedditKnowledge: {
    name: 'Reddit Search',
    icon: MessageSquare,
    message: 'searching Reddit...',
    description: 'Finding discussions and experiences',
  },

  searchRedditWithContext: {
    name: 'Reddit Search',
    icon: MessageSquare,
    message: 'searching Reddit...',
    description: 'Finding relevant discussions',
  },

  getRedditOverview: {
    name: 'Reddit Overview',
    icon: MessageSquare,
    message: 'gathering Reddit overview...',
    description: 'Collecting community insights',
  },

  searchWeb: {
    name: 'Web Search',
    icon: Search,
    message: 'searching web...',
    description: 'Searching the internet',
  },

  findPastPapers: {
    name: 'Past Papers',
    icon: FileText,
    message: 'finding past papers...',
    description: 'Searching exam paper archives',
  },

  smartPaperSearch: {
    name: 'Smart Paper Search',
    icon: GraduationCap,
    message: 'searching papers semantically...',
    description: 'Finding relevant papers by content',
  },

  getCourseInfo: {
    name: 'Course Info',
    icon: BookOpen,
    message: 'getting course info...',
    description: 'Retrieving course details',
  },

  ffcs_planner: {
    name: 'FFCS Planner',
    icon: Calendar,
    message: 'planning FFCS...',
    description: 'Optimizing course selection',
  },

  getFacultyInfo: {
    name: 'Faculty Info',
    icon: User,
    message: 'getting faculty info...',
    description: 'Retrieving faculty details',
  },

  getPlacementInfo: {
    name: 'Placement Info',
    icon: GraduationCap,
    message: 'getting placement info...',
    description: 'Retrieving placement data',
  },

  getMessMenu: {
    name: 'Mess Menu',
    icon: Calendar,
    message: 'checking mess menu...',
    description: 'Getting dining hall information',
  },

  getCampusInfo: {
    name: 'Campus Info',
    icon: Settings,
    message: 'getting campus info...',
    description: 'Retrieving campus details',
  },

  executeCode: {
    name: 'Code Execution',
    icon: Code,
    message: 'executing code...',
    description: 'Running code in sandbox',
  },

  generateCode: {
    name: 'Code Generation',
    icon: Code,
    message: 'generating code...',
    description: 'Creating code solution',
  },

  createDocument: {
    name: 'Document Creation',
    icon: FileText,
    message: 'creating document...',
    description: 'Generating document',
  },

  analyzeDocument: {
    name: 'Document Analysis',
    icon: FileText,
    message: 'analyzing document...',
    description: 'Processing document content',
  },

  apiCall: {
    name: 'API Call',
    icon: Cloud,
    message: 'calling API...',
    description: 'Connecting to external service',
  },

  calculate: {
    name: 'Calculator',
    icon: Calculator,
    message: 'calculating...',
    description: 'Performing calculations',
  },

  research: {
    name: 'Research',
    icon: BookOpen,
    message: 'researching...',
    description: 'Gathering information',
  },

  saveMemory: {
    name: 'Memory',
    icon: Brain,
    message: 'saving to memory...',
    description: 'Storing important information',
  },

  retrieveMemory: {
    name: 'Memory',
    icon: Brain,
    message: 'accessing memory...',
    description: 'Retrieving stored information',
  },

  sendEmail: {
    name: 'Email',
    icon: Mail,
    message: 'sending email...',
    description: 'Composing and sending email',
  },

  checkCalendar: {
    name: 'Calendar',
    icon: Calendar,
    message: 'checking calendar...',
    description: 'Accessing schedule information',
  },

  default: {
    name: 'Processing',
    icon: Settings,
    message: 'processing...',
    description: 'Working on your request',
  },
}

interface DynamicLoadingIndicatorProps {
  messages: any[]
  isLoading: boolean
  showForFirstMessage?: boolean
  className?: string
  retryCount?: number
  isAssistantStreaming?: boolean
}

export function DynamicLoadingIndicator({
  messages,
  isLoading,
  showForFirstMessage = false,
  className = '',
  isAssistantStreaming = false,
}: DynamicLoadingIndicatorProps) {

  const [paperStatus, setPaperStatus] = React.useState<{
    runId: string
    lastStep?: string
    steps: { step: string; detail?: any; ts: number }[]
  } | null>(null)
  const activeRunRef = React.useRef<string | null>(null)
  const lastMessage = messages[messages.length - 1]
  const thinkingFallback =
    !isAssistantStreaming &&
    !isLoading &&
    !paperStatus &&
    messages.length > 0 &&
    lastMessage?.role === 'user'

  const isActive = isLoading || !!paperStatus || thinkingFallback

  React.useEffect(() => {
    if (lastMessage?.role === 'user') {
      setPaperStatus(null)
      activeRunRef.current = null
      return
    }

    let runId: string | undefined
    let foundActiveCall = false

    const assistantMessages = [...messages].filter(m => m.role === 'assistant')
    const recentMessages = assistantMessages.slice(-2)

    for (const message of recentMessages.reverse()) {
      if (message.toolInvocations) {
        for (const inv of message.toolInvocations) {
          if (inv.toolName === 'smartPaperSearch') {
            if (inv.state === 'call' && !inv.result) {
              foundActiveCall = true
              console.log(`[DLI] Found active smartPaperSearch call:`, inv)

              const args = inv.args as any
              if (args?.course && args?.question) {
                const params = `${args.course}-${args.question}`
                  .replace(/[^a-zA-Z0-9]/g, '')
                  .toLowerCase()
                runId = `smartpaper_${params}`.slice(0, 60)
                console.log(`[DLI] Generated deterministic runId for active call: ${runId}`)
              } else {
                runId = `smartpaper_${Math.random().toString(36).slice(2, 10)}`
                console.log(`[DLI] Generated fallback runId for active call: ${runId}`)
              }
              break
            }
          }
        }
        if (runId) break
      }
    }

    if (runId) {
      if (activeRunRef.current === runId && paperStatus && paperStatus.steps.length > 0) {
        return
      }
      console.log(`[DLI] Setting up progress tracking for runId: ${runId}`)
      setPaperStatus(prev => (prev && prev.runId === runId ? prev : { runId, steps: [] }))
      activeRunRef.current = runId

      const source = new EventSource(`/api/paper-progress/${runId}`)

      source.onopen = () => {
        console.log(`[DLI] Connected to SSE for runId: ${runId}`)
      }

      source.onmessage = event => {
        try {
          const data = JSON.parse(event.data)
          console.log(`[DLI] Received SSE event:`, data)

          if (data.step && data.step !== 'connected') {
            setPaperStatus(prev => {
              if (!prev || prev.runId !== runId) {
                return { runId, steps: [data], lastStep: data.step }
              }

              const existingIndex = prev.steps.findIndex(s => s.step === data.step)
              const newSteps = [...prev.steps]

              if (existingIndex >= 0) {
                newSteps[existingIndex] = data
              } else {
                newSteps.push(data)
              }

              return { ...prev, steps: newSteps, lastStep: data.step }
            })
          }
        } catch (e) {
          console.error('[DLI] Error parsing SSE event:', e)
        }
      }

      source.onerror = error => {
        console.error('[DLI] SSE connection error:', error)
        source.close()
      }

      const handleGlobalProgress = (event: CustomEvent) => {
        const data = event.detail
        if (data.runId === runId && data.step) {
          console.log(`[DLI] Received global progress for ${runId}:`, data)
          setPaperStatus(prev => {
            if (!prev || prev.runId !== runId) {
              return { runId, steps: [data], lastStep: data.step }
            }

            const existingIndex = prev.steps.findIndex(s => s.step === data.step)
            const newSteps = [...prev.steps]

            if (existingIndex >= 0) {
              newSteps[existingIndex] = data
            } else {
              newSteps.push(data)
            }

            return { ...prev, steps: newSteps, lastStep: data.step }
          })
        }
      }

      window.addEventListener('paper-progress' as any, handleGlobalProgress)

      const cleanup = () => {
        source.close()
        window.removeEventListener('paper-progress' as any, handleGlobalProgress)
        console.log(`[DLI] Cleaned up progress tracking for runId: ${runId}`)
      }

      setTimeout(cleanup, 30000)

      return cleanup
    } else if (!foundActiveCall) {
      setPaperStatus(null)
      activeRunRef.current = null
    }

    return undefined
  }, [messages])

  const isDoneStep = paperStatus?.lastStep === 'done'
  const [hideAfterDone, setHideAfterDone] = React.useState(false)
  const [hideAfterNoProgress, setHideAfterNoProgress] = React.useState(false)

  React.useEffect(() => {
    if (isDoneStep) {
      const t = setTimeout(() => setHideAfterDone(true), 800)
      return () => clearTimeout(t)
    } else if (hideAfterDone) {
      setHideAfterDone(false)
    }
  }, [isDoneStep])

  React.useEffect(() => {
    if (!isLoading && !isAssistantStreaming && paperStatus && paperStatus.steps.length === 0) {
      const t = setTimeout(() => setHideAfterNoProgress(true), 1000)
      return () => clearTimeout(t)
    } else if (hideAfterNoProgress) {
      setHideAfterNoProgress(false)
    }
  }, [isLoading, isAssistantStreaming, paperStatus])

  if (isAssistantStreaming) return null
  if (!isActive) return null
  if (hideAfterDone || hideAfterNoProgress) return null

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

  const currentPaperLabel = paperStatus?.lastStep
    ? labelMap[paperStatus.lastStep] || paperStatus.lastStep
    : null

  const getCurrentToolInfo = (): ToolInfo => {
    if (messages.length === 0) {
      return TOOL_CONFIGS.thinking
    }

    const lastMessage = messages[messages.length - 1]

    if (thinkingFallback || lastMessage?.role === 'user') {
      return TOOL_CONFIGS.thinking
    }
    if (lastMessage?.role === 'assistant' && lastMessage.toolInvocations) {
      const activeTools = lastMessage.toolInvocations.filter((tool: any) => {
        return tool.state === 'call' || tool.state !== 'result' || !tool.result
      })

      activeTools.sort((a: any, b: any) => {
        const aPriority = getPriority(a.toolName)
        const bPriority = getPriority(b.toolName)

        if (aPriority !== bPriority) return bPriority - aPriority
        if (a.state === 'call' && b.state !== 'call') return -1
        if (b.state === 'call' && a.state !== 'call') return 1
        return 0
      })

      if (activeTools.length > 0 && activeTools[0].toolName) {
        return TOOL_CONFIGS[activeTools[0].toolName] || TOOL_CONFIGS.default
      }

      if (lastMessage.toolInvocations.length > 0) {
        const latestTool = lastMessage.toolInvocations[lastMessage.toolInvocations.length - 1]
        if (latestTool.toolName) {
          return TOOL_CONFIGS[latestTool.toolName] || TOOL_CONFIGS.default
        }
      }
    }

    if (showForFirstMessage && messages.length === 1) {
      return TOOL_CONFIGS.thinking
    }

    return TOOL_CONFIGS.thinking
  }

  const getPriority = (toolName: string): number => {
    const priorities: Record<string, number> = {
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
    return priorities[toolName] || 1
  }

  const toolInfo = getCurrentToolInfo()

  const isSmartPaperSearch =
    toolInfo.name === 'Smart Paper Search' ||
    (messages.length > 0 &&
      messages[messages.length - 1]?.role === 'assistant' &&
      messages[messages.length - 1]?.toolInvocations?.some(
        (inv: any) => inv.toolName === 'smartPaperSearch'
      ))

  let primaryMessage = toolInfo.message
  if (currentPaperLabel) {
    primaryMessage = currentPaperLabel
  } else if (isSmartPaperSearch) {
    primaryMessage = 'searching papers semantically...'
  }
  const getDotColor = (toolName: string) => {
    if (toolName === 'VTOP') return 'bg-blue-500'
    if (toolName.includes('Reddit')) return 'bg-orange-500'
    if (['Knowledge Base', 'Past Papers', 'Course Info', 'Smart Paper Search'].includes(toolName))
      return 'bg-green-500'
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
          <div className={`w-2 h-2 ${dotColor} rounded-full animate-pulse`}></div>
          <div
            className={`w-2 h-2 ${dotColor} rounded-full animate-pulse`}
            style={{ animationDelay: '0.2s' }}
          ></div>
          <div
            className={`w-2 h-2 ${dotColor} rounded-full animate-pulse`}
            style={{ animationDelay: '0.4s' }}
          ></div>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{primaryMessage}</span>
        </div>
      </div>
    </motion.div>
  )
}

export function getCurrentActiveTool(messages: any[]): string | null {
  if (messages.length === 0) return null

  const lastMessage = messages[messages.length - 1]

  if (lastMessage?.role === 'assistant' && lastMessage.toolInvocations) {
    const activeTools = lastMessage.toolInvocations.filter((tool: any) => {
      return tool.state === 'call' || tool.state !== 'result' || !tool.result
    })

    activeTools.sort((a: any, b: any) => {
      const priorities: Record<string, number> = {
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

      const aPriority = priorities[a.toolName] || 1
      const bPriority = priorities[b.toolName] || 1

      if (aPriority !== bPriority) return bPriority - aPriority
      if (a.state === 'call' && b.state !== 'call') return -1
      if (b.state === 'call' && a.state !== 'call') return 1
      return 0
    })

    return activeTools.length > 0 ? activeTools[0].toolName : null
  }

  return null
}
