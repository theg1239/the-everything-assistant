"use client"

import { useState, useEffect } from "react"
import { FileSearch, ChevronDown, ChevronUp, ExternalLink, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface ToolCallDisplayProps {
  toolCalls: any[]
}

export function ToolCallDisplay({ toolCalls }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false)
  const [showCard, setShowCard] = useState(false)

  // Check if all tool calls are completed
  const allCompleted = toolCalls.every((toolCall) => toolCall.state === "result" || toolCall.result !== undefined)

  useEffect(() => {
    if (allCompleted && toolCalls.length > 0) {
      // Small delay to make the appearance smoother
      const timer = setTimeout(() => setShowCard(true), 300)
      return () => clearTimeout(timer)
    } else {
      setShowCard(false)
    }
  }, [allCompleted, toolCalls.length])

  // Show loading state while tools are executing
  if (!allCompleted && toolCalls.length > 0) {
    return (
      <Card className="mt-2 overflow-hidden border-slate-600/30 bg-slate-800/20">
        <CardHeader className="py-3 px-4 bg-slate-700/20">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
            <CardTitle className="text-sm font-medium text-slate-200">searching for data...</CardTitle>
          </div>
        </CardHeader>
      </Card>
    )
  }

  // Don't show anything if no completed tool calls or card shouldn't be shown yet
  if (!showCard || toolCalls.length === 0) return null

  return (
    <Card className="mt-2 overflow-hidden border-slate-600/30 bg-slate-800/20 animate-in fade-in-0 slide-in-from-top-1 duration-500">
      <CardHeader className="py-3 px-4 bg-slate-700/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileSearch className="h-4 w-4 text-green-400" />
            <CardTitle className="text-sm font-medium text-slate-200">data retrieved successfully</CardTitle>
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
              {toolCalls.length} tool{toolCalls.length > 1 ? "s" : ""} completed
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      <div
        className={cn(
          "transition-all duration-300 ease-in-out overflow-hidden",
          expanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <CardContent className="p-4 text-sm space-y-4">
          {toolCalls.map((toolCall, index) => (
            <div key={index} className="border-l-2 border-blue-500/30 pl-4 space-y-2">
              <div className="flex items-center space-x-2">
                <h4 className="font-medium text-blue-300 capitalize">
                  {toolCall.toolName?.replace(/([A-Z])/g, " $1").toLowerCase() || "tool execution"}
                </h4>
                <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">completed</span>
              </div>

              {/* Tool arguments */}
              {toolCall.args && Object.keys(toolCall.args).length > 0 && (
                <div className="text-xs">
                  <span className="text-slate-400">parameters: </span>
                  <span className="text-slate-300">
                    {Object.entries(toolCall.args)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(", ")}
                  </span>
                </div>
              )}

              {/* Tool results */}
              {toolCall.result && (
                <div className="space-y-2">
                  {/* Success/Error status */}
                  {typeof toolCall.result === "object" && toolCall.result.success !== undefined && (
                    <div className="flex items-center space-x-2">
                      <span
                        className={cn("w-2 h-2 rounded-full", toolCall.result.success ? "bg-green-400" : "bg-red-400")}
                      />
                      <span className="text-xs text-slate-300">
                        {toolCall.result.message || (toolCall.result.success ? "success" : "failed")}
                      </span>
                    </div>
                  )}

                  {/* Papers found */}
                  {toolCall.result.papers && toolCall.result.papers.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400">
                        papers found: {toolCall.result.papers.length}
                        {toolCall.result.totalFound &&
                          toolCall.result.totalFound > toolCall.result.papers.length &&
                          ` (showing ${toolCall.result.papers.length} of ${toolCall.result.totalFound})`}
                      </span>
                      {toolCall.result.papers.slice(0, 3).map((paper: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-slate-700/20 p-2 rounded text-xs"
                        >
                          <div className="flex-1 space-y-1">
                            <div className="text-slate-300 truncate">{paper.title}</div>
                            {paper.examType && paper.examType !== "unknown" && (
                              <div className="text-xs text-blue-400">
                                {paper.examType} {paper.year && paper.year !== "unknown" && `• ${paper.year}`}
                              </div>
                            )}
                          </div>
                          {paper.url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-blue-400 hover:text-blue-300 ml-2"
                              onClick={() => window.open(paper.url, "_blank")}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {toolCall.result.papers.length > 3 && (
                        <span className="text-xs text-slate-400">+{toolCall.result.papers.length - 3} more papers</span>
                      )}
                    </div>
                  )}

                  {/* Faculty found */}
                  {toolCall.result.faculty && toolCall.result.faculty.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400">faculty found: {toolCall.result.faculty.length}</span>
                      {toolCall.result.faculty.slice(0, 2).map((faculty: any, idx: number) => (
                        <div key={idx} className="bg-slate-700/20 p-2 rounded text-xs space-y-1">
                          <div className="text-slate-300 font-medium">{faculty.name}</div>
                          <div className="text-slate-400">{faculty.department}</div>
                          {faculty.email && faculty.email !== "N/A" && (
                            <div className="text-blue-400">{faculty.email}</div>
                          )}
                        </div>
                      ))}
                      {toolCall.result.faculty.length > 2 && (
                        <span className="text-xs text-slate-400">
                          +{toolCall.result.faculty.length - 2} more faculty
                        </span>
                      )}
                    </div>
                  )}

                  {/* Placement data */}
                  {toolCall.result.data?.statistics && (
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400">placement statistics:</span>
                      <div className="bg-slate-700/20 p-2 rounded text-xs space-y-1">
                        {Object.entries(toolCall.result.data.statistics)
                          .slice(0, 3)
                          .map(([key, value]: [string, any]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-slate-400 capitalize">{key}:</span>
                              <span className="text-slate-300">{value}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Companies data */}
                  {toolCall.result.data?.companies && toolCall.result.data.companies.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs text-slate-400">
                        top companies: {toolCall.result.data.companies.length}
                      </span>
                      {toolCall.result.data.companies.slice(0, 2).map((company: any, idx: number) => (
                        <div key={idx} className="bg-slate-700/20 p-2 rounded text-xs">
                          <div className="text-slate-300 font-medium">{company.name}</div>
                          <div className="text-slate-400">{company.package}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </div>
    </Card>
  )
}
