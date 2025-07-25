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
  GraduationCap
} from 'lucide-react'

interface ToolInfo {
  name: string
  icon: React.ComponentType<any>
  message: string
  description: string
  retryMessage?: string
  retryDescription?: string
}

const TOOL_CONFIGS: Record<string, ToolInfo> = {
  // General thinking/processing
  thinking: {
    name: 'thinking',
    icon: Brain,
    message: 'thinking...',
    description: 'Processing your request'
  },
  
  // VTOP related tools
  queryVTOP: {
    name: 'VTOP',
    icon: GraduationCap,
    message: 'accessing VTOP...',
    description: 'Connecting to VIT student portal',
    retryMessage: 'retrying VTOP...',
    retryDescription: 'Retrying connection to VTOP'
  },
  
  // Knowledge and search tools
  knowledgeBase: {
    name: 'Knowledge Base',
    icon: Database,
    message: 'searching knowledge...',
    description: 'Looking through VIT knowledge base'
  },
  
  searchRedditKnowledge: {
    name: 'Reddit Search',
    icon: MessageSquare,
    message: 'searching Reddit...',
    description: 'Finding discussions and experiences'
  },
  
  searchRedditWithContext: {
    name: 'Reddit Search',
    icon: MessageSquare,
    message: 'searching Reddit...',
    description: 'Finding relevant discussions'
  },
  
  getRedditOverview: {
    name: 'Reddit Overview',
    icon: MessageSquare,
    message: 'gathering Reddit overview...',
    description: 'Collecting community insights'
  },
  
  searchWeb: {
    name: 'Web Search',
    icon: Search,
    message: 'searching web...',
    description: 'Searching the internet'
  },
  
  // Academic tools
  findPastPapers: {
    name: 'Past Papers',
    icon: FileText,
    message: 'finding past papers...',
    description: 'Searching exam paper archives'
  },
  
  getCourseInfo: {
    name: 'Course Info',
    icon: BookOpen,
    message: 'getting course info...',
    description: 'Retrieving course details'
  },
  
  ffcs_planner: {
    name: 'FFCS Planner',
    icon: Calendar,
    message: 'planning FFCS...',
    description: 'Optimizing course selection'
  },
  
  getFacultyInfo: {
    name: 'Faculty Info',
    icon: User,
    message: 'getting faculty info...',
    description: 'Retrieving faculty details'
  },
  
  // Campus services
  getPlacementInfo: {
    name: 'Placement Info',
    icon: GraduationCap,
    message: 'getting placement info...',
    description: 'Retrieving placement data'
  },
  
  getMessMenu: {
    name: 'Mess Menu',
    icon: Calendar,
    message: 'checking mess menu...',
    description: 'Getting dining hall information'
  },
  
  getCampusInfo: {
    name: 'Campus Info',
    icon: Settings,
    message: 'getting campus info...',
    description: 'Retrieving campus details'
  },
  
  // Code and development tools
  executeCode: {
    name: 'Code Execution',
    icon: Code,
    message: 'executing code...',
    description: 'Running code in sandbox'
  },
  
  generateCode: {
    name: 'Code Generation',
    icon: Code,
    message: 'generating code...',
    description: 'Creating code solution'
  },
  
  // Document and file tools
  createDocument: {
    name: 'Document Creation',
    icon: FileText,
    message: 'creating document...',
    description: 'Generating document'
  },
  
  analyzeDocument: {
    name: 'Document Analysis',
    icon: FileText,
    message: 'analyzing document...',
    description: 'Processing document content'
  },
  
  // API and external service tools
  apiCall: {
    name: 'API Call',
    icon: Cloud,
    message: 'calling API...',
    description: 'Connecting to external service'
  },
  
  // Math and calculation tools
  calculate: {
    name: 'Calculator',
    icon: Calculator,
    message: 'calculating...',
    description: 'Performing calculations'
  },
  
  // Research and learning tools
  research: {
    name: 'Research',
    icon: BookOpen,
    message: 'researching...',
    description: 'Gathering information'
  },
  
  // Memory and context tools
  saveMemory: {
    name: 'Memory',
    icon: Brain,
    message: 'saving to memory...',
    description: 'Storing important information'
  },
  
  retrieveMemory: {
    name: 'Memory',
    icon: Brain,
    message: 'accessing memory...',
    description: 'Retrieving stored information'
  },
  
  // Communication tools
  sendEmail: {
    name: 'Email',
    icon: Mail,
    message: 'sending email...',
    description: 'Composing and sending email'
  },
  
  // Calendar and scheduling
  checkCalendar: {
    name: 'Calendar',
    icon: Calendar,
    message: 'checking calendar...',
    description: 'Accessing schedule information'
  },
  
  // Default fallback
  default: {
    name: 'Processing',
    icon: Settings,
    message: 'processing...',
    description: 'Working on your request'
  }
}

interface DynamicLoadingIndicatorProps {
  messages: any[]
  isLoading: boolean
  showForFirstMessage?: boolean
  className?: string
  retryCount?: number
}

export function DynamicLoadingIndicator({ 
  messages, 
  isLoading, 
  showForFirstMessage = false,
  className = ""
}: DynamicLoadingIndicatorProps) {
  if (!isLoading) return null

  const getCurrentToolInfo = (): ToolInfo => {
    if (messages.length === 0) {
      return TOOL_CONFIGS.thinking
    }

    const lastMessage = messages[messages.length - 1]
    
    if (lastMessage?.role === 'user') {
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
      'queryVTOP': 10,
      'knowledgeBase': 9,
      'findPastPapers': 8,
      'getCourseInfo': 7,
      'getFacultyInfo': 7,
      'getPlacementInfo': 6,
      'searchRedditKnowledge': 5,
      'searchRedditWithContext': 5,
      'saveMemory': 4,
      'getMessMenu': 3,
      'getCampusInfo': 3,
    }
    return priorities[toolName] || 1
  }

  const toolInfo = getCurrentToolInfo()
  const getDotColor = (toolName: string) => {
    if (toolName === 'VTOP') return 'bg-blue-500'
    if (toolName.includes('Reddit')) return 'bg-orange-500'
    if (['Knowledge Base', 'Past Papers', 'Course Info'].includes(toolName)) return 'bg-green-500'
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
          <span className="text-sm font-medium">{toolInfo.message}</span>
          {/* <span className="text-xs opacity-70">{toolInfo.description}</span> */}
        </div>
      </div>
    </motion.div>
  )
}

// Helper function to get tool name from messages for external use
export function getCurrentActiveTool(messages: any[]): string | null {
  if (messages.length === 0) return null
  
  const lastMessage = messages[messages.length - 1]
  
  if (lastMessage?.role === 'assistant' && lastMessage.toolInvocations) {
    const activeTools = lastMessage.toolInvocations.filter((tool: any) => {
      return tool.state === 'call' || tool.state !== 'result' || !tool.result
    })
    
    // Sort by priority
    activeTools.sort((a: any, b: any) => {
      const priorities: Record<string, number> = {
        'queryVTOP': 10,
        'knowledgeBase': 9,
        'findPastPapers': 8,
        'getCourseInfo': 7,
        'getFacultyInfo': 7,
        'getPlacementInfo': 6,
        'searchRedditKnowledge': 5,
        'searchRedditWithContext': 5,
        'saveMemory': 4,
        'getMessMenu': 3,
        'getCampusInfo': 3,
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
