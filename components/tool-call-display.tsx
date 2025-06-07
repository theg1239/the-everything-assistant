"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
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
      <div className="mt-3 animate-in fade-in-0 slide-in-from-top-2 duration-300">
        <div className="relative overflow-hidden rounded-3xl glass-effect-strong border border-slate-700/30 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 animate-gradient"></div>
          <div className="relative p-4">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                <div className="absolute inset-0 bg-blue-400/20 rounded-full animate-pulse-glow"></div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium gradient-text">
                  Searching for data...
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Running {toolCalls.length} tool{toolCalls.length > 1 ? "s" : ""}
                </div>
              </div>
              <Sparkles className="h-4 w-4 text-purple-400 animate-pulse-smooth" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Don't show anything if no completed tool calls or card shouldn't be shown yet
  if (!showCard || toolCalls.length === 0) return null
  // Full view modal component (rendered via portal)
  const FullViewModal = () => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in-0 duration-300">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={() => setFullView(false)}
      />
      {/* Dialog */}
      <div className="relative w-full max-w-6xl h-[85vh] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-8 duration-300">
        {/* Glass background */}
        <div className="absolute inset-0 glass-effect-strong rounded-3xl shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-3xl animate-gradient"></div>
        </div>
        
        {/* Content Container */}
        <div className="relative h-full flex flex-col">
          {/* Enhanced Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-700/40 rounded-t-3xl">
            <div className="flex items-center space-x-4">
              <div className="relative p-3 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
                <div className="absolute inset-0 bg-green-400/10 rounded-2xl animate-pulse-glow"></div>
                <FileSearch className="h-7 w-7 text-green-400 relative z-10" />
              </div>
              <div>
                <h2 className="text-2xl font-light gradient-text">
                  Tool Results
                </h2>
                <div className="flex items-center space-x-3 mt-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse-glow"></div>
                    <span className="text-sm text-green-400 font-medium">
                      {toolCalls.length} tool{toolCalls.length > 1 ? "s" : ""} completed
                    </span>
                  </div>
                  <div className="w-1 h-1 bg-slate-500 rounded-full"></div>
                  <span className="text-xs text-slate-400">
                    Expand to view detailed results
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-12 w-12 p-0 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-2xl transition-all duration-200 group"
              onClick={() => setFullView(false)}
            >
              <X className="h-5 w-5 transition-transform group-hover:scale-110" />
            </Button>
          </div>

          {/* Enhanced Content Area */}
          <div className="flex-1 overflow-y-auto tool-scrollbar">
            <div className="p-6 space-y-8">                {toolCalls.map((toolCall, index) => (
                <div key={index} className="relative group">
                  {/* Timeline indicator */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 via-purple-500 to-cyan-500 rounded-full opacity-80"></div>
                  
                  {/* Tool Card */}
                  <div className="ml-8 space-y-6">
                    {/* Tool Header */}
                    <div className="flex items-center space-x-4">
                      <div className="relative p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/40 group-hover:border-blue-400/60 transition-all duration-300">
                        <div className="absolute inset-0 bg-blue-400/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <Sparkles className="h-6 w-6 text-blue-400 relative z-10" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-medium gradient-text capitalize">
                          {toolCall.toolName?.replace(/([A-Z])/g, " $1").toLowerCase() || "Tool Execution"}
                        </h3>
                        <div className="flex items-center space-x-3 mt-1">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse-glow"></div>
                            <span className="text-sm text-green-400 font-medium">Completed</span>
                          </div>
                          <div className="w-1 h-1 bg-slate-500 rounded-full"></div>
                          <span className="text-xs text-slate-400">
                            Step {index + 1} of {toolCalls.length}
                          </span>
                        </div>
                      </div>
                    </div>                    {/* Tool Arguments */}
                    {toolCall.args && Object.keys(toolCall.args).length > 0 && (
                      <div className="p-5 rounded-2xl glass-effect border border-slate-700/40 group-hover:border-slate-600/60 transition-all duration-300">
                        <div className="flex items-center space-x-2 mb-4">
                          <div className="w-4 h-4 rounded bg-blue-500/20 flex items-center justify-center">
                            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                          </div>
                          <span className="text-sm font-medium text-slate-300">Parameters</span>
                        </div>
                        <div className="space-y-2">
                          {Object.entries(toolCall.args).map(([key, value]) => (
                            <div key={key} className="flex items-start space-x-3 py-1">
                              <span className="text-blue-400 font-medium text-sm min-w-[120px] flex-shrink-0 capitalize">
                                {key}:
                              </span>
                              <span className="text-slate-300 text-sm flex-1 break-words">
                                {String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tool Results */}
                    {toolCall.result && (
                      <div className="space-y-4">
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 rounded bg-green-500/20 flex items-center justify-center">
                            <CheckCircle2 className="w-3 h-3 text-green-400" />
                          </div>
                          <span className="text-sm font-medium text-slate-300">Results</span>
                        </div>                        {/* Success/Error status */}
                        {typeof toolCall.result === "object" && toolCall.result.success !== undefined && (
                          <div className="flex items-center space-x-3 p-3 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                            <CheckCircle2 className="h-5 w-5 text-green-400 animate-pulse-glow" />
                            <span className="text-green-400 font-medium">
                              {toolCall.result.message || "Success"}
                            </span>
                          </div>
                        )}                        {/* Papers found - Enhanced grid */}
                        {toolCall.result.papers && toolCall.result.papers.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-xl glass-effect border border-slate-700/30">
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
                                  className="group relative p-4 rounded-xl glass-effect border border-slate-700/30 hover:border-blue-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/5 card-hover-effect"
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
                                        className="text-xs h-7 border-blue-500/30 text-blue-300 hover:bg-blue-500/10 group-hover:border-blue-500/50"
                                        onClick={() => window.open(paper.url, "_blank")}
                                      >
                                        <ExternalLink className="w-3 h-3 mr-1" />
                                        View
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}                        {/* Faculty found */}
                        {toolCall.result.faculty && toolCall.result.faculty.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-xl glass-effect border border-slate-700/30">
                              <div className="flex items-center space-x-3">
                                <Users className="h-5 w-5 text-purple-400" />
                                <span className="text-slate-300 font-medium">
                                  {toolCall.result.faculty.length} Faculty Members Found
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {toolCall.result.faculty.map((member: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="group relative p-4 rounded-xl glass-effect border border-slate-700/30 hover:border-purple-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/5 card-hover-effect"
                                >
                                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                  <div className="relative space-y-3">
                                    <div className="text-slate-200 font-medium leading-snug">{member.name}</div>
                                    {member.designation && (
                                      <div className="text-slate-400 text-sm">{member.designation}</div>
                                    )}
                                    {member.department && (
                                      <span className="text-xs bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 px-3 py-1 rounded-full border border-purple-500/30">
                                        {member.department}
                                      </span>
                                    )}
                                    {member.email && (
                                      <div className="text-xs text-slate-400">{member.email}</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}                        {/* Companies found */}
                        {toolCall.result.companies && toolCall.result.companies.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-xl glass-effect border border-slate-700/30">
                              <div className="flex items-center space-x-3">
                                <Building2 className="h-5 w-5 text-cyan-400" />
                                <span className="text-slate-300 font-medium">
                                  {toolCall.result.companies.length} Companies Found
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {toolCall.result.companies.map((company: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="group relative p-4 rounded-xl glass-effect border border-slate-700/30 hover:border-cyan-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5 card-hover-effect"
                                >
                                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                  <div className="relative space-y-3">
                                    <div className="text-slate-200 font-medium leading-snug">{company.name}</div>
                                    {company.package && (
                                      <div className="text-slate-400 text-sm">Package: {company.package}</div>
                                    )}
                                    {company.role && (
                                      <span className="text-xs bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 px-3 py-1 rounded-full border border-cyan-500/30">
                                        {company.role}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Statistics data */}
                        {toolCall.result.data && (
                          <div className="space-y-4">
                            <div className="flex items-center space-x-3 p-4 rounded-xl glass-effect border border-slate-700/30">
                              <TrendingUp className="h-5 w-5 text-green-400" />
                              <span className="text-slate-300 font-medium">Statistics & Data</span>
                            </div>

                            {toolCall.result.data.recentOffers && (
                              <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
                                <div className="text-green-400 font-medium mb-2">Recent Placement Offers</div>
                                <div className="text-green-300 text-sm">
                                  {toolCall.result.data.recentOffers.length} recent offers found
                                </div>
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
    </div>
  )
  return (
    <>
      {/* Compact view */}
      <div className="mt-3 animate-in fade-in-0 slide-in-from-top-2 duration-300">
        <div className="relative overflow-hidden rounded-3xl glass-effect-strong border border-slate-700/30 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 animate-gradient"></div>
          
          {/* Header */}
          <div className="relative p-4 border-b border-slate-700/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                </div>
                <div>
                  <div className="text-sm font-medium gradient-text">
                    Data retrieved successfully
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse-glow"></div>
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

          {/* Compact Content */}
          {expanded && (
            <div className="relative p-4 space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
              {toolCalls.map((toolCall, index) => (
                <div key={index} className="space-y-3 border-l-2 border-blue-500/30 pl-4">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-slate-300 font-medium capitalize">
                      {toolCall.toolName?.replace(/([A-Z])/g, " $1").toLowerCase() || "Tool Execution"}
                    </span>
                  </div>
                  
                  {toolCall.result && (
                    <div className="ml-6 space-y-2">
                      {/* Basic result summary */}
                      {toolCall.result.papers && (
                        <div className="text-xs text-slate-400">
                          Found {toolCall.result.papers.length} papers
                        </div>
                      )}
                      {toolCall.result.faculty && (
                        <div className="text-xs text-slate-400">
                          Found {toolCall.result.faculty.length} faculty members
                        </div>
                      )}
                      {toolCall.result.companies && (
                        <div className="text-xs text-slate-400">
                          Found {toolCall.result.companies.length} companies
                        </div>
                      )}
                      {toolCall.result.data?.recentOffers && (
                        <div className="text-xs text-slate-400">
                          Found {toolCall.result.data.recentOffers.length} recent placement offers
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full view modal rendered via portal */}
      {fullView && typeof document !== 'undefined' && createPortal(<FullViewModal />, document.body)}
    </>
  )
}
