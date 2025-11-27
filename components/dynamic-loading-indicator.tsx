'use client'

import { motion, AnimatePresence } from 'framer-motion'
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
  Music,
  Utensils,
  Check,
  PenLine,
} from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ToolInfo {
  name: string
  icon: React.ComponentType<any>
  message: string
  description: string
  retryMessage?: string
  retryDescription?: string
}

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
    message: 'searching knowledge base...',
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
    message: 'searching the web...',
    description: 'Searching the internet',
  },
  webSearch: {
    name: 'Web Search',
    icon: Search,
    message: 'searching the web...',
    description: 'Searching the internet',
  },
  webExtract: {
    name: 'Web Extract',
    icon: Globe,
    message: 'extracting from page...',
    description: 'Pulling content from links',
  },

  findPastPapers: {
    name: 'Past Papers',
    icon: FileText,
    message: 'finding past papers...',
    description: 'Searching exam paper archives',
  },

  resolveCourseCode: {
    name: 'Course Resolver',
    icon: BookOpen,
    message: 'resolving course code...',
    description: 'Finding the correct course',
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
    icon: Utensils,
    message: 'checking mess menu...',
    description: 'Getting dining hall information',
  },

  getSyllabus: {
    name: 'Syllabus',
    icon: FileText,
    message: 'fetching syllabus...',
    description: 'Getting course syllabus',
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

  playMusic: {
    name: 'Music',
    icon: Music,
    message: 'finding music...',
    description: 'Searching for music',
  },

  submitFeedback: {
    name: 'Feedback',
    icon: MessageSquare,
    message: 'submitting feedback...',
    description: 'Recording your feedback',
  },

  contributeKnowledge: {
    name: 'Knowledge',
    icon: Database,
    message: 'contributing knowledge...',
    description: 'Adding to knowledge base',
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

interface ActiveToolCall {
  toolName: string
  toolCallId: string
  state: 'call' | 'partial-call' | 'result'
  args?: any
  result?: any
  stepIndex?: number
  timestamp?: number
}

interface FlowStep {
  id: string
  type: 'thinking' | 'tool' | 'writing'
  toolName?: string
  args?: any
  status: 'pending' | 'active' | 'completed'
  startTime?: number
  endTime?: number
}

function getActiveToolCalls(messages: any[]): ActiveToolCall[] {
  const activeTools: ActiveToolCall[] = []
  const seenToolCallIds = new Set<string>()

  for (const message of messages) {
    if (message.role !== 'assistant') continue

    if (message.toolInvocations) {
      for (const inv of message.toolInvocations) {
        if (!inv.toolCallId || seenToolCallIds.has(inv.toolCallId)) continue
        seenToolCallIds.add(inv.toolCallId)

        const isActive = 
          (inv.state === 'call' || inv.state === 'partial-call') && 
          inv.result === undefined

        if (isActive) {
          activeTools.push({
            toolName: inv.toolName,
            toolCallId: inv.toolCallId,
            state: inv.state,
            args: inv.args,
          })
        }
      }
    }

    // Also check parts array (for newer AI SDK format)
    if (message.parts) {
      for (const part of message.parts) {
        if (part.type === 'tool-invocation' && part.toolInvocation) {
          const inv = part.toolInvocation
          if (!inv.toolCallId || seenToolCallIds.has(inv.toolCallId)) continue
          seenToolCallIds.add(inv.toolCallId)

          const isActive = 
            (inv.state === 'call' || inv.state === 'partial-call') && 
            inv.result === undefined

          if (isActive) {
            activeTools.push({
              toolName: inv.toolName,
              toolCallId: inv.toolCallId,
              state: inv.state,
              args: inv.args,
            })
          }
        }
      }
    }
  }

  return activeTools
}

/**
 * Get all completed tool calls from the current assistant turn
 * Used to show what steps have been completed
 */
function getCompletedToolCalls(messages: any[]): ActiveToolCall[] {
  const completedTools: ActiveToolCall[] = []
  const seenToolCallIds = new Set<string>()

  // Only look at the last assistant message for completed tools in current turn
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
  if (!lastAssistant) return completedTools

  if (lastAssistant.toolInvocations) {
    for (const inv of lastAssistant.toolInvocations) {
      if (!inv.toolCallId || seenToolCallIds.has(inv.toolCallId)) continue
      seenToolCallIds.add(inv.toolCallId)

      if (inv.state === 'result' || inv.result !== undefined) {
        completedTools.push({
          toolName: inv.toolName,
          toolCallId: inv.toolCallId,
          state: 'result',
          args: inv.args,
          result: inv.result,
        })
      }
    }
  }

  if (lastAssistant.parts) {
    for (const part of lastAssistant.parts) {
      if (part.type === 'tool-invocation' && part.toolInvocation) {
        const inv = part.toolInvocation
        if (!inv.toolCallId || seenToolCallIds.has(inv.toolCallId)) continue
        seenToolCallIds.add(inv.toolCallId)

        if (inv.state === 'result' || inv.result !== undefined) {
          completedTools.push({
            toolName: inv.toolName,
            toolCallId: inv.toolCallId,
            state: 'result',
            args: inv.args,
            result: inv.result,
          })
        }
      }
    }
  }

  return completedTools
}

const TOOL_PRIORITIES: Record<string, number> = {
  queryVTOP: 10,
  knowledgeBase: 9,
  smartPaperSearch: 8,
  findPastPapers: 8,
  getSyllabus: 8,
  getCourseInfo: 7,
  getFacultyInfo: 7,
  getPlacementInfo: 6,
  resolveCourseCode: 6,
  searchRedditKnowledge: 5,
  searchRedditWithContext: 5,
  webSearch: 5,
  searchWeb: 5,
  webExtract: 4,
  saveMemory: 4,
  getMessMenu: 3,
  getCampusInfo: 3,
}

function buildFlowSteps(
  messages: any[],
  isLoading: boolean,
  isAssistantStreaming: boolean
): FlowStep[] {
  const steps: FlowStep[] = []
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
  const lastMessage = messages[messages.length - 1]
  
  const justSentMessage = lastMessage?.role === 'user' && isLoading
  
  const hasTextContent = lastAssistant?.parts?.some(
    (p: any) => p?.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0
  ) || (typeof lastAssistant?.content === 'string' && lastAssistant.content.trim().length > 0)
  
  const hasReasoning = lastAssistant?.parts?.some(
    (p: any) => p?.type === 'reasoning' && typeof p.text === 'string'
  )

  const toolInvocations: Array<{
    toolCallId: string
    toolName: string
    state: string
    args?: any
    result?: any
  }> = []

  if (lastAssistant?.toolInvocations) {
    for (const inv of lastAssistant.toolInvocations) {
      if (inv.toolCallId) {
        toolInvocations.push({
          toolCallId: inv.toolCallId,
          toolName: inv.toolName,
          state: inv.state,
          args: inv.args,
          result: inv.result,
        })
      }
    }
  }

  if (lastAssistant?.parts) {
    for (const part of lastAssistant.parts) {
      if (part.type === 'tool-invocation' && part.toolInvocation) {
        const inv = part.toolInvocation
        if (inv.toolCallId && !toolInvocations.some(t => t.toolCallId === inv.toolCallId)) {
          toolInvocations.push({
            toolCallId: inv.toolCallId,
            toolName: inv.toolName,
            state: inv.state,
            args: inv.args,
            result: inv.result,
          })
        }
      }
    }
  }

  if (justSentMessage || (hasReasoning && !hasTextContent && toolInvocations.length === 0)) {
    steps.push({
      id: 'thinking',
      type: 'thinking',
      status: toolInvocations.length > 0 || hasTextContent ? 'completed' : 'active',
    })
  } else if (toolInvocations.length > 0 || hasTextContent) {
    steps.push({
      id: 'thinking',
      type: 'thinking',
      status: 'completed',
    })
  }

  for (const inv of toolInvocations) {
    const isActive = (inv.state === 'call' || inv.state === 'partial-call') && inv.result === undefined
    const isCompleted = inv.state === 'result' || inv.result !== undefined
    
    steps.push({
      id: inv.toolCallId,
      type: 'tool',
      toolName: inv.toolName,
      args: inv.args,
      status: isActive ? 'active' : isCompleted ? 'completed' : 'pending',
    })
  }

  const allToolsCompleted = toolInvocations.length > 0 && toolInvocations.every(
    inv => inv.state === 'result' || inv.result !== undefined
  )
  const hasActiveTool = toolInvocations.some(
    inv => (inv.state === 'call' || inv.state === 'partial-call') && inv.result === undefined
  )
  
  if (allToolsCompleted && isAssistantStreaming && hasTextContent) {
    steps.push({
      id: 'writing',
      type: 'writing',
      status: 'active',
    })
  } else if (allToolsCompleted && !isLoading && hasTextContent) {
    steps.push({
      id: 'writing',
      type: 'writing',
      status: 'completed',
    })
  } else if (allToolsCompleted && isLoading && !hasActiveTool) {
    steps.push({
      id: 'writing',
      type: 'writing',
      status: 'active',
    })
  }

  return steps
}

function getDetailedToolMessage(toolName: string, args?: any): string {
  const toolInfo = TOOL_CONFIGS[toolName] || TOOL_CONFIGS.default
  const baseMessage = toolInfo.message.replace(/\.{3}$/, '')
  
  if (!args) return baseMessage

  switch (toolName) {
    case 'findPastPapers':
      if (args.courseCode) {
        return `finding papers for ${args.courseCode}`
      }
      return baseMessage

    case 'resolveCourseCode':
      if (args.query) {
        return `resolving "${args.query}"`
      }
      return baseMessage

    case 'getSyllabus':
      if (args.query) {
        return `fetching syllabus for "${args.query}"`
      }
      return baseMessage

    case 'knowledgeBase':
      if (args.query) {
        const shortQuery = args.query.length > 30 
          ? args.query.substring(0, 30) + '…' 
          : args.query
        return `searching "${shortQuery}"`
      }
      return baseMessage

    case 'queryVTOP':
      if (args.command) {
        return `accessing ${args.command}`
      }
      return baseMessage

    case 'getCourseInfo':
      if (args.courseQuery) {
        return `looking up ${args.courseQuery}`
      }
      return baseMessage

    case 'getFacultyInfo':
      if (args.facultyName) {
        return `finding ${args.facultyName}`
      }
      if (args.department) {
        return `finding ${args.department} faculty`
      }
      return baseMessage

    case 'getMessMenu':
      return 'fetching mess menu'

    case 'webSearch':
    case 'searchWeb':
      if (args.query) {
        const shortQuery = args.query.length > 25 
          ? args.query.substring(0, 25) + '…' 
          : args.query
        return `searching "${shortQuery}"`
      }
      return baseMessage

    default:
      return baseMessage
  }
}

function getToolColorClass(toolName: string): string {
  if (toolName === 'queryVTOP') return 'text-blue-500'
  if (toolName.includes('Reddit')) return 'text-orange-500'
  if (['knowledgeBase', 'findPastPapers', 'getSyllabus', 'smartPaperSearch'].includes(toolName))
    return 'text-emerald-500'
  if (['getFacultyInfo', 'getPlacementInfo'].includes(toolName)) return 'text-purple-500'
  if (toolName === 'saveMemory') return 'text-amber-500'
  if (toolName.includes('web') || toolName.includes('Web')) return 'text-cyan-500'
  return 'text-muted-foreground'
}

export function DynamicLoadingIndicator({
  messages,
  isLoading,
  showForFirstMessage = false,
  className = '',
  isAssistantStreaming = false,
}: DynamicLoadingIndicatorProps) {
  const lastMessage = messages[messages.length - 1]
  const [elapsedTime, setElapsedTime] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  
  const activeToolCalls = React.useMemo(() => getActiveToolCalls(messages), [messages])
  const completedToolCalls = React.useMemo(() => getCompletedToolCalls(messages), [messages])
  const flowSteps = React.useMemo(
    () => buildFlowSteps(messages, isLoading, isAssistantStreaming),
    [messages, isLoading, isAssistantStreaming]
  )

  const thinkingFallback =
    !isAssistantStreaming &&
    isLoading &&
    messages.length > 0 &&
    lastMessage?.role === 'user'

  const hasActiveTools = activeToolCalls.length > 0
  const hasActiveSteps = flowSteps.some(s => s.status === 'active')
  const isActive = isLoading || hasActiveTools || thinkingFallback || hasActiveSteps

  useEffect(() => {
    if (isActive && !startTimeRef.current) {
      startTimeRef.current = Date.now()
    }
    
    if (!isActive) {
      startTimeRef.current = null
      setElapsedTime(0)
      return
    }

    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isActive])

  const lastAssistantHasReasoningPanel =
    lastMessage?.role === 'assistant' &&
    Array.isArray(lastMessage?.parts) &&
    lastMessage.parts.some((p: any) => p?.type === 'reasoning')

  const activeStep = flowSteps.find(s => s.status === 'active')
  
  const completedSteps = flowSteps.filter(s => 
    s.status === 'completed' && 
    !(s.type === 'tool' && s.toolName && ['knowledgeBase', 'saveMemory'].includes(s.toolName))
  )

  const primaryMessage = activeStep?.type === 'tool' && activeStep.toolName
    ? getDetailedToolMessage(activeStep.toolName, activeStep.args)
    : activeStep?.type === 'writing'
      ? 'writing response'
      : 'thinking'

  const stepColor = React.useMemo(() => {
    if (!activeStep) return 'text-muted-foreground'
    if (activeStep.type === 'thinking') return 'text-purple-500'
    if (activeStep.type === 'writing') return 'text-blue-500'
    if (activeStep.type === 'tool' && activeStep.toolName) {
      return getToolColorClass(activeStep.toolName)
    }
    return 'text-muted-foreground'
  }, [activeStep])

  const CurrentIcon = activeStep?.type === 'tool' && activeStep.toolName
    ? (TOOL_CONFIGS[activeStep.toolName]?.icon || Settings)
    : activeStep?.type === 'writing'
      ? PenLine
      : Brain

  if (!isActive) return null
  
  if (isAssistantStreaming && lastAssistantHasReasoningPanel && !hasActiveTools) return null

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="loading-indicator"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'flex items-center gap-3 py-4 px-1',
          className
        )}
      >
        {/* Icon */}
        <div className="relative flex items-center justify-center">
          <CurrentIcon className={cn("w-4 h-4", stepColor)} />
        </div>

        {/* Message with smooth transition */}
        <div className="relative h-5 flex items-center overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={primaryMessage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="text-sm text-muted-foreground/80 font-medium truncate"
            >
              {primaryMessage}
            </motion.span>
          </AnimatePresence>
        </div>
        {elapsedTime >= 2 && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-muted-foreground/40 tabular-nums ml-1"
          >
            {elapsedTime}s
          </motion.span>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

export function getCurrentActiveTool(messages: any[]): string | null {
  const activeTools = getActiveToolCalls(messages)
  if (activeTools.length === 0) return null

  // Sort by priority and return the highest priority tool
  const sorted = [...activeTools].sort((a, b) => {
    const aPriority = TOOL_PRIORITIES[a.toolName] || 1
    const bPriority = TOOL_PRIORITIES[b.toolName] || 1
    return bPriority - aPriority
  })

  return sorted[0]?.toolName || null
}
