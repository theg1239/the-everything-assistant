'use client'

import React, { useState, memo, useRef, useEffect } from 'react'
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
  Hash,
  BookOpen,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  FileText,
  Sparkles,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ResponsiveCard } from './responsive-card'
import { ResponsiveTable } from './responsive-table'

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
  const CUSTOM_RENDER_COMMANDS = ['attendance', 'marks', 'grades', 'profile']
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
      case 'grades':
        if (Array.isArray(content) && content.length > 0) {
          const headers = Object.keys(content[0])

          // Create columns for the responsive table
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
                           [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-border [&_table]:rounded-md [&_table]:overflow-hidden
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

const PaperCard = ({ paper }: { paper: any }) => {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="w-full hover:shadow-sm transition-all duration-200 border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium line-clamp-2 text-card-foreground">
          {paper.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="space-y-2 text-xs text-muted-foreground">
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
          <Badge variant="secondary" className="text-xs">
            {paper.examType || paper.category}
          </Badge>
        )}

        {isMobile &&
          (paper.authors?.length > 2 ||
            (paper.journal || paper.venue || paper.conference)?.length > 30) && (
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

        <div className="flex gap-2 pt-1">
          {(paper.link || paper.url || paper.pdfUrl || paper.downloadUrl) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() =>
                window.open(paper.link || paper.url || paper.pdfUrl || paper.downloadUrl, '_blank')
              }
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              View Paper
            </Button>
          )}
          {paper.doi && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => window.open(`https://doi.org/${paper.doi}`, '_blank')}
            >
              <Globe className="h-3 w-3 mr-1" />
              DOI
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const FacultyCard = ({ faculty }: { faculty: any }) => {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="w-full hover:shadow-sm transition-all duration-200 border-border bg-card">
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <CardTitle className="text-sm font-medium text-card-foreground">{faculty.name}</CardTitle>
          {faculty.designation && (
            <Badge variant="secondary" className="text-xs w-fit">
              {faculty.designation}
            </Badge>
          )}
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

  const renderContent = () => {
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <FileSearch className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No data found</p>
        </div>
      )
    }

    const items = Array.isArray(data) ? data : [data]
    const displayItems = showAllItems || !isMobile || isFullscreen ? items : items.slice(0, 3)
    const hasMoreItems = isMobile && items.length > 3 && !showAllItems && !isFullscreen

    return (
      <>
        <div
          className={cn(
            'grid gap-3',
            type === 'mess-menu' || type === 'vtop-data'
              ? 'grid-cols-1'
              : isMobile
                ? 'grid-cols-1'
                : isFullscreen
                  ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          )}
        >
          {displayItems.map((item, index) => {
            switch (type) {
              case 'papers':
                return <PaperCard key={index} paper={item} />
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
    </motion.div>
  )
}

export const ArtifactDisplay = memo(PureArtifactDisplay)
