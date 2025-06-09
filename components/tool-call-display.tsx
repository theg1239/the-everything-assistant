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
  TrendingUp
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArtifactDisplay } from "./artifact-display"

interface ToolCallDisplayProps {
  toolCalls: any[]
}

const getArtifactConfig = (result: any, toolName?: string) => {
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
  
  const artifacts = successfulTools
    .map(tool => getArtifactConfig(tool.result, tool.toolName))
    .filter(config => config.data && (
      Array.isArray(config.data) ? config.data.length > 0 : true
    ))

  if (artifacts.length === 0 && completedTools.length > 0) {
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
  const allCompleted = toolCalls.every((toolCall) => 
    toolCall.state === "result" || toolCall.result !== undefined
  )

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
