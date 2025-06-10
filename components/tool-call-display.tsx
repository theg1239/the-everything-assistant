"use client"

import { useState, useEffect, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Loader2, 
  Sparkles,
  AlertCircle,
  FileSearch,
  Users,
  Building2,
  GraduationCap,
  TrendingUp,
  UtensilsCrossed
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArtifactDisplay } from "./artifact-display"

interface ToolCallDisplayProps {
  toolCalls: any[]
}

const getArtifactConfig = (result: any, toolName?: string) => {
  if (toolName === 'queryVTOP') {
    // Debug log to see the complete result structure
    console.log('getArtifactConfig - Full result:', result)
    
    // Handle failed VTOP tools - don't create artifacts for them, let the error handling show the error
    if (result.success === false || result.error) {
      return null
    }
      // Only process successful VTOP results
    if (result.data || result.output || result.success) {
      const vtopData = result.data || result.output
      const command = result.command || 'unknown'
    
      // console.log('VTOP Tool Display - getArtifactConfig - Raw data:', vtopData)
      // console.log('VTOP Tool Display - getArtifactConfig - Command:', command)
      // console.log('VTOP Tool Display - getArtifactConfig - Data type:', typeof vtopData)
      
      let parsedData = vtopData
      if (typeof vtopData === 'string') {      // Check if it's a table format (contains │ and ──)
        if (vtopData.includes('│') && vtopData.includes('──')) {
          const lines = vtopData.split('\n').filter(line => line.trim() && !line.includes('──'))
          // console.log('VTOP Tool Display - Table lines:', lines)
          
          if (lines.length > 1) {
            const firstLine = lines[0].split('│').map(h => h.trim()).filter(h => h)
            // console.log('VTOP Tool Display - First line split:', firstLine)
              if (firstLine.length === 2 && firstLine[0] === 'FIELD' && firstLine[1] === 'INFORMATION') {
              const profileData: any = {}
              const dataLines = lines.slice(1)
              
              dataLines.forEach(line => {
                const cells = line.split('│').map(c => c.trim()).filter(c => c)
                if (cells.length >= 2) {
                  const fieldName = cells[0].replace(/\[32m|\[0m/g, '')
                  const fieldValue = cells[1].replace(/\[32m|\[0m/g, '')
                  profileData[fieldName] = fieldValue
                }
              })
              parsedData = profileData
            } else {
              const headers = firstLine.filter(h => h !== 'INDEX')
              const rows = lines.slice(1).map(line => {
                const cells = line.split('│').map(c => c.trim()).filter(c => c)
                const row: any = {}
                headers.forEach((header, index) => {
                  if (cells[index + (firstLine.includes('INDEX') ? 1 : 0)]) { 
                    row[header] = cells[index + (firstLine.includes('INDEX') ? 1 : 0)].replace(/\[32m|\[0m/g, '') // Remove color codes
                  }
                })
                return row
              })
              parsedData = rows
            }
          }
        } else {
          try {
            parsedData = JSON.parse(vtopData)
          } catch (e) {
            parsedData = vtopData
          }
        }
      }
      
      // console.log('VTOP Tool Display - getArtifactConfig - Parsed data:', parsedData)
      // console.log('VTOP Tool Display - getArtifactConfig - Parsed data type:', typeof parsedData)
        return {
        type: 'vtop-data' as const,
        title: `VTOP ${command.charAt(0).toUpperCase() + command.slice(1)} Data`,
        icon: <GraduationCap className="h-5 w-5 text-blue-500" />,
        data: {
          command,
          content: parsedData,
          rawOutput: vtopData,
          success: result.success !== false,
          // Include AI-processed data from the backend
          parsedData: result.parsedData,
          formatted_content: result.formatted_content,
          structured_data: result.structured_data,
          summary: result.summary,
          error: result.error,
          message: result.message
        },
        source: 'VTOP Portal'
      }
    }
      return null // Return null for failed VTOP tools
  }

  if (result.papers && result.papers.length > 0) {
    return {
      type: 'papers' as const,
      title: `${result.papers.length} Past Papers`,
      icon: <GraduationCap className="h-5 w-5 text-blue-400" />,
      data: result.papers.map((paper: any) => ({
        ...paper,
        link: paper.link || paper.url || paper.pdfUrl || paper.downloadUrl
      })),
      source: result.source || toolName || 'Database Search'
    }
  }

  if (result.data && result.data.todayMenu && result.data.messType) {
    return {
      type: 'mess-menu' as const,
      title: `${result.data.messType} - ${result.data.hostelType}`,
      icon: <UtensilsCrossed className="h-5 w-5 text-orange-400" />,
      data: {
        hostelType: result.data.hostelType,
        messType: result.data.messType,
        todayMenu: result.data.todayMenu,
        weekMenu: result.data.weekMenu,
        requestedDate: result.data.requestedDate,
        actualDate: result.data.actualDate,
        isExactMatch: result.data.isExactMatch,
        formattedMenu: result.formattedMenu || result.data.formattedMenu,
        message: result.message
      },
      source: toolName || 'Mess Menu System'
    }
  }
  
  if (result.faculty && result.faculty.length > 0) {
    return {
      type: 'faculty' as const,
      title: `${result.faculty.length} Faculty Members`,
      icon: <Users className="h-5 w-5 text-purple-400" />,
      data: result.faculty,
      source: result.source || toolName || 'Faculty Directory'
    }
  }
  
  if (result.companies && result.companies.length > 0) {
    return {
      type: 'companies' as const,
      title: `${result.companies.length} Companies`,
      icon: <Building2 className="h-5 w-5 text-cyan-400" />,
      data: result.companies,
      source: result.source || toolName || 'Company Database'
    }
  }
  
  if (result.placements && result.placements.length > 0) {
    return {
      type: 'placements' as const,
      title: `${result.placements.length} Placement Records`,
      icon: <TrendingUp className="h-5 w-5 text-green-400" />,
      data: result.placements,
      source: result.source || toolName || 'Placement Data'
    }
  }
  
  return {
    type: 'general' as const,
    title: 'Search Results',
    icon: <FileSearch className="h-5 w-5 text-slate-400" />,
    data: result,
    source: result.source || toolName || 'Search'
  }
}

const ToolCallLoadingState = ({ toolCalls }: { toolCalls: any[] }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="mt-3"
  >
    <Card className="overflow-hidden border-border/50 bg-muted/30">
      <CardContent className="p-4">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">
              Searching for data...
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Running {toolCalls.length} tool{toolCalls.length > 1 ? "s" : ""}
            </div>
          </div>
          <Sparkles className="h-4 w-4 text-muted-foreground animate-pulse" />
        </div>
      </CardContent>
    </Card>
  </motion.div>
)

const ToolCallResultsSummary = ({ 
  toolCalls
}: { 
  toolCalls: any[]
}) => {
  const completedTools = toolCalls.filter(tool => tool.result)
  const successfulTools = completedTools.filter(tool => 
    tool.result && (tool.result.success !== false)
  )
  
  const vtopToolsWaitingForCredentials = toolCalls.filter(tool => 
    tool.toolName === 'queryVTOP' && 
    tool.result && 
    (tool.result.error?.includes('credentials') || tool.result.error?.includes('username') || tool.result.error?.includes('password'))
  )
  
  if (vtopToolsWaitingForCredentials.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3"
      >
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">
                  VTOP credentials required
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Please provide your VTOP credentials to continue
                </div>
              </div>
              <Sparkles className="h-4 w-4 text-muted-foreground animate-pulse" />
            </div>
          </CardContent>
        </Card>      </motion.div>
    )
  }
  
  const artifacts = successfulTools
    .map(tool => getArtifactConfig(tool.result, tool.toolName))
    .filter((config): config is NonNullable<typeof config> => 
      config !== null && config !== undefined && config.data && (
        Array.isArray(config.data) ? config.data.length > 0 : true
      )
    )

  // Check for failed tools to show their error messages
  const failedTools = completedTools.filter(tool => 
    tool.result && tool.result.success === false
  )

  if (artifacts.length === 0 && completedTools.length > 0) {
    // If there are failed tools, show their error messages instead of generic message
    if (failedTools.length > 0) {
      const firstFailedTool = failedTools[0]
      const errorMessage = firstFailedTool.result.error || 'An error occurred'
      
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3"
        >
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {firstFailedTool.toolName === 'queryVTOP' ? 'VTOP Error' : 'Search Error'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {errorMessage}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )
    }

    // Fallback to generic message if no failed tools but no artifacts
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3"
      >
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-orange-400" />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">
                  Search completed
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  No results found for your query
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  if (artifacts.length === 0) return null

  return (
    <div className="mt-4 space-y-4">
      <AnimatePresence>
        {artifacts.map((artifact, index) => (
          <motion.div
            key={`${artifact.type}-${index}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <ArtifactDisplay
              title={artifact.title}
              icon={artifact.icon}
              data={artifact.data}
              type={artifact.type}
              className="relative"
            />
            {artifact.source && (
              <div className="mt-2 flex justify-end">
                <Badge variant="outline" className="text-xs">
                  Source: {artifact.source}
                </Badge>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

const PureToolCallDisplay = ({ toolCalls }: ToolCallDisplayProps) => {
  const allCompleted = toolCalls.every((toolCall) => {
    const hasResult = toolCall.state === "result" || toolCall.result !== undefined
    
    if (toolCall.toolName === 'queryVTOP' && hasResult && toolCall.result) {
      const needsCredentials = toolCall.result.error?.includes('credentials') || 
                              toolCall.result.error?.includes('username') || 
                              toolCall.result.error?.includes('password')
      return !needsCredentials
    }
    
    return hasResult
  })

  if (!allCompleted && toolCalls.length > 0) {
    return <ToolCallLoadingState toolCalls={toolCalls} />
  }

  if (toolCalls.length === 0) return null

  return (
    <ToolCallResultsSummary 
      toolCalls={toolCalls}
    />
  )
}

export const ToolCallDisplay = memo(PureToolCallDisplay)
