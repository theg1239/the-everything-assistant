"use client"

import { useState, useEffect, memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Loader2, 
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileSearch,
  Users,
  Building2,
  GraduationCap,
  TrendingUp,
  ChevronDown,
  ChevronUp
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArtifactDisplay } from "./artifact-display"
import { cn } from "@/lib/utils"

interface ToolCallDisplayProps {
  toolCalls: any[]
}

const getArtifactConfig = (result: any) => {
  if (result.papers && result.papers.length > 0) {
    return {
      type: 'papers' as const,
      title: `${result.papers.length} Papers Found`,
      icon: <GraduationCap className="h-5 w-5 text-blue-400" />,
      data: result.papers
    }
  }
  
  if (result.faculty && result.faculty.length > 0) {
    return {
      type: 'faculty' as const,
      title: `${result.faculty.length} Faculty Members Found`,
      icon: <Users className="h-5 w-5 text-purple-400" />,
      data: result.faculty
    }
  }
  
  if (result.companies && result.companies.length > 0) {
    return {
      type: 'companies' as const,
      title: `${result.companies.length} Companies Found`,
      icon: <Building2 className="h-5 w-5 text-cyan-400" />,
      data: result.companies
    }
  }
  
  if (result.placements && result.placements.length > 0) {
    return {
      type: 'placements' as const,
      title: `${result.placements.length} Placement Records Found`,
      icon: <TrendingUp className="h-5 w-5 text-green-400" />,
      data: result.placements
    }
  }
  
  return {
    type: 'general' as const,
    title: 'Search Results',
    icon: <FileSearch className="h-5 w-5 text-slate-400" />,
    data: result
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
  toolCalls, 
  onToggleDetails 
}: { 
  toolCalls: any[]
  onToggleDetails: () => void 
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const completedTools = toolCalls.filter(tool => tool.result)
  const successfulTools = completedTools.filter(tool => 
    tool.result && (tool.result.success !== false)
  )
  
  const artifacts = successfulTools
    .map(tool => getArtifactConfig(tool.result))
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
    <div className="mt-3 space-y-3">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    Search completed successfully
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Found {artifacts.reduce((total, artifact) => {
                      const count = Array.isArray(artifact.data) ? artifact.data.length : 1
                      return total + count
                    }, 0)} results across {artifacts.length} categories
                  </div>
                </div>
              </div>
              {toolCalls.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsExpanded(!isExpanded)
                    onToggleDetails()
                  }}
                  className="text-xs h-8"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Hide Details
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      Show Details
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

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
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="border-border/50 bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Tool Execution Details
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {toolCalls.map((tool, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">
                          {tool.toolName || `Tool ${index + 1}`}
                        </div>
                        <Badge variant={tool.result ? "default" : "secondary"} className="text-xs">
                          {tool.result ? "Completed" : "Running"}
                        </Badge>
                      </div>
                      {tool.result && (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      )}
                    </div>
                    
                    {tool.args && Object.keys(tool.args).length > 0 && (
                      <div className="text-xs text-muted-foreground pl-4 border-l-2 border-border/30">
                        <div className="font-medium mb-1">Parameters:</div>
                        {Object.entries(tool.args).map(([key, value]) => (
                          <div key={key} className="flex gap-2">
                            <span className="font-medium">{key}:</span>
                            <span className="break-all">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const PureToolCallDisplay = ({ toolCalls }: ToolCallDisplayProps) => {
  const [showDetails, setShowDetails] = useState(false)
  
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
      onToggleDetails={() => setShowDetails(!showDetails)}
    />
  )
}

export const ToolCallDisplay = memo(PureToolCallDisplay)
