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
  Music,
  Utensils,
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

export function DynamicLoadingIndicator({
  messages,
  isLoading,
  showForFirstMessage = false,
  className = '',
  isAssistantStreaming = false,
}: DynamicLoadingIndicatorProps) {
  const lastMessage = messages[messages.length - 1]
  
  const activeToolCalls = React.useMemo(() => getActiveToolCalls(messages), [messages])
  const completedToolCalls = React.useMemo(() => getCompletedToolCalls(messages), [messages])

  const thinkingFallback =
    !isAssistantStreaming &&
    isLoading &&
    messages.length > 0 &&
    lastMessage?.role === 'user'

  const hasActiveTools = activeToolCalls.length > 0
  const isActive = isLoading || hasActiveTools || thinkingFallback

  const lastAssistantHasReasoningPanel =
    lastMessage?.role === 'assistant' &&
    Array.isArray(lastMessage?.parts) &&
    lastMessage.parts.some((p: any) => p?.type === 'reasoning')

  if (!isActive) return null
  if (isAssistantStreaming && lastAssistantHasReasoningPanel) return null

  const sortedActiveTools = [...activeToolCalls].sort((a, b) => {
    const aPriority = TOOL_PRIORITIES[a.toolName] || 1
    const bPriority = TOOL_PRIORITIES[b.toolName] || 1
    return bPriority - aPriority
  })

  // Get the current tool info
  const getCurrentToolInfo = (): { toolInfo: ToolInfo; args?: any } => {
    if (sortedActiveTools.length > 0) {
      const activeTool = sortedActiveTools[0]
      const toolInfo = TOOL_CONFIGS[activeTool.toolName] || TOOL_CONFIGS.default
      return { toolInfo, args: activeTool.args }
    }

    if (thinkingFallback) {
      return { toolInfo: TOOL_CONFIGS.thinking }
    }

    return { toolInfo: TOOL_CONFIGS.thinking }
  }

  const { toolInfo, args } = getCurrentToolInfo()

  // Generate a more specific message based on tool args
  const getDetailedMessage = (): string => {
    if (!args) return toolInfo.message

    const toolName = sortedActiveTools[0]?.toolName

    switch (toolName) {
      case 'findPastPapers':
        if (args.courseCode) {
          return `finding papers for ${args.courseCode}...`
        }
        return toolInfo.message

      case 'resolveCourseCode':
        if (args.query) {
          return `resolving "${args.query}"...`
        }
        return toolInfo.message

      case 'getSyllabus':
        if (args.query) {
          return `fetching syllabus for "${args.query}"...`
        }
        return toolInfo.message

      case 'knowledgeBase':
        if (args.query) {
          const shortQuery = args.query.length > 30 
            ? args.query.substring(0, 30) + '...' 
            : args.query
          return `searching for "${shortQuery}"...`
        }
        return toolInfo.message

      case 'queryVTOP':
        if (args.command) {
          return `accessing ${args.command}...`
        }
        return toolInfo.message

      case 'getCourseInfo':
        if (args.courseQuery) {
          return `looking up ${args.courseQuery}...`
        }
        return toolInfo.message

      case 'getFacultyInfo':
        if (args.facultyName) {
          return `finding ${args.facultyName}...`
        }
        if (args.department) {
          return `finding ${args.department} faculty...`
        }
        return toolInfo.message

      case 'getMessMenu':
        return 'fetching mess menu...'

      case 'webSearch':
      case 'searchWeb':
        if (args.query) {
          const shortQuery = args.query.length > 25 
            ? args.query.substring(0, 25) + '...' 
            : args.query
          return `searching "${shortQuery}"...`
        }
        return toolInfo.message

      default:
        return toolInfo.message
    }
  }

  const primaryMessage = getDetailedMessage()

  const getDotColor = (toolName: string) => {
    if (toolName === 'VTOP' || toolName === 'queryVTOP') return 'bg-blue-500'
    if (toolName.includes('Reddit')) return 'bg-orange-500'
    if (['Knowledge Base', 'Past Papers', 'Course Info', 'Smart Paper Search', 'Syllabus', 'knowledgeBase', 'findPastPapers', 'getSyllabus'].includes(toolName))
      return 'bg-green-500'
    if (['Faculty Info', 'Placement Info', 'getFacultyInfo', 'getPlacementInfo'].includes(toolName)) return 'bg-purple-500'
    if (toolName === 'Memory' || toolName === 'saveMemory') return 'bg-yellow-500'
    if (toolName.includes('Web') || toolName.includes('web')) return 'bg-cyan-500'
    return 'bg-primary'
  }

  const currentToolName = sortedActiveTools[0]?.toolName || 'thinking'
  const dotColor = getDotColor(currentToolName)

  // Show completed steps if there are any
  const showSteps = completedToolCalls.length > 0 && activeToolCalls.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`flex flex-col items-center justify-center text-muted-foreground py-4 ${className}`}
    >
      {/* Show completed steps */}
      {showSteps && (
        <div className="flex flex-wrap items-center justify-center gap-2 mb-2 text-xs text-muted-foreground/70">
          {completedToolCalls.slice(-3).map((tool, idx) => {
            const info = TOOL_CONFIGS[tool.toolName] || TOOL_CONFIGS.default
            return (
              <span key={tool.toolCallId} className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500/50 rounded-full" />
                <span>{info.name}</span>
                {idx < Math.min(completedToolCalls.length - 1, 2) && <span className="mx-1">→</span>}
              </span>
            )
          })}
        </div>
      )}
      
      {/* Current active tool */}
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
          {/* Show count if multiple tools are active */}
          {activeToolCalls.length > 1 && (
            <span className="text-xs text-muted-foreground/60">
              +{activeToolCalls.length - 1} more in progress
            </span>
          )}
        </div>
      </div>
    </motion.div>
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
