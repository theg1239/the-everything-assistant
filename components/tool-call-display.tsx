"use client"

import { useState, useEffect } from "react"
import { 
  FileSearch, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  Loader2, 
  Maximize2, 
  X, 
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Users,
  Building2,
  GraduationCap,
  TrendingUp
} from "lucide-react"
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
      <div className="mt-3 animate-in fade-in-0 slide-in-from-top-2 duration-500">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur-xl border border-slate-700/30">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-cyan-500/5"></div>
          <div className="relative p-4">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                <div className="absolute inset-0 bg-blue-400/20 rounded-full animate-ping"></div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  Searching for data...
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Running {toolCalls.length} tool{toolCalls.length > 1 ? "s" : ""}
                </div>
              </div>
              <Sparkles className="h-4 w-4 text-purple-400 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Don't show anything if no completed tool calls or card shouldn't be shown yet
  if (!showCard || toolCalls.length === 0) return null

  // Full view mode (expanded canvas-like view)
  if (fullView) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-0 duration-300">
        <div className="relative w-full max-w-7xl h-[90vh] overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900/95 via-slate-800/90 to-slate-900/95 backdrop-blur-xl border border-slate-700/30 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-cyan-500/5"></div>
          
          {/* Header */}
          <div className="relative flex items-center justify-between p-6 border-b border-slate-700/30 bg-gradient-to-r from-slate-800/50 to-slate-900/50">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
                <FileSearch className="h-6 w-6 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                  Tool Results
                </h2>
                <div className="flex items-center space-x-2 mt-1">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-green-400">
                    {toolCalls.length} tool{toolCalls.length > 1 ? "s" : ""} completed successfully
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-xl transition-all duration-200"
              onClick={() => setFullView(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="relative flex-1 overflow-y-auto p-6 space-y-6 tool-scrollbar">
            {toolCalls.map((toolCall, index) => (
              <div key={index} className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 via-purple-500 to-cyan-500 rounded-full"></div>
                <div className="ml-6 space-y-4">
                  {/* Tool header */}
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30">
                      <Sparkles className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent capitalize">
                        {toolCall.toolName?.replace(/([A-Z])/g, " $1").toLowerCase() || "Tool Execution"}
                      </h3>
                      <div className="flex items-center space-x-2 mt-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span className="text-xs text-green-400">Completed</span>
                      </div>
                    </div>
                  </div>

                  {/* Tool arguments */}
                  {toolCall.args && Object.keys(toolCall.args).length > 0 && (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm border border-slate-700/30">
                      <div className="text-sm text-slate-400 mb-2">Parameters</div>
                      <div className="text-sm text-slate-300 space-y-1">
                        {Object.entries(toolCall.args).map(([key, value]) => (
                          <div key={key} className="flex">
                            <span className="text-blue-400 font-medium min-w-[100px]">{key}:</span>
                            <span className="text-slate-300 ml-2">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tool results */}
                  {toolCall.result && (
                    <div className="space-y-4">
                      {/* Success/Error status */}
                      {typeof toolCall.result === "object" && toolCall.result.success !== undefined && (
                        <div className="flex items-center space-x-3 p-3 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                          <span className="text-green-400 font-medium">
                            {toolCall.result.message || "Success"}
                          </span>
                        </div>
                      )}

                      {/* Papers found - Enhanced grid */}
                      {toolCall.result.papers && toolCall.result.papers.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30">
                            <div className="flex items-center space-x-3">
                              <GraduationCap className="h-5 w-5 text-blue-400" />
                              <span className="text-slate-300 font-medium">
                                {toolCall.result.papers.length} Papers Found
                              </span>
                            </div>
                            {toolCall.result.source && (
                              <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-1 rounded-full">
                                {toolCall.result.source}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {toolCall.result.papers.map((paper: any, idx: number) => (
                              <div
                                key={idx}
                                className="group relative p-4 rounded-xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-sm border border-slate-700/30 hover:border-blue-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/5"
                              >
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                <div className="relative space-y-3">
                                  <div className="text-slate-200 font-medium leading-snug">{paper.title}</div>
                                  <div className="flex flex-wrap gap-2">
                                    {paper.examType && paper.examType !== "unknown" && (
                                      <span className="text-xs bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-300 px-3 py-1 rounded-full border border-blue-500/30">
                                        {paper.examType}
                                      </span>
                                    )}
                                    {paper.year && paper.year !== "unknown" && (
                                      <span className="text-xs bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 px-3 py-1 rounded-full border border-purple-500/30">
                                        {paper.year}
                                      </span>
                                    )}
                                  </div>
                                  {paper.metadata && (
                                    <div className="text-xs text-slate-400">{paper.metadata}</div>
                                  )}
                                  {paper.url && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 text-blue-400 hover:text-blue-300 border-blue-800/50 hover:border-blue-700 bg-blue-500/5 hover:bg-blue-500/10 transition-all duration-200"
                                      onClick={() => window.open(paper.url, "_blank")}
                                    >
                                      <ExternalLink className="h-3 w-3 mr-2" />
                                      Open Paper
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Faculty found - Enhanced cards */}
                      {toolCall.result.faculty && toolCall.result.faculty.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center space-x-3 p-4 rounded-xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30">
                            <Users className="h-5 w-5 text-purple-400" />
                            <span className="text-slate-300 font-medium">
                              {toolCall.result.faculty.length} Faculty Members
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {toolCall.result.faculty.map((faculty: any, idx: number) => (
                              <div
                                key={idx}
                                className="group p-4 rounded-xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-sm border border-slate-700/30 hover:border-purple-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/5"
                              >
                                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                <div className="relative space-y-3">
                                  <div className="text-slate-200 font-semibold">{faculty.name}</div>
                                  <div className="text-purple-400 font-medium">{faculty.department}</div>
                                  {faculty.specialization && faculty.specialization !== "N/A" && (
                                    <div className="text-sm text-slate-400">
                                      <span className="font-medium text-slate-300">Specialization:</span>
                                      <br />
                                      {faculty.specialization}
                                    </div>
                                  )}
                                  <div className="space-y-2">
                                    {faculty.email && faculty.email !== "N/A" && (
                                      <div className="text-sm text-blue-400 font-medium">{faculty.email}</div>
                                    )}
                                    {faculty.office && faculty.office !== "N/A" && (
                                      <div className="text-xs text-slate-500 bg-slate-700/30 px-2 py-1 rounded-full inline-block">
                                        Office: {faculty.office}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Placement statistics - Enhanced display */}
                      {toolCall.result.data?.statistics && (
                        <div className="space-y-4">
                          <div className="flex items-center space-x-3 p-4 rounded-xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30">
                            <TrendingUp className="h-5 w-5 text-green-400" />
                            <span className="text-slate-300 font-medium">Placement Statistics</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Object.entries(toolCall.result.data.statistics).map(([key, value]: [string, any]) => (
                              <div
                                key={key}
                                className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 text-center"
                              >
                                <div className="text-2xl font-bold text-green-400 mb-1">{value}</div>
                                <div className="text-sm text-slate-400 capitalize">{key.replace(/([A-Z])/g, " $1")}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Companies - Enhanced grid */}
                      {toolCall.result.data?.companies && toolCall.result.data.companies.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center space-x-3 p-4 rounded-xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30">
                            <Building2 className="h-5 w-5 text-cyan-400" />
                            <span className="text-slate-300 font-medium">
                              {toolCall.result.data.companies.length} Companies
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {toolCall.result.data.companies.map((company: any, idx: number) => (
                              <div
                                key={idx}
                                className="group p-4 rounded-xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 backdrop-blur-sm border border-slate-700/30 hover:border-cyan-500/30 transition-all duration-300"
                              >
                                <div className="text-slate-200 font-semibold mb-2">{company.name}</div>
                                <div className="text-cyan-400 font-bold text-lg">{company.package}</div>
                                {company.positions && (
                                  <div className="text-xs text-slate-400 mt-2 bg-slate-700/30 px-2 py-1 rounded-full">
                                    {company.positions}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recent offers - Enhanced table */}
                      {toolCall.result.data?.recentOffers && toolCall.result.data.recentOffers.length > 0 && (
                        <div className="space-y-4">
                          <div className="flex items-center space-x-3 p-4 rounded-xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30">
                            <TrendingUp className="h-5 w-5 text-yellow-400" />
                            <span className="text-slate-300 font-medium">
                              {toolCall.result.data.recentOffers.length} Recent Offers
                            </span>
                          </div>
                          <div className="overflow-hidden rounded-xl border border-slate-700/30">
                            <div className="overflow-x-auto">
                              <table className="w-full">
                                <thead>
                                  <tr className="bg-gradient-to-r from-slate-800/50 to-slate-900/50 border-b border-slate-700/30">
                                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Student</th>
                                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Company</th>
                                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Package</th>
                                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Date</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {toolCall.result.data.recentOffers.map((offer: any, idx: number) => (
                                    <tr
                                      key={idx}
                                      className="border-b border-slate-800/50 hover:bg-gradient-to-r hover:from-slate-800/20 hover:to-slate-900/20 transition-all duration-200"
                                    >
                                      <td className="py-3 px-4 text-slate-300 font-medium">{offer.student}</td>
                                      <td className="py-3 px-4 text-slate-300">{offer.company}</td>
                                      <td className="py-3 px-4 text-green-400 font-semibold">{offer.package}</td>
                                      <td className="py-3 px-4 text-slate-400">{offer.date}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Regular compact view
  return (
    <div className="mt-3 animate-in fade-in-0 slide-in-from-top-2 duration-500">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur-xl border border-slate-700/30 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 via-blue-500/5 to-purple-500/5"></div>
        
        {/* Header */}
        <div className="relative p-4 bg-gradient-to-r from-slate-800/50 to-slate-900/50 border-b border-slate-700/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              </div>
              <div>
                <div className="text-sm font-medium bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                  Data retrieved successfully
                </div>
                <div className="flex items-center space-x-2 mt-1">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-green-400">
                    {toolCalls.length} tool{toolCalls.length > 1 ? "s" : ""} completed
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all duration-200"
                onClick={() => setFullView(true)}
                title="Expand to full view"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all duration-200"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Expandable content */}
        <div
          className={cn(
            "transition-all duration-300 ease-in-out overflow-hidden",
            expanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="relative p-4 space-y-4">
            {toolCalls.map((toolCall, index) => (
              <div key={index} className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 via-purple-500 to-cyan-500 rounded-full"></div>
                <div className="ml-4 space-y-3">
                  {/* Tool header */}
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30">
                      <Sparkles className="h-3 w-3 text-blue-400" />
                    </div>
                    <h4 className="font-medium bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent capitalize">
                      {toolCall.toolName?.replace(/([A-Z])/g, " $1").toLowerCase() || "Tool Execution"}
                    </h4>
                    <div className="flex items-center space-x-1">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                      <span className="text-xs text-green-400">Completed</span>
                    </div>
                  </div>

                  {/* Tool arguments */}
                  {toolCall.args && Object.keys(toolCall.args).length > 0 && (
                    <div className="text-xs p-3 rounded-xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30">
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
                    <div className="space-y-3">
                      {/* Success status */}
                      {typeof toolCall.result === "object" && toolCall.result.success !== undefined && (
                        <div className="flex items-center space-x-2 p-2 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                          <span className="text-xs text-green-400 font-medium">
                            {toolCall.result.message || "Success"}
                          </span>
                        </div>
                      )}

                      {/* Papers found - Compact view */}
                      {toolCall.result.papers && toolCall.result.papers.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2 text-xs">
                            <GraduationCap className="h-4 w-4 text-blue-400" />
                            <span className="text-slate-400">
                              {toolCall.result.papers.length} papers found
                              {toolCall.result.totalFound &&
                                toolCall.result.totalFound > toolCall.result.papers.length &&
                                ` (showing ${toolCall.result.papers.length} of ${toolCall.result.totalFound})`}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {toolCall.result.papers.slice(0, 3).map((paper: any, idx: number) => (
                              <div
                                key={idx}
                                className="group p-3 rounded-xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30 hover:border-blue-500/30 transition-all duration-200"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 space-y-2">
                                    <div className="text-sm text-slate-300 font-medium leading-snug line-clamp-2">
                                      {paper.title}
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {paper.examType && paper.examType !== "unknown" && (
                                        <span className="text-xs bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-300 px-2 py-1 rounded-full border border-blue-500/30">
                                          {paper.examType}
                                        </span>
                                      )}
                                      {paper.year && paper.year !== "unknown" && (
                                        <span className="text-xs bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 px-2 py-1 rounded-full border border-purple-500/30">
                                          {paper.year}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {paper.url && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg ml-2 transition-all duration-200"
                                      onClick={() => window.open(paper.url, "_blank")}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {toolCall.result.papers.length > 3 && (
                            <div className="flex items-center justify-between pt-2">
                              <span className="text-xs text-slate-400">
                                +{toolCall.result.papers.length - 3} more papers
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-blue-400 hover:text-blue-300 p-0 font-medium"
                                onClick={() => setFullView(true)}
                              >
                                View all →
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Faculty found - Compact view */}
                      {toolCall.result.faculty && toolCall.result.faculty.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2 text-xs">
                            <Users className="h-4 w-4 text-purple-400" />
                            <span className="text-slate-400">{toolCall.result.faculty.length} faculty members</span>
                          </div>
                          <div className="space-y-2">
                            {toolCall.result.faculty.slice(0, 2).map((faculty: any, idx: number) => (
                              <div
                                key={idx}
                                className="p-3 rounded-xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30 hover:border-purple-500/30 transition-all duration-200"
                              >
                                <div className="space-y-1">
                                  <div className="text-sm text-slate-300 font-semibold">{faculty.name}</div>
                                  <div className="text-xs text-purple-400 font-medium">{faculty.department}</div>
                                  {faculty.email && faculty.email !== "N/A" && (
                                    <div className="text-xs text-blue-400">{faculty.email}</div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          {toolCall.result.faculty.length > 2 && (
                            <div className="flex items-center justify-between pt-2">
                              <span className="text-xs text-slate-400">
                                +{toolCall.result.faculty.length - 2} more faculty
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-purple-400 hover:text-purple-300 p-0 font-medium"
                                onClick={() => setFullView(true)}
                              >
                                View all →
                              </Button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Placement statistics - Compact view */}
                      {toolCall.result.data?.statistics && (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2 text-xs">
                            <TrendingUp className="h-4 w-4 text-green-400" />
                            <span className="text-slate-400">Placement statistics</span>
                          </div>
                          <div className="p-3 rounded-xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {Object.entries(toolCall.result.data.statistics)
                                .slice(0, 4)
                                .map(([key, value]: [string, any]) => (
                                  <div key={key} className="flex justify-between">
                                    <span className="text-slate-400 capitalize">{key}:</span>
                                    <span className="text-green-400 font-semibold">{value}</span>
                                  </div>
                                ))}
                            </div>
                            {Object.keys(toolCall.result.data.statistics).length > 4 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-full text-xs text-green-400 hover:text-green-300 p-0 mt-2 font-medium"
                                onClick={() => setFullView(true)}
                              >
                                View all statistics →
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Companies - Compact view */}
                      {toolCall.result.data?.companies && toolCall.result.data.companies.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2 text-xs">
                            <Building2 className="h-4 w-4 text-cyan-400" />
                            <span className="text-slate-400">
                              {toolCall.result.data.companies.length} companies
                            </span>
                          </div>
                          <div className="space-y-2">
                            {toolCall.result.data.companies.slice(0, 2).map((company: any, idx: number) => (
                              <div
                                key={idx}
                                className="p-3 rounded-xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-700/30"
                              >
                                <div className="flex justify-between items-center">
                                  <div className="text-sm text-slate-300 font-semibold">{company.name}</div>
                                  <div className="text-sm text-cyan-400 font-bold">{company.package}</div>
                                </div>
                                {company.positions && (
                                  <div className="text-xs text-slate-400 mt-1">{company.positions}</div>
                                )}
                              </div>
                            ))}
                          </div>
                          {toolCall.result.data.companies.length > 2 && (
                            <div className="flex items-center justify-between pt-2">
                              <span className="text-xs text-slate-400">
                                +{toolCall.result.data.companies.length - 2} more companies
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-cyan-400 hover:text-cyan-300 p-0 font-medium"
                                onClick={() => setFullView(true)}
                              >
                                View all →
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
