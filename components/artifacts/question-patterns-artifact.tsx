'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, ListChecks, Copy, ExternalLink } from 'lucide-react'
import React from 'react'
import { OptimizedMarkdown } from '@/components/optimized-markdown'

export default function QuestionPatternsArtifact({ data }: { data: any }) {
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({})
  const [showAllKeywords, setShowAllKeywords] = React.useState(false)
  const [copiedStates, setCopiedStates] = React.useState<Record<string, boolean>>({})

  const toggle = (i: number) => setExpanded(s => ({ ...s, [i]: !s[i] }))

  const totals = data?.totals || {}
  const patterns = Array.isArray(data?.topPatterns) ? data.topPatterns : []
  const keywords = Array.isArray(data?.topKeywords) ? data.topKeywords : []

  const copy = async (text?: string, key?: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(String(text))
      if (key) {
        setCopiedStates(prev => ({ ...prev, [key]: true }))
        setTimeout(() => {
          setCopiedStates(prev => ({ ...prev, [key]: false }))
        }, 2000)
      }
    } catch {}
  }

  return (
    <Card className="hover:shadow-md transition-shadow border-0">
      <CardContent className="p-4 sm:p-6 space-y-5 border-0">
        {data?.message && (
          <div className="text-sm sm:text-[15px] text-foreground/90 whitespace-pre-wrap break-words flex items-start sm:items-center gap-3">
            <ListChecks className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500 shrink-0 mt-0.5 sm:mt-0" />
            <span>{data.message}</span>
          </div>
        )}

        {(totals?.papers || totals?.questions || totals?.distinctPatterns) && (
          <div className="flex flex-wrap gap-2.5 text-[11px] sm:text-xs">
            {typeof totals.papers !== 'undefined' && (
              <Badge variant="outline" className="rounded-full px-3 py-1">
                papers: {totals.papers}
              </Badge>
            )}
            {typeof totals.questions !== 'undefined' && (
              <Badge variant="outline" className="rounded-full px-3 py-1">
                questions: {totals.questions}
              </Badge>
            )}
            {typeof totals.distinctPatterns !== 'undefined' && (
              <Badge variant="outline" className="rounded-full px-3 py-1">
                patterns: {totals.distinctPatterns}
              </Badge>
            )}
            {data?.examType && (
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                exam: {String(data.examType)}
              </Badge>
            )}
            {data?.courseCode && (
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                course: {String(data.courseCode)}
              </Badge>
            )}
          </div>
        )}

        {keywords.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              top keywords
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {(showAllKeywords ? keywords : keywords.slice(0, 16)).map((k: any, i: number) => (
                <Badge key={i} variant="outline" className="text-[11px] px-2.5 py-1">
                  {k.token}
                  <span className="ml-1.5 text-muted-foreground font-medium">{k.count}</span>
                </Badge>
              ))}
              {keywords.length > 16 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-3"
                  onClick={() => setShowAllKeywords(s => !s)}
                >
                  {showAllKeywords ? 'show less' : `+${keywords.length - 16} more`}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {patterns.map((p: any, i: number) => {
            const isOpen = !!expanded[i]
            const sampleQs = Array.isArray(p.sampleQuestions) ? p.sampleQuestions : []
            const samplePapers = Array.isArray(p.samplePapers) ? p.samplePapers : []
            const copyKey = `pattern-${i}`
            const isCopied = copiedStates[copyKey]

            return (
              <div
                key={i}
                className="p-4 sm:p-5 rounded-lg border border-border/50 bg-card/50 transition-all duration-200 hover:border-border/70 hover:bg-card/70"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="secondary" className="rounded-full px-3 py-1 font-medium">
                        {p.count}×
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <code className="text-[11px] sm:text-xs bg-muted px-3 py-2 rounded-md break-words overflow-x-auto inline-block max-w-full border border-border/30">
                          {String(p.pattern)}
                        </code>
                      </div>
                      <Button
                        variant={isCopied ? 'default' : 'outline'}
                        size="sm"
                        className={`h-8 text-[11px] px-3 transition-colors ${isCopied ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                        onClick={() => copy(p.pattern, copyKey)}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        {isCopied ? 'copied!' : 'copy'}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {sampleQs
                        .slice(0, isOpen ? sampleQs.length : 2)
                        .map((q: string, idx: number) => (
                          <div
                            key={idx}
                            className="text-[11px] sm:text-xs text-muted-foreground py-1 break-words leading-relaxed"
                          >
                            <OptimizedMarkdown id={`pattern-q-${i}-${idx}`} content={q} />
                          </div>
                        ))}
                      {!isOpen && sampleQs.length > 2 && (
                        <div className="text-[11px] text-muted-foreground/70 italic">
                          +{sampleQs.length - 2} more questions...
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    aria-label={isOpen ? 'collapse' : 'expand'}
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 transition-all duration-200"
                    onClick={() => toggle(i)}
                  >
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {isOpen && samplePapers.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/40">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      sample papers
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {samplePapers.map((sp: any, sidx: number) => (
                        <div
                          key={sidx}
                          className="text-[11px] sm:text-xs text-muted-foreground p-2 rounded bg-muted/30 border border-border/20"
                        >
                          {sp.url ? (
                            <a
                              href={sp.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-between w-full gap-2 hover:text-foreground transition-colors group"
                            >
                              <span className="break-words">
                                {sp.title || 'paper'}
                                {sp.year ? ` • ${sp.year}` : ''}
                                {sp.examType ? ` • ${sp.examType}` : ''}
                              </span>
                              <ExternalLink className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />
                            </a>
                          ) : (
                            <span className="break-words">
                              {sp.title || 'paper'}
                              {sp.year ? ` • ${sp.year}` : ''}
                              {sp.examType ? ` • ${sp.examType}` : ''}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
