"use client"

import { useState, useEffect } from "react"
import { FileSearch, ChevronDown, ChevronUp, ExternalLink, Loader2, Maximize2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface ToolCallDisplayProps {
  toolCalls: any[]
}

export function ToolCallDisplay({ toolCalls }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false)
  const [showCard, setShowCard] = useState(false)
  const [fullView, setFullView] = useState(false)

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

  // Full view mode (expanded canvas-like view)
  if (fullView) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in-0 duration-300">
        <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <div className="flex items-center space-x-2">
              <FileSearch className="h-5 w-5 text-green-400" />
              <h2 className="text-lg font-medium text-white">Tool Results</h2>
              <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full">
                {toolCalls.length} tool{toolCalls.length > 1 ? "s" : ""} completed
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
              onClick={() => setFullView(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {toolCalls.map((toolCall, index) => (
              <div key={index} className="border-l-2 border-blue-500/30 pl-4 space-y-4">
                <div className="flex items-center space-x-2">
                  <h3 className="font-medium text-blue-300 text-lg capitalize">
                    {toolCall.toolName?.replace(/([A-Z])/g, " $1").toLowerCase() || "tool execution"}
                  </h3>
                  <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">completed</span>
                </div>

                {/* Tool arguments */}
                {toolCall.args && Object.keys(toolCall.args).length > 0 && (
                  <div className="text-sm">
                    <span className="text-slate-400">Parameters: </span>
                    <span className="text-slate-300">
                      {Object.entries(toolCall.args)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(", ")}
                    </span>
                  </div>
                )}

                {/* Tool results */}
                {toolCall.result && (
                  <div className="space-y-4">
                    {/* Success/Error status */}
                    {typeof toolCall.result === "object" && toolCall.result.success !== undefined && (
                      <div className="flex items-center space-x-2">
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full",
                            toolCall.result.success ? "bg-green-400" : "bg-red-400",
                          )}
                        />
                        <span className="text-sm text-slate-300">
                          {toolCall.result.message || (toolCall.result.success ? "Success" : "Failed")}
                        </span>
                      </div>
                    )}

                    {/* Papers found - FULL LIST */}
                    {toolCall.result.papers && toolCall.result.papers.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-400">
                            Papers found: {toolCall.result.papers.length}
                            {toolCall.result.totalFound &&
                              toolCall.result.totalFound > toolCall.result.papers.length &&
                              ` (showing ${toolCall.result.papers.length} of ${toolCall.result.totalFound})`}
                          </span>
                          <span className="text-xs text-slate-500">Source: {toolCall.result.source || "unknown"}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {toolCall.result.papers.map((paper: any, idx: number) => (
                            <div
                              key={idx}
                              className="flex items-start justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors"
                            >
                              <div className="flex-1 space-y-2">
                                <div className="text-slate-200">{paper.title}</div>
                                <div className="flex flex-wrap gap-2">
                                  {paper.examType && paper.examType !== "unknown" && (
                                    <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">
                                      {paper.examType}
                                    </span>
                                  )}
                                  {paper.year && paper.year !== "unknown" && (
                                    <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
                                      {paper.year}
                                    </span>
                                  )}
                                  {paper.metadata && <span className="text-xs text-slate-400">{paper.metadata}</span>}
                                </div>
                              </div>
                              {paper.url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-blue-400 hover:text-blue-300 border-blue-800/50 hover:border-blue-700 ml-2"
                                  onClick={() => window.open(paper.url, "_blank")}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Open
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Faculty found - FULL LIST */}
                    {toolCall.result.faculty && toolCall.result.faculty.length > 0 && (
                      <div className="space-y-3">
                        <span className="text-sm text-slate-400">Faculty found: {toolCall.result.faculty.length}</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {toolCall.result.faculty.map((faculty: any, idx: number) => (
                            <div
                              key={idx}
                              className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 space-y-2"
                            >
                              <div className="text-slate-200 font-medium">{faculty.name}</div>
                              <div className="text-slate-400">{faculty.department}</div>
                              {faculty.specialization && faculty.specialization !== "N/A" && (
                                <div className="text-xs text-slate-500">
                                  <span className="font-medium">Specialization:</span> {faculty.specialization}
                                </div>
                              )}
                              {faculty.email && faculty.email !== "N/A" && (
                                <div className="text-blue-400">{faculty.email}</div>
                              )}
                              {faculty.office && faculty.office !== "N/A" && (
                                <div className="text-xs text-slate-500">Office: {faculty.office}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Placement data - FULL VIEW */}
                    {toolCall.result.data?.statistics && (
                      <div className="space-y-3">
                        <span className="text-sm text-slate-400">Placement statistics:</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                            {Object.entries(toolCall.result.data.statistics).map(([key, value]: [string, any]) => (
                              <div
                                key={key}
                                className="flex justify-between py-1 border-b border-slate-700/50 last:border-0"
                              >
                                <span className="text-slate-400 capitalize">{key}:</span>
                                <span className="text-slate-200 font-medium">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Companies data - FULL VIEW */}
                    {toolCall.result.data?.companies && toolCall.result.data.companies.length > 0 && (
                      <div className="space-y-3">
                        <span className="text-sm text-slate-400">
                          Companies: {toolCall.result.data.companies.length}
                        </span>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {toolCall.result.data.companies.map((company: any, idx: number) => (
                            <div key={idx} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                              <div className="text-slate-200 font-medium">{company.name}</div>
                              <div className="text-green-400">{company.package}</div>
                              {company.positions && (
                                <div className="text-xs text-slate-400 mt-1">{company.positions}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recent offers - FULL VIEW */}
                    {toolCall.result.data?.recentOffers && toolCall.result.data.recentOffers.length > 0 && (
                      <div className="space-y-3">
                        <span className="text-sm text-slate-400">
                          Recent offers: {toolCall.result.data.recentOffers.length}
                        </span>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-700">
                                <th className="text-left py-2 px-3 text-slate-400">Student</th>
                                <th className="text-left py-2 px-3 text-slate-400">Company</th>
                                <th className="text-left py-2 px-3 text-slate-400">Package</th>
                                <th className="text-left py-2 px-3 text-slate-400">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {toolCall.result.data.recentOffers.map((offer: any, idx: number) => (
                                <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/30">
                                  <td className="py-2 px-3 text-slate-300">{offer.student}</td>
                                  <td className="py-2 px-3 text-slate-300">{offer.company}</td>
                                  <td className="py-2 px-3 text-green-400">{offer.package}</td>
                                  <td className="py-2 px-3 text-slate-400">{offer.date}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Regular compact view
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
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white mr-1"
              onClick={() => setFullView(true)}
              title="Expand to full view"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
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
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">
                            +{toolCall.result.papers.length - 3} more papers
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-blue-400 hover:text-blue-300 p-0"
                            onClick={() => setFullView(true)}
                          >
                            View all
                          </Button>
                        </div>
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
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">
                            +{toolCall.result.faculty.length - 2} more faculty
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-blue-400 hover:text-blue-300 p-0"
                            onClick={() => setFullView(true)}
                          >
                            View all
                          </Button>
                        </div>
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
                        {Object.keys(toolCall.result.data.statistics).length > 3 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-full text-xs text-blue-400 hover:text-blue-300 p-0 mt-1"
                            onClick={() => setFullView(true)}
                          >
                            View all statistics
                          </Button>
                        )}
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
                      {toolCall.result.data.companies.length > 2 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">
                            +{toolCall.result.data.companies.length - 2} more companies
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-blue-400 hover:text-blue-300 p-0"
                            onClick={() => setFullView(true)}
                          >
                            View all
                          </Button>
                        </div>
                      )}
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
