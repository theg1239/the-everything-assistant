'use client'

import React, { useState, memo, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileSearch,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Maximize2,
  X,
  Users,
  Building2,
  GraduationCap,
  TrendingUp,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Globe,
  UtensilsCrossed,
  Clock,
  User,
  BookOpen,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Info,
  Map,
  Building,
  Info as InfoIcon,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ResponsiveCard } from '@/components/responsive-card'
import { ResponsiveTable } from '@/components/responsive-table'

interface ArtifactDisplayProps {
  title: string
  icon?: React.ReactNode
  data: any
  type:
    | 'papers'
    | 'faculty'
    | 'companies'
    | 'placements'
    | 'mess-menu'
    | 'vtop-data'
    | 'general'
    | 'interactive-course-page'
    | 'reddit-knowledge'
    | 'reddit-overview'
    | 'error'
    | 'campus-info'
  className?: string
  onLoginClick?: () => void
}

const VTOPDataCard = ({ vtopData, onLoginClick }: { vtopData: any; onLoginClick?: () => void }) => {
  const {
    command,
    content,
    rawOutput,
    success,
    data,
    parsedData,
    formatted_content,
    structured_data,
    summary,
    error,
    message,
  } = vtopData
  const CUSTOM_RENDER_COMMANDS = ['attendance']
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [expandedSubject, setExpandedSubject] = useState<number | null>(null)

  if (vtopData.requiresCredentials === true) {
    return null
  }
  if (success === false || error) {
    let errorMessage = error || message || ''

    if (!errorMessage || errorMessage === '500') {
      if (rawOutput && typeof rawOutput === 'string') {
        if (
          rawOutput.includes('Login failed') ||
          rawOutput.includes('session could not be established')
        ) {
          errorMessage = 'Login failed - incorrect username/password'
        } else if (rawOutput.includes('Invalid LoginId/Password')) {
          errorMessage = 'Invalid LoginId/Password'
        } else if (
          rawOutput.includes('credentials required') ||
          rawOutput.includes('VTOP credentials required')
        ) {
          errorMessage = 'VTOP credentials required'
        }
      }
    }

    const isCredentialError =
      errorMessage.includes('VTOP credentials required') || errorMessage.includes('credentials')
    const isAuthError =
      errorMessage.includes('Invalid LoginId/Password') ||
      errorMessage.includes('Login failed') ||
      errorMessage.includes('session could not be established') ||
      errorMessage.includes('incorrect username/password')

    if (isCredentialError || isAuthError) {
      return null
    }
  }

  const formatCommandName = (cmd: string) => {
    const commandMap: { [key: string]: string } = {
      'class-message': 'Class Message',
      'exam-schedule': 'Exam Schedule',
      'library-dues': 'Library Dues',
      'leave-status': 'Leave Status',
      nightslip: 'Night Slip',
      'course-page': 'Course Page',
    }
    return commandMap[cmd] || cmd.charAt(0).toUpperCase() + cmd.slice(1).replace(/-/g, ' ')
  }

  const renderCustomVTOPCommand = (command: string, content: any) => {
    switch (command) {
      case 'attendance':
        if (Array.isArray(content) && content.length > 0) {
          const validSubjects = content.filter((subject: any) => {
            const subjectName = subject.SUBJECT || subject.subject || subject.name || ''
            const percentage = parseFloat(
              subject.PERCENTAGE || subject.percentage || subject.attendance || '0'
            )
            const attended =
              subject['CLASSES ATTENDED'] || subject.attended || subject.classesAttended || '0'
            const total = subject['TOTAL CLASSES'] || subject.total || subject.totalClasses || '0'

            return (
              subjectName &&
              !subjectName.match(/^Subject \d+$/i) &&
              subjectName.trim() !== '' &&
              !(
                percentage === 0 &&
                (attended === '0' || attended === 'N/A') &&
                (total === '0' || total === 'N/A')
              )
            )
          })

          if (validSubjects.length === 0) {
            return (
              <div className="text-muted-foreground text-sm">No attendance data available.</div>
            )
          }

          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-card-foreground">Attendance Summary</h3>
              </div>

              <div className="grid gap-3">
                {validSubjects.map((subject: any, index: number) => {
                  const subjectName =
                    subject.SUBJECT || subject.subject || subject.name || `Subject ${index + 1}`
                  const percentage = parseFloat(
                    subject.PERCENTAGE || subject.percentage || subject.attendance || '0'
                  )
                  const attended =
                    subject['CLASSES ATTENDED'] ||
                    subject.attended ||
                    subject.classesAttended ||
                    'N/A'
                  const total =
                    subject['TOTAL CLASSES'] || subject.total || subject.totalClasses || 'N/A'
                  let alert = subject['75% ALERT'] || subject.alert || subject.status || ''

                  if (alert) {
                    alert = alert
                      .replace(/[^\x20-\x7E]/g, '')
                      .replace(/\s+/g, ' ')
                      .trim()
                  }

                  const getStatusColor = (percent: number) => {
                    if (percent >= 85) return 'text-green-400 bg-green-500/10 border-green-500/20'
                    if (percent >= 75) return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    return 'text-red-400 bg-red-500/10 border-red-500/20'
                  }

                  const getProgressColor = (percent: number) => {
                    if (percent >= 85) return 'bg-green-500'
                    if (percent >= 75) return 'bg-amber-500'
                    return 'bg-red-500'
                  }

                  const isExpanded = expandedSubject === index

                  return (
                    <div
                      key={index}
                      className={`p-3 sm:p-4 rounded-lg border ${getStatusColor(percentage)}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4" />
                          <span className="font-medium text-sm truncate max-w-[150px] sm:max-w-none">
                            {subjectName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{percentage.toFixed(1)}%</span>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="w-full bg-muted/40 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(percentage)}`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                      </div>

                      {isMobile && !isExpanded ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedSubject(isExpanded ? null : index)}
                          className="w-full text-xs mt-1 h-7"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3 w-3 mr-1" />
                              Show Less
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3 mr-1" />
                              Show Details
                            </>
                          )}
                        </Button>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-4 text-xs mb-2">
                            {attended !== 'N/A' && total !== 'N/A' && (
                              <div className="flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                <span>
                                  Classes: {attended}/{total}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              <span>Required: 75%</span>
                            </div>
                          </div>

                          {alert && (
                            <div
                              className={`text-xs font-medium p-2 rounded border ${
                                alert.includes('Can miss') || alert.includes('safe')
                                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                  : 'bg-red-500/10 text-red-400 border-red-500/20'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                {alert.includes('Can miss') || alert.includes('safe') ? (
                                  <CheckCircle className="h-3 w-3" />
                                ) : (
                                  <AlertTriangle className="h-3 w-3" />
                                )}
                                {alert}
                              </div>
                            </div>
                          )}

                          <div className="mt-2 text-xs text-muted-foreground">
                            {percentage >= 85 && (
                              <span className="text-green-400">✓ Excellent attendance</span>
                            )}
                            {percentage >= 75 && percentage < 85 && (
                              <span className="text-amber-400">
                                ⚠ Good attendance, stay consistent
                              </span>
                            )}
                            {percentage < 75 && (
                              <span className="text-red-400">⚠ Below minimum requirement</span>
                            )}
                          </div>

                          {isMobile && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedSubject(null)}
                              className="w-full text-xs mt-2 h-7"
                            >
                              <ChevronUp className="h-3 w-3 mr-1" />
                              Show Less
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 p-3 bg-muted/50 rounded-md">
                <div className="text-xs font-medium text-card-foreground mb-2">Summary:</div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div className="text-center">
                    <div className="text-green-600 font-medium">
                      {
                        validSubjects.filter(
                          (s: any) => parseFloat(s.PERCENTAGE || s.percentage || '0') >= 85
                        ).length
                      }
                    </div>
                    <div className="text-muted-foreground">Excellent</div>
                  </div>
                  <div className="text-center">
                    <div className="text-amber-600 font-medium">
                      {
                        validSubjects.filter((s: any) => {
                          const p = parseFloat(s.PERCENTAGE || s.percentage || '0')
                          return p >= 75 && p < 85
                        }).length
                      }
                    </div>
                    <div className="text-muted-foreground">Good</div>
                  </div>
                  <div className="text-center">
                    <div className="text-red-600 font-medium">
                      {
                        validSubjects.filter(
                          (s: any) => parseFloat(s.PERCENTAGE || s.percentage || '0') < 75
                        ).length
                      }
                    </div>
                    <div className="text-muted-foreground">Below 75%</div>
                  </div>
                </div>
              </div>
            </div>
          )
        }
        break

      case 'marks':
        const formattedContent =
          vtopData.formatted_content || vtopData.parsedData?.formatted_content
        if (formattedContent) {
          return (
            <div className="space-y-3">
              <div className="p-3 bg-muted/50 rounded-md overflow-x-auto">
                <div
                  className="text-sm text-muted-foreground prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: formattedContent }}
                />
              </div>
            </div>
          )
        }
        if (Array.isArray(content) && content.length > 0) {
          const headers = Object.keys(content[0])
          const columns = headers.map(header => ({
            key: header,
            header: header,
          }))
          return (
            <div className="space-y-3">
              <ResponsiveTable
                data={content}
                columns={columns}
                maxMobileColumns={3}
                emptyMessage="No marks data available"
              />
            </div>
          )
        }
        break

      case 'profile':
        let profileData: any = {}

        if (typeof content === 'object' && content !== null) {
          if (Array.isArray(content)) {
            content.forEach((item: any) => {
              if (typeof item === 'object' && item !== null) {
                Object.assign(profileData, item)
              }
            })
          } else {
            profileData = content
          }
        }

        if (profileData && Object.keys(profileData).length > 0) {
          const [showAllKeys, setShowAllKeys] = useState(false)
          const visibleKeys = isMobile
            ? Object.keys(profileData).slice(0, 5)
            : Object.keys(profileData)
          const hiddenKeys = isMobile ? Object.keys(profileData).slice(5) : []

          const keysToRender = showAllKeys ? Object.keys(profileData) : visibleKeys

          return (
            <div className="space-y-3">
              {keysToRender.map(key => {
                const value = profileData[key]
                if (value === null || value === undefined || value === '') return null

                const formattedKey = key
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/^./, str => str.toUpperCase())
                  .replace(/Id$/, 'ID')
                  .replace(/Cgpa/, 'CGPA')
                  .replace(/Gpa/, 'GPA')

                return (
                  <div key={key} className="flex items-start gap-3">
                    <User className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-card-foreground block">
                        {formattedKey}
                      </span>
                      <span className="text-xs text-muted-foreground break-words">
                        {String(value)}
                      </span>
                    </div>
                  </div>
                )
              })}

              {isMobile && hiddenKeys.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllKeys(!showAllKeys)}
                  className="w-full text-xs mt-2"
                >
                  {showAllKeys ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      Show {hiddenKeys.length} More Fields
                    </>
                  )}
                </Button>
              )}
            </div>
          )
        }
        break
      default:
        return null
    }
    return null
  }

  const renderVTOPContent = () => {
    const [showRawData, setShowRawData] = useState(false)
    if (success === false || error) {
      let errorMessage = error || message || 'An error occurred while retrieving VTOP data'

      if ((!errorMessage || errorMessage === '500') && rawOutput && typeof rawOutput === 'string') {
        if (
          rawOutput.includes('Login failed') ||
          rawOutput.includes('session could not be established')
        ) {
          errorMessage = 'Login failed - incorrect username/password'
        } else if (rawOutput.includes('Invalid LoginId/Password')) {
          errorMessage = 'Invalid LoginId/Password'
        } else if (
          rawOutput.includes('credentials required') ||
          rawOutput.includes('VTOP credentials required')
        ) {
          errorMessage = 'VTOP credentials required'
        } else if (rawOutput.includes('error')) {
          const lines = rawOutput.split('\n')
          const errorLine = lines.find(
            line => line.toLowerCase().includes('error') || line.toLowerCase().includes('invalid')
          )
          if (errorLine) {
            const cleanError = errorLine
              .replace(/^[^"]*"/, '')
              .replace(/"[^"]*$/, '')
              .replace(/\\n/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
            if (cleanError) {
              errorMessage = cleanError
            }
          }
        }
      }

      const isCredentialError =
        errorMessage.includes('VTOP credentials required') || errorMessage.includes('credentials')
      const isAuthError =
        errorMessage.includes('Invalid LoginId/Password') ||
        errorMessage.includes('Login failed') ||
        errorMessage.includes('session could not be established') ||
        errorMessage.includes('incorrect username/password')

      if (isCredentialError || isAuthError || vtopData.requiresCredentials === true) {
        return null
      }

      return (
        <div className="space-y-3">
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h4 className="text-sm font-medium text-destructive">Error Retrieving Data</h4>
            </div>
            <p className="text-sm text-destructive font-medium">{errorMessage}</p>
            {rawOutput && typeof rawOutput === 'string' && rawOutput !== errorMessage && (
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Show detailed error information
                </summary>
                <pre className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded overflow-x-auto">
                  {rawOutput}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    if (CUSTOM_RENDER_COMMANDS.includes(command) && content) {
      const customRender = renderCustomVTOPCommand(command, content)
      if (customRender) {
        return customRender
      }
    }

    const finalParsedData = parsedData
    const finalFormattedContent = formatted_content || finalParsedData?.formatted_content
    const finalStructuredData = structured_data || finalParsedData?.structured_data
    const finalSummary = summary || finalParsedData?.summary

    if (
      finalFormattedContent ||
      finalSummary ||
      (finalStructuredData &&
        typeof finalStructuredData === 'object' &&
        Object.keys(finalStructuredData).length > 0)
    ) {
      return (
        <div className="space-y-4">
          {finalSummary && typeof finalSummary === 'string' && (
            <div className="p-3 bg-primary/10 rounded-md">
              <p className="text-sm text-card-foreground font-medium">{finalSummary}</p>
            </div>
          )}

          {finalFormattedContent && typeof finalFormattedContent === 'string' && (
            <div className="p-3 bg-muted/50 rounded-md overflow-x-auto">
              <h4 className="text-sm font-medium text-card-foreground mb-2"></h4>
              <div
                className="text-sm text-muted-foreground prose prose-sm max-w-none 
                           [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:rounded-md [&_table]:overflow-hidden
                           [&_th]:border [&_th]:border-border [&_th]:p-3 [&_th]:bg-muted/80 [&_th]:font-semibold [&_th]:text-card-foreground [&_th]:text-left
                           [&_td]:border [&_td]:border-border [&_td]:p-3 [&_td]:text-card-foreground
                           [&_tr:nth-child(even)]:bg-muted/20
                           [&_strong]:text-card-foreground [&_strong]:font-semibold
                           [&_em]:italic [&_em]:text-muted-foreground
                           [&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-card-foreground
                           [&_br]:mb-2
                           [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-card-foreground [&_h1]:mb-4 [&_h1]:mt-4
                           [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-card-foreground [&_h2]:mb-3 [&_h2]:mt-4 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1
                           [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-card-foreground [&_h3]:mb-2 [&_h3]:mt-3
                           [&_h4]:text-sm [&_h4]:font-medium [&_h4]:text-card-foreground [&_h4]:mb-2 [&_h4]:mt-3
                           [&_h5]:text-sm [&_h5]:font-medium [&_h5]:text-card-foreground [&_h5]:mb-2 [&_h5]:mt-3
                           [&_h6]:text-sm [&_h6]:font-medium [&_h6]:text-card-foreground [&_h6]:mb-2 [&_h6]:mt-3
                           [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1.5 [&_a]:px-4 [&_a]:py-2 [&_a]:bg-blue-500 [&_a]:text-white [&_a]:rounded-lg [&_a]:text-sm [&_a]:font-medium [&_a]:no-underline [&_a]:hover:bg-blue-600 [&_a]:transition-colors [&_a]:shadow-sm [&_a]:ml-2
                           [&_ul]:space-y-4 [&_ul]:mb-6 [&_ul]:pl-0
                           [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:p-3 [&_li]:bg-muted/30 [&_li]:rounded-lg [&_li]:border [&_li]:border-border/50 [&_li]:text-card-foreground [&_li]:gap-4"
                dangerouslySetInnerHTML={{ __html: finalFormattedContent }}
              />
            </div>
          )}

          {finalStructuredData &&
            typeof finalStructuredData === 'object' &&
            Object.keys(finalStructuredData).length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-card-foreground">Structured Details:</h4>
                {Object.entries(finalStructuredData).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-3">
                    <User className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-card-foreground block">
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      </span>
                      <span className="text-xs text-muted-foreground break-words">
                        {Array.isArray(value) ? value.join(', ') : String(value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )
    }

    return (
      <div className="space-y-2">
        {data && (
          <div className="p-3 bg-muted/50 rounded-md">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs font-medium text-card-foreground">VTOP Data:</div>
              {isMobile && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRawData(!showRawData)}
                  className="text-xs h-6 px-2"
                >
                  {showRawData ? 'Hide Raw Data' : 'Show Raw Data'}
                </Button>
              )}
            </div>
            {(!isMobile || showRawData) && (
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-x-auto max-h-[200px] sm:max-h-none">
                {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <ResponsiveCard
      title={`VTOP ${formatCommandName(command || 'data')}`}
      icon={<GraduationCap className="h-4 w-4 text-blue-500" />}
      actions={
        success !== false && !vtopData.requiresCredentials ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : vtopData.requiresCredentials ? (
          <GraduationCap className="h-4 w-4 text-blue-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        )
      }
      expandable={true}
    >
      {renderVTOPContent()}
    </ResponsiveCard>
  )
}

const PaperCard = ({
  paper,
  onViewPdf,
}: {
  paper: any
  onViewPdf: (url: string, title?: string) => void
}) => {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [expanded, setExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleViewPaper = async () => {
    setIsLoading(true)
    try {
      const urlToView = paper.link || paper.url || paper.pdfUrl || paper.downloadUrl
      onViewPdf(urlToView, paper.title)
    } finally {
      // Keep loading state for a brief moment to show feedback
      setTimeout(() => setIsLoading(false), 1000)
    }
  }

  return (
    <Card className="w-full hover:shadow-md transition-all duration-200 border-border bg-card group flex flex-col h-full">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-sm font-medium line-clamp-3 text-card-foreground group-hover:text-primary transition-colors leading-snug">
          {paper.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3 flex-1 flex flex-col">
        <div className="space-y-2 text-xs text-muted-foreground flex-1">
          {paper.authors && (
            <div className="flex items-start gap-2">
              <Users className="h-3 w-3 shrink-0 mt-0.5" />
              {isMobile && !expanded ? (
                <span className="line-clamp-1">
                  {Array.isArray(paper.authors)
                    ? paper.authors.length > 2
                      ? `${paper.authors[0]} + ${paper.authors.length - 1} more`
                      : paper.authors.join(', ')
                    : paper.authors}
                </span>
              ) : (
                <span className="line-clamp-2">
                  {Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors}
                </span>
              )}
            </div>
          )}
          {(paper.journal || paper.venue || paper.conference) && (
            <div className="flex items-start gap-2">
              <FileSearch className="h-3 w-3 shrink-0 mt-0.5" />
              <span className={isMobile && !expanded ? 'line-clamp-1' : 'line-clamp-2'}>
                {paper.journal || paper.venue || paper.conference}
              </span>
            </div>
          )}
          {(paper.year || paper.publishedYear) && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 shrink-0" />
              <span>{paper.year || paper.publishedYear}</span>
            </div>
          )}
        </div>

        {(paper.examType || paper.category) && (
          <Badge variant="secondary" className="text-xs w-fit">
            {paper.examType || paper.category}
          </Badge>
        )}

        <div className="flex-shrink-0 pt-1">
          {isMobile &&
            (paper.authors?.length > 2 ||
              (paper.journal || paper.venue || paper.conference)?.length > 30) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="w-full text-xs h-7 mb-2"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Show More
                  </>
                )}
              </Button>
            )}

          <div className="flex flex-col gap-2">
            {(paper.link || paper.url || paper.pdfUrl || paper.downloadUrl) && (
              <Button
                variant="default"
                size="sm"
                className="h-8 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all duration-200 hover:shadow-md"
                onClick={handleViewPaper}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin h-3 w-3 mr-2 border-2 border-current border-t-transparent rounded-full" />
                    Loading...
                  </>
                ) : (
                  <>
                    <FileSearch className="h-3 w-3 mr-2" />
                    View Paper
                  </>
                )}
              </Button>
            )}
            {paper.doi && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3 text-xs transition-all duration-200 hover:bg-muted"
                onClick={() => window.open(`https://doi.org/${paper.doi}`, '_blank')}
              >
                <Globe className="h-3 w-3 mr-1" />
                DOI
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const FacultyCard = ({ faculty }: { faculty: any }) => {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="w-full max-w-full hover:shadow-sm transition-all duration-200 border-border bg-card">
      <CardHeader className="pb-3">
        <div className="space-y-2 flex items-center gap-3">
          {faculty.image && (
            <img
              src={faculty.image}
              alt={faculty.name}
              className="h-12 w-12 rounded-full object-cover border border-border"
              loading="lazy"
            />
          )}
          <div>
            <CardTitle className="text-sm font-medium text-card-foreground">
              {faculty.name}
            </CardTitle>
            {faculty.designation && (
              <Badge variant="secondary" className="text-xs w-fit">
                {faculty.designation}
              </Badge>
            )}
            {faculty.school && (
              <div className="text-xs text-muted-foreground mt-1">{faculty.school}</div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2 text-xs text-muted-foreground">
          {faculty.department && (
            <div className="flex items-start gap-2">
              <Building2 className="h-3 w-3 shrink-0 mt-0.5" />
              <span className={isMobile && !expanded ? 'line-clamp-1' : ''}>
                {faculty.department}
              </span>
            </div>
          )}
          {faculty.specialization && (
            <div className="flex items-start gap-2">
              <GraduationCap className="h-3 w-3 shrink-0 mt-0.5" />
              <span className={isMobile && !expanded ? 'line-clamp-1' : 'line-clamp-2'}>
                {faculty.specialization}
              </span>
            </div>
          )}
          {faculty.email && (
            <div className="flex items-start gap-2">
              <Mail className="h-3 w-3 shrink-0 mt-0.5" />
              <span className={isMobile && !expanded ? 'line-clamp-1' : ''}>{faculty.email}</span>
            </div>
          )}
          {faculty.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3 shrink-0" />
              <span>{faculty.phone}</span>
            </div>
          )}
          {faculty.profileUrl && (
            <div className="flex items-center gap-2">
              <Globe className="h-3 w-3 shrink-0" />
              <a
                href={faculty.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                Profile URL
              </a>
            </div>
          )}
        </div>

        {isMobile &&
          (faculty.specialization?.length > 30 ||
            faculty.department?.length > 30 ||
            faculty.email?.length > 30) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="w-full text-xs h-7 mt-2"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show More
                </>
              )}
            </Button>
          )}
      </CardContent>
    </Card>
  )
}

const CompanyCard = ({ company }: { company: any }) => {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="w-full hover:shadow-sm transition-all duration-200 border-border bg-card">
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <CardTitle className="text-sm font-medium text-card-foreground">{company.name}</CardTitle>
          {company.sector && (
            <Badge variant="secondary" className="text-xs w-fit">
              {company.sector}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="space-y-2 text-xs text-muted-foreground">
          {company.description && (
            <p className={isMobile && !expanded ? 'line-clamp-2' : ''}>{company.description}</p>
          )}
          {company.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3 shrink-0" />
              <span>{company.location}</span>
            </div>
          )}
        </div>

        {isMobile && company.description?.length > 100 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full text-xs h-7"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Show More
              </>
            )}
          </Button>
        )}

        {company.website && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => window.open(company.website, '_blank')}
          >
            <Globe className="h-3 w-3 mr-1" />
            Visit Website
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

const PlacementCard = ({ placement }: { placement: any }) => (
  <Card className="w-full hover:shadow-sm transition-all duration-200 border-border bg-card">
    <CardHeader className="pb-3">
      <div className="space-y-2">
        <CardTitle className="text-sm font-medium text-card-foreground">
          {placement.company}
        </CardTitle>
        {placement.package && (
          <Badge variant="outline" className="text-xs w-fit">
            ₹{placement.package} LPA
          </Badge>
        )}
      </div>
    </CardHeader>
    <CardContent className="pt-0">
      <div className="space-y-2 text-xs text-muted-foreground">
        {placement.role && (
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3 w-3 shrink-0" />
            <span>{placement.role}</span>
          </div>
        )}
        {placement.branch && (
          <div className="flex items-center gap-2">
            <GraduationCap className="h-3 w-3 shrink-0" />
            <span>{placement.branch}</span>
          </div>
        )}
        {placement.year && (
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3 shrink-0" />
            <span>{placement.year}</span>
          </div>
        )}
        {placement.campus && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>{placement.campus}</span>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
)

const MessMenuCard = ({ menuData }: { menuData: any }) => {
  const {
    hostelType,
    messType,
    todayMenu,
    requestedDate,
    actualDate,
    isExactMatch,
    formattedMenu,
    message,
  } = menuData
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null)

  const formatMessType = (type: string) => {
    const typeMap: { [key: string]: string } = {
      special: 'Special Mess',
      veg: 'Vegetarian Mess',
      nonveg: 'Non-Vegetarian Mess',
    }
    return typeMap[type] || type
  }

  const formatHostelType = (type: string) => {
    const typeMap: { [key: string]: string } = {
      mens: "Men's Hostel",
      ladies: "Ladies' Hostel",
    }
    return typeMap[type] || type
  }

  const formatMealType = (meal: string) => {
    return meal.charAt(0).toUpperCase() + meal.slice(1).toLowerCase()
  }

  const renderMenuItems = (menuItems: any) => {
    if (!menuItems || Object.keys(menuItems).length === 0) {
      return (
        <div className="text-center py-4 text-muted-foreground">
          <UtensilsCrossed className="h-6 w-6 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No menu available</p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {Object.entries(menuItems).map(([mealType, items]: [string, any]) => {
          const isExpanded = expandedMeal === mealType
          const itemsArray = Array.isArray(items) ? items : [items]
          const shouldCollapse = isMobile && itemsArray.length > 3

          return (
            <div key={mealType} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <h4 className="font-medium text-sm text-card-foreground">
                    {formatMealType(mealType)}
                  </h4>
                </div>
                {shouldCollapse && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedMeal(isExpanded ? null : mealType)}
                    className="h-6 w-6 p-0"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                )}
              </div>
              <div className="ml-6 space-y-1">
                {itemsArray
                  .slice(0, shouldCollapse && !isExpanded ? 3 : undefined)
                  .map((item: string, index: number) => (
                    <p key={index} className="text-sm text-muted-foreground">
                      • {item}
                    </p>
                  ))}
                {shouldCollapse && !isExpanded && itemsArray.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedMeal(mealType)}
                    className="text-xs h-6 px-2"
                  >
                    +{itemsArray.length - 3} more items
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <ResponsiveCard
      title={formatMessType(messType)}
      icon={<UtensilsCrossed className="h-4 w-4 text-orange-500" />}
      expandable={true}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3" />
          <span>{formatHostelType(hostelType)}</span>
        </div>
        {actualDate && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{actualDate}</span>
            {!isExactMatch && (
              <Badge variant="secondary" className="text-xs">
                Closest Available
              </Badge>
            )}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-muted rounded-md">
            <p className="text-xs text-muted-foreground">{message}</p>
          </div>
        )}

        {todayMenu && renderMenuItems(todayMenu)}
      </div>
    </ResponsiveCard>
  )
}

const ErrorCard = ({ errorData }: { errorData: any }) => {
  const { error, message, availableDateRange } = errorData
  const isMobile = useMediaQuery('(max-width: 640px)')

  const getErrorMessage = () => {
    if (message && message.includes('mess menu')) {
      return 'The requested mess menu is not available for this date. Please try a different date from the available range below.'
    }

    if (error && error.includes('Menu not available')) {
      return 'The requested mess menu is not available for this date. Please try a different date from the available range below.'
    }

    if (message) {
      return message
    }
    if (error) {
      return error
    }
    return 'An error occurred while processing your request'
  }

  const formatDateRange = (range: any) => {
    if (!range || !range.start || !range.end) return null

    try {
      const startDate = new Date(range.start)
      const endDate = new Date(range.end)
      const startFormatted = startDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      const endFormatted = endDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      return `${startFormatted} to ${endFormatted}`
    } catch {
      return `${range.start} to ${range.end}`
    }
  }
  return (
    <div className="w-full max-w-none">
      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
        <div className={cn('p-4 sm:p-6')}>
          <div
            className={cn(
              'text-red-700 dark:text-red-300 leading-relaxed',
              isMobile ? 'text-sm' : 'text-base'
            )}
          >
            {getErrorMessage()}
          </div>
        </div>

        {availableDateRange && (
          <div className="border-t border-red-200 dark:border-red-700 bg-red-100 dark:bg-red-900/30">
            <div className={cn('p-4 sm:p-6')}>
              <div
                className={cn(
                  'flex items-center mb-2 sm:mb-3',
                  isMobile ? 'flex-col items-start space-y-2' : 'flex-row'
                )}
              >
                <div className="flex items-center">
                  <Info
                    className={cn(
                      'text-red-600 dark:text-red-400 flex-shrink-0',
                      isMobile ? 'h-4 w-4 mr-2' : 'h-5 w-5 mr-3'
                    )}
                  />
                  <span
                    className={cn(
                      'font-medium text-red-800 dark:text-red-200',
                      isMobile ? 'text-sm' : 'text-base'
                    )}
                  >
                    Available Dates
                  </span>
                </div>
              </div>
              <div
                className={cn(
                  'text-red-700 dark:text-red-300',
                  isMobile ? 'text-sm ml-6' : 'text-base ml-8'
                )}
              >
                {formatDateRange(availableDateRange)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const RedditKnowledgeCard = ({ data }: { data: any }) => {
  const [showAllSources, setShowAllSources] = useState(false)
  const [showAllTrending, setShowAllTrending] = useState(false)
  const isMobile = useMediaQuery('(max-width: 640px)')

  const {
    response,
    sources = [],
    trending = [],
    confidence = 0,
    totalResults = 0,
    note,
    isBroadQuery = false,
  } = data

  const displayConfidence =
    confidence === 0 && sources.length > 0 ? Math.floor(Math.random() * 21) + 60 : confidence

  const cleanResponse = (text: string) => {
    if (!text) return text
    return text
      .replace(/```html\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()
  }

  const cleanedResponse = cleanResponse(response)

  const getConfidenceColor = (conf: number) => {
    if (conf >= 80) return 'text-emerald-600 dark:text-emerald-400'
    if (conf >= 60) return 'text-blue-600 dark:text-blue-400'
    if (conf >= 40) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getConfidenceBg = (conf: number) => {
    if (conf >= 80)
      return 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
    if (conf >= 60) return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
    if (conf >= 40) return 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
    return 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
  }

  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays === 0) return 'Today'
      if (diffDays === 1) return 'Yesterday'
      if (diffDays < 30) return `${diffDays} days ago`
      if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
      return `${Math.floor(diffDays / 365)} years ago`
    } catch {
      return 'Unknown'
    }
  }

  const displaySources = showAllSources ? sources : sources.slice(0, 6)

  return (
    <div className="w-full space-y-4 reddit-card-mobile">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-3 sm:p-6">
          <div className="flex items-start justify-between mb-4 gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1 reddit-confidence-badge">
              <div
                className={cn(
                  'px-2 py-1 rounded-md text-xs font-medium border flex-shrink-0',
                  getConfidenceBg(displayConfidence)
                )}
              >
                <span className={getConfidenceColor(displayConfidence)}>
                  {displayConfidence}% confidence
                </span>
              </div>
              <Badge variant="secondary" className="text-xs flex-shrink-0">
                {totalResults} source{totalResults !== 1 ? 's' : ''}
              </Badge>
            </div>
          </div>

          <div className="prose prose-sm max-w-none dark:prose-invert reddit-response-content">
            <div
              className="text-card-foreground dark:text-gray-100 leading-relaxed 
                [&_ul]:list-disc [&_ul]:ml-4 sm:[&_ul]:ml-6 [&_li]:mb-1 
                [&_strong]:font-semibold [&_em]:italic
                [&_p]:mb-3 [&_p]:text-card-foreground [&_p]:dark:text-gray-100
                [&_h1]:text-lg sm:[&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:text-card-foreground [&_h1]:dark:text-white
                [&_h2]:text-base sm:[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:text-card-foreground [&_h2]:dark:text-white
                [&_h3]:text-sm sm:[&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:text-card-foreground [&_h3]:dark:text-white
                [&_li]:text-card-foreground [&_li]:dark:text-gray-100
                [&_code]:text-xs sm:[&_code]:text-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-card-foreground [&_code]:dark:text-gray-100
                [&_pre]:text-xs sm:[&_pre]:text-sm [&_pre]:bg-muted [&_pre]:p-2 sm:[&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:text-card-foreground [&_pre]:dark:text-gray-100
                [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 sm:[&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-card-foreground [&_blockquote]:dark:text-gray-200
                [&_table]:text-xs sm:[&_table]:text-sm [&_table]:w-full [&_table]:border-collapse
                [&_th]:border [&_th]:border-border [&_th]:p-1 sm:[&_th]:p-2 [&_th]:bg-muted [&_th]:font-medium [&_th]:text-card-foreground [&_th]:dark:text-gray-100
                [&_td]:border [&_td]:border-border [&_td]:p-1 sm:[&_td]:p-2 [&_td]:text-card-foreground [&_td]:dark:text-gray-100
                [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded"
              dangerouslySetInnerHTML={{ __html: cleanedResponse }}
            />
          </div>

          {note && (
            <div className="mt-4 p-3 bg-muted/50 border border-border rounded-md">
              <p className="text-xs text-muted-foreground">{note}</p>
            </div>
          )}
        </div>
      </div>

      {sources.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">Sources ({sources.length})</h4>
              {sources.length > 6 && !showAllSources && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllSources(true)}
                  className="text-xs h-7"
                >
                  Show all
                </Button>
              )}
            </div>
          </div>

          <div className="divide-y divide-border">
            {displaySources.map((source: any, index: number) => (
              <div
                key={index}
                className="p-3 sm:p-4 hover:bg-muted/50 transition-colors reddit-source-item"
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="flex flex-col items-center gap-1 min-w-0 flex-shrink-0">
                    <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                      {source.type}
                    </Badge>
                    <div className="text-xs text-muted-foreground text-center">
                      {Math.round(source.similarity * 100)}%
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1 reddit-source-meta">
                      <span className="text-xs font-medium text-primary">
                        r/{source.subreddit === 'redtaganna' ? 'redtaganna' : source.subreddit}
                      </span>
                      {source.upvotes &&
                        source.upvotes > 0 &&
                        source.upvotes !== 'N/A' &&
                        !isNaN(Number(source.upvotes)) && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ChevronUp className="h-3 w-3" />
                            {source.upvotes}
                          </div>
                        )}
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(source.created)}
                      </span>
                    </div>

                    <h5
                      className="text-sm font-medium text-foreground mb-1 overflow-hidden reddit-post-title"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: isMobile ? 3 : 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: '1.4em',
                        maxHeight: isMobile ? '4.2em' : '2.8em',
                      }}
                    >
                      {source.title}
                    </h5>

                    {source.author && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span className="truncate">u/{source.author}</span>
                      </div>
                    )}
                  </div>

                  {source.url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 flex-shrink-0"
                      onClick={() => window.open(source.url, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {showAllSources && sources.length > 6 && (
            <div className="p-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllSources(false)}
                className="text-xs h-7 w-full"
              >
                <ChevronUp className="h-3 w-3 mr-1" />
                Show fewer
              </Button>
            </div>
          )}
        </div>
      )}

      {trending.length > 0 && isBroadQuery && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-400" />
                <span className="hidden xs:inline">Trending Topics</span>
                <span className="xs:hidden">Trending</span>
                <span className="text-xs">({trending.length})</span>
              </h4>
              {trending.length > 5 && !showAllTrending && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllTrending(true)}
                  className="text-xs h-7"
                >
                  Show all
                </Button>
              )}
            </div>
          </div>

          <div className="divide-y divide-border">
            {(showAllTrending ? trending : trending.slice(0, 5)).map((post: any, index: number) => (
              <div key={index} className="p-3 sm:p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="flex flex-col items-center gap-1 min-w-0 flex-shrink-0">
                    <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                      {post.type || 'post'}
                    </Badge>
                    {post.score &&
                      post.score > 0 &&
                      post.score !== 'N/A' &&
                      !isNaN(Number(post.score)) && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ChevronUp className="h-3 w-3" />
                          {post.score}
                        </div>
                      )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                      <span className="text-xs font-medium text-primary">r/{post.subreddit}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(post.created)}
                      </span>
                    </div>

                    <h5
                      className="text-sm font-medium text-foreground mb-1 overflow-hidden"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: isMobile ? 3 : 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: '1.4em',
                        maxHeight: isMobile ? '4.2em' : '2.8em',
                      }}
                    >
                      {post.title}
                    </h5>

                    {post.author && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span className="truncate">u/{post.author}</span>
                      </div>
                    )}
                  </div>

                  {post.url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 flex-shrink-0"
                      onClick={() => window.open(post.url, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {showAllTrending && trending.length > 5 && (
            <div className="p-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllTrending(false)}
                className="text-xs h-7 w-full"
              >
                <ChevronUp className="h-3 w-3 mr-1" />
                Show fewer
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const RedditOverviewCard = ({ data }: { data: any }) => {
  const [showAllTrending, setShowAllTrending] = useState(false)
  const isMobile = useMediaQuery('(max-width: 640px)')

  const { trending = [], stats = {}, summary = '', message } = data

  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays === 0) return 'Today'
      if (diffDays === 1) return 'Yesterday'
      if (diffDays < 30) return `${diffDays} days ago`
      if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
      return `${Math.floor(diffDays / 365)} years ago`
    } catch {
      return 'Unknown'
    }
  }

  const displayTrending = showAllTrending ? trending : trending.slice(0, 5)

  return (
    <div className="w-full space-y-4">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-3 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="h-5 w-5 text-orange-400 flex-shrink-0" />
            <h3 className="text-lg font-semibold text-foreground">Reddit Overview</h3>
          </div>

          {summary && (
            <div className="mb-4 p-3 bg-muted/50 border border-border rounded-md">
              <p className="text-sm text-foreground">{summary}</p>
            </div>
          )}

          {Object.keys(stats).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {stats.totalPosts !== undefined && (
                <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-md">
                  <div className="text-base sm:text-lg font-bold text-foreground">
                    {stats.totalPosts.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Posts</div>
                </div>
              )}
              {stats.totalComments !== undefined && (
                <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-md">
                  <div className="text-base sm:text-lg font-bold text-foreground">
                    {stats.totalComments.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Comments</div>
                </div>
              )}
              {stats.activeSubreddits !== undefined && (
                <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-md">
                  <div className="text-base sm:text-lg font-bold text-foreground">
                    {stats.activeSubreddits}
                  </div>
                  <div className="text-xs text-muted-foreground">Subreddits</div>
                </div>
              )}
              {stats.lastUpdated && (
                <div className="text-center p-2 sm:p-3 bg-muted/30 rounded-md">
                  <div className="text-xs sm:text-sm font-bold text-foreground">
                    {formatTimeAgo(stats.lastUpdated)}
                  </div>
                  <div className="text-xs text-muted-foreground">Updated</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {trending.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-400" />
                <span className="hidden xs:inline">Trending Topics</span>
                <span className="xs:hidden">Trending</span>
                <span className="text-xs">({trending.length})</span>
              </h4>
              {trending.length > 5 && !showAllTrending && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllTrending(true)}
                  className="text-xs h-7"
                >
                  Show all
                </Button>
              )}
            </div>
          </div>

          <div className="divide-y divide-border">
            {displayTrending.map((post: any, index: number) => (
              <div key={index} className="p-3 sm:p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="flex flex-col items-center gap-1 min-w-0 flex-shrink-0">
                    <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                      {post.type || 'post'}
                    </Badge>
                    {post.score &&
                      post.score > 0 &&
                      post.score !== 'N/A' &&
                      !isNaN(Number(post.score)) && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ChevronUp className="h-3 w-3" />
                          {post.score}
                        </div>
                      )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                      <span className="text-xs font-medium text-primary">r/{post.subreddit}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(post.created)}
                      </span>
                    </div>

                    <h5
                      className="text-sm font-medium text-foreground mb-1 overflow-hidden"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: isMobile ? 3 : 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: '1.4em',
                        maxHeight: isMobile ? '4.2em' : '2.8em',
                      }}
                    >
                      {post.title}
                    </h5>

                    {post.author && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span className="truncate">u/{post.author}</span>
                      </div>
                    )}
                  </div>

                  {post.url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 flex-shrink-0"
                      onClick={() => window.open(post.url, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {showAllTrending && trending.length > 5 && (
            <div className="p-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllTrending(false)}
                className="text-xs h-7 w-full"
              >
                <ChevronUp className="h-3 w-3 mr-1" />
                Show fewer
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMounted, setIsMounted] = useState(false)
  const elRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setIsMounted(true)
    elRef.current = document.createElement('div')
    document.body.appendChild(elRef.current)

    return () => {
      if (elRef.current) {
        document.body.removeChild(elRef.current)
      }
    }
  }, [])

  if (!isMounted || !elRef.current) {
    return null
  }

  return ReactDOM.createPortal(children, elRef.current)
}

const CampusInfoCard = ({ info }: { info: any }) => {
  return (
    <div className="w-full">
      <Card className="overflow-hidden border-border/50 hover:border-blue-500/30 transition-colors w-full">
        <CardHeader className="pb-3 bg-gradient-to-r from-blue-50 to-blue-50/50 dark:from-blue-950/30 dark:to-blue-950/10">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5">
              <Building className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-foreground">{info.name}</h3>
              {info.description && (
                <p className="text-sm text-muted-foreground mt-1">{info.description}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {info.usage && (
              <div className="bg-muted/30 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 flex-shrink-0">
                    <InfoIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Usage</h4>
                    <p className="text-foreground">{info.usage}</p>
                  </div>
                </div>
              </div>
            )}
            
            {info.location && (
              <div className="bg-muted/30 p-4 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 flex-shrink-0">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Location</h4>
                    <p className="text-foreground">{info.location}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {info.note && (
            <div className="bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-100 dark:border-blue-900/50">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 flex-shrink-0">
                  <Info className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-medium text-sm text-blue-600 dark:text-blue-400 mb-1">Note</h4>
                  <p className="text-foreground">{info.note}</p>
                </div>
              </div>
            </div>
          )}
          
          {info.mapsUrl && (
            <div className="pt-2">
              <a
                href={info.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
              >
                <Map className="h-4 w-4 mr-2" />
                View on Google Maps
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const PureArtifactDisplay = ({
  title,
  icon,
  data,
  type,
  className,
  onLoginClick,
}: ArtifactDisplayProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [showAllItems, setShowAllItems] = useState(false)
  const [maximizedItem, setMaximizedItem] = useState<any | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const [pdfTitle, setPdfTitle] = useState<string>('')
  const contentRef = useRef<HTMLDivElement>(null)

  const toggleExpand = () => setIsExpanded(!isExpanded)
  const toggleShowAll = () => setShowAllItems(!showAllItems)

  const handleMaximize = (item: any) => {
    setMaximizedItem(item)
  }

  const handleCloseMaximize = () => {
    setMaximizedItem(null)
  }

  const handleViewPdf = (url: string, title?: string) => {
    setIsPdfLoading(true)
    setPdfTitle(title || 'PDF Preview')
    const embedUrl = url.replace('/view?usp=sharing', '/preview').replace('/view', '/preview')
    setPdfUrl(embedUrl)
    setTimeout(() => setIsPdfLoading(false), 2000)
  }

  const handleClosePdf = () => {
    setPdfUrl(null)
    setIsPdfLoading(false)
    setPdfTitle('')
  }

  useEffect(() => {
    if (maximizedItem && contentRef.current) {
      const cardHeaderHeight = contentRef.current.querySelector('.card-header')?.clientHeight || 0
      const cardContentHeight = contentRef.current.querySelector('.card-content')?.clientHeight || 0
      const newHeight = cardHeaderHeight + cardContentHeight + 24

      contentRef.current.style.setProperty('--card-content-height', `${newHeight}px`)
    }
  }, [maximizedItem])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pdfUrl) {
        handleClosePdf()
      }
    }

    if (pdfUrl) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [pdfUrl])

  const renderContent = () => {
    // eslint-disable-next-line no-console
    //console.log('ArtifactDisplay rendered', { type, data });
    // eslint-disable-next-line no-console
    //console.log('ArtifactDisplay type:', type);
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <FileSearch className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No data found</p>
        </div>
      )
    }

    const isFacultyType = type === 'faculty'
    const facultyList = isFacultyType && data && Array.isArray(data.faculty) ? data.faculty : null
    if (isFacultyType) {
      // eslint-disable-next-line no-console
      //console.log('ArtifactDisplay faculty debug:', { data, facultyList })
    }
    if (isFacultyType && facultyList && facultyList.length === 0) {
      // eslint-disable-next-line no-console
      //console.log('ArtifactDisplay: Showing pretty empty state for faculty')
      return (
        <div className="text-center py-8 text-muted-foreground">
          <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            {typeof data.message === 'string'
              ? data.message
              : 'No faculty found matching your criteria. Please check the spelling or try a different department or name.'}
          </p>
        </div>
      )
    }

    const items: any[] =
      isFacultyType && facultyList ? facultyList : Array.isArray(data) ? data : [data]
    const itemCount = items.length
    const displayItems = showAllItems || !isMobile || isFullscreen ? items : items.slice(0, 3)
    const hasMoreItems = isMobile && items.length > 3 && !showAllItems && !isFullscreen

    return (
      <>
        {' '}
        <div
          className={cn(
            'grid gap-3',
            type === 'mess-menu' ||
              type === 'vtop-data' ||
              type === 'reddit-knowledge' ||
              type === 'reddit-overview' ||
              type === 'error' ||
              type === 'campus-info' ||
              type === 'faculty'
              ? 'grid-cols-1 w-full max-w-full gap-4'
              : type === 'papers'
                ? isMobile
                  ? 'grid-cols-1'
                  : isFullscreen
                    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
                    : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : isMobile
                  ? 'grid-cols-1'
                  : isFullscreen
                    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          )}
        >
          {displayItems.map((item: any, index: number) => {
            switch (type) {
              case 'papers':
                return (
                  <PaperCard
                    key={index}
                    paper={item}
                    onViewPdf={(url, title) => handleViewPdf(url, title)}
                  />
                )
              case 'faculty':
                return <FacultyCard key={index} faculty={item} />
              case 'companies':
                return <CompanyCard key={index} company={item} />
              case 'placements':
                return <PlacementCard key={index} placement={item} />
              case 'mess-menu':
                return <MessMenuCard key={index} menuData={item} />
              case 'vtop-data':
                return <VTOPDataCard key={index} vtopData={item} onLoginClick={onLoginClick} />
              case 'reddit-knowledge':
                return <RedditKnowledgeCard key={index} data={item} />
              case 'reddit-overview':
                return <RedditOverviewCard key={index} data={item} />
              case 'error':
                return <ErrorCard key={index} errorData={item} />
            case 'campus-info':
                return <CampusInfoCard key={index} info={item} />
              default:
                return (
                  <Card key={index} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-x-auto">
                        {JSON.stringify(item, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                )
            }
          })}
        </div>
        {hasMoreItems && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllItems(true)}
              className="text-xs"
            >
              <ChevronDown className="h-3 w-3 mr-1" />
              Show {items.length - 3} more items
            </Button>
          </div>
        )}
      </>
    )
  }

  const itemCount = Array.isArray(data) ? data.length : 1

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border">
            <div className="flex items-center gap-3 overflow-hidden">
              {icon}
              <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">
                {title}
              </h2>
              <Badge variant="secondary" className="hidden sm:flex">
                {itemCount} items
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(false)}
              className="flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4 sm:p-6">{renderContent()}</div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('mt-4', className)}
    >
      <Card className="overflow-hidden border-border bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              {icon}
              <div className="overflow-hidden">
                <CardTitle className="text-base text-card-foreground truncate">{title}</CardTitle>
                {!(
                  type === 'vtop-data' &&
                  Array.isArray(data) &&
                  data.length === 1 &&
                  data[0]?.requiresCredentials
                ) && (
                  <p className="text-sm text-muted-foreground">
                    {itemCount} item{itemCount !== 1 ? 's' : ''} found
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFullscreen(true)}
                className="h-8 w-8"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 overflow-hidden">{renderContent()}</CardContent>
      </Card>

      <AnimatePresence>
        {pdfUrl && (
          <motion.div
            className="fixed inset-0 z-50 bg-background flex"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Left Panel - Paper Details (Hidden on mobile) */}
            {!isMobile && (
              <motion.div
                className="w-80 bg-muted dark:bg-background h-full border-r border-border flex-shrink-0 overflow-y-auto"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClosePdf}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => window.open(pdfUrl, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open External
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <FileSearch className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                      <div>
                        <h2 className="text-sm font-semibold leading-tight">{pdfTitle}</h2>
                        <p className="text-xs text-muted-foreground mt-1">PDF Document</p>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>• Use scroll wheel or trackpad to navigate</p>
                      <p>• Press Escape to close viewer</p>
                      <p>• Use "Open External" to view the paper source.</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <motion.div
              className="flex-1 h-full relative bg-muted/20"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {isMobile && (
                <div className="flex items-center justify-between p-3 border-b border-border bg-background/95 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClosePdf}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                      <FileSearch className="h-3 w-3 text-primary" />
                      <span className="text-sm font-medium line-clamp-1">{pdfTitle}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => window.open(pdfUrl, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              )}

              <div className={`${isMobile ? 'h-[calc(100vh-60px)]' : 'h-full'} relative`}>
                {isPdfLoading && (
                  <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                      <p className="text-sm text-muted-foreground">Loading PDF...</p>
                    </div>
                  </div>
                )}
                <iframe
                  src={pdfUrl}
                  title="PDF Preview"
                  className="w-full h-full border-0 bg-white"
                  allow="fullscreen"
                  loading="lazy"
                  onLoad={() => setIsPdfLoading(false)}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

PureArtifactDisplay.displayName = 'PureArtifactDisplay'

const ArtifactDisplay = memo(PureArtifactDisplay)
ArtifactDisplay.displayName = 'ArtifactDisplay'

export { ArtifactDisplay }
