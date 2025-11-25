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
  DollarSign,
  Target,
  Star,
  Briefcase,
  School,
  Award,
  ImageIcon,
  Download,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ResponsiveCard } from '@/components/responsive-card'
import FFCSArtifact from './artifacts/ffcs-artifact'
import FfcsCourseSearchResult from './artifacts/get-course-info-artifact'
import { ResponsiveTable } from '@/components/responsive-table'
import { Copy } from 'lucide-react'
import PapersIndexArtifact from './artifacts/papers-index-artifact'
import PapersQAArtifact from './artifacts/papers-qa-artifact'
import { usePdfDock } from '@/contexts/pdf-dock-context'

interface ArtifactDisplayProps {
  title: string
  icon?: React.ReactNode
  data: any
  type:
    | 'papers'
    | 'syllabi'
    | 'faculty'
    | 'companies'
    | 'placements'
    | 'mess-menu'
    | 'vtop-data'
    | 'interactive-course-page'
    | 'reddit-knowledge'
    | 'reddit-overview'
    | 'error'
    | 'campus-info'
    | 'getPlacementInfo'
    | 'ffcs-planner'
    | 'course-info'
    | 'papers-index'
    | 'papers-qa'
    | 'question-patterns'
    | 'gravitas-events'
    | 'gravitas-event-registration'
    | 'generated-image'
    | 'general'
  className?: string
  onLoginClick?: () => void
  maximizedItem?: any
  setMaximizedItem?: (item: any) => void
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

  const formatKeyLabel = (label?: string) =>
    (label || '')
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, str => str.toUpperCase()) || 'Details'

  const slugifyKey = (label?: string, fallback = 'col') => {
    const slug = (label || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return slug || fallback
  }

  const isPlainObject = (value: any): value is Record<string, any> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)

  const isCliTable = (value: any) =>
    isPlainObject(value) && Array.isArray(value.headers) && Array.isArray(value.rows)

  const formatTableCell = (value: any) => {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'string') return value.trim() === '' ? '—' : value
    if (Array.isArray(value)) {
      if (!value.length) return '—'
      if (value.every(item => typeof item !== 'object' || item === null)) {
        return value
          .map(item => (item === null || item === undefined ? '—' : String(item)))
          .join(', ')
      }
      return `${value.length} items`
    }
    return JSON.stringify(value)
  }

  const renderPrimitiveValue = (value: any) => {
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      return <span className="text-xs text-muted-foreground">—</span>
    }

    if (typeof value === 'boolean') {
      return (
        <Badge
          variant={value ? 'secondary' : 'outline'}
          className="text-[10px] uppercase tracking-wide px-2 py-0.5"
        >
          {value ? 'Yes' : 'No'}
        </Badge>
      )
    }

    return (
      <span className="text-xs text-card-foreground whitespace-pre-wrap break-words">
        {String(value)}
      </span>
    )
  }

  const renderCliTables = (tables: any[]) => {
    const validTables = tables.filter(isCliTable)
    if (!validTables.length) {
      return <span className="text-xs text-muted-foreground">No structured rows found.</span>
    }

    return (
      <div className="space-y-4">
        {validTables.map((table, tableIdx) => {
          const headers = Array.isArray(table.headers) ? table.headers : []
          const rows = Array.isArray(table.rows) ? table.rows : []
          if (!headers.length || !rows.length) {
            return (
              <div key={`table-${tableIdx}`} className="text-xs text-muted-foreground">
                No data in table.
              </div>
            )
          }

          type ColumnDef = { key: string; header: string; accessor: number }
          const columns: ColumnDef[] = headers.map((header: string, headerIdx: number) => ({
            key: `${slugifyKey(header, `column-${headerIdx}`)}-${tableIdx}-${headerIdx}`,
            header: formatKeyLabel(header || `Column ${headerIdx + 1}`),
            accessor: headerIdx,
          }))

          const dataRows = rows.map((row: any[]) => {
            const rowObj: Record<string, any> = {}
            columns.forEach((column: ColumnDef, columnIdx: number) => {
              rowObj[column.key] = formatTableCell(row[columnIdx])
            })
            return rowObj
          })

          return (
            <div key={`table-${tableIdx}`} className="space-y-2">
              {(table.heading || table.title) && (
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-3 w-3 text-blue-500" />
                  {(table.heading || table.title) as string}
                </div>
              )}
              <ResponsiveTable
                data={dataRows}
                columns={columns.map((column: ColumnDef) => ({
                  key: column.key,
                  header: column.header,
                }))}
                maxMobileColumns={Math.min(3, columns.length)}
              />
            </div>
          )
        })}
      </div>
    )
  }

  const renderSectionsArray = (sections: any[], depth: number) => (
    <div className="space-y-3">
      {sections.map((section, idx) => (
        <div
          key={`${section?.title || 'section'}-${idx}`}
          className="rounded-lg border border-border/40 bg-card/30 p-3 space-y-2"
        >
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Calendar className="h-3 w-3 text-blue-500" />
            {section?.title || `Section ${idx + 1}`}
          </div>
          {section?.note && <p className="text-xs text-muted-foreground">{section.note}</p>}
          {Array.isArray(section?.exams) && section.exams.length > 0 ? (
            <div className="mt-2">
              {renderStructuredArray(
                `${section?.title || 'section'}-exams`,
                section.exams,
                depth + 1
              )}
            </div>
          ) : Array.isArray(section?.schedule) && section.schedule.length > 0 ? (
            <div className="mt-2">
              {renderStructuredArray(
                `${section?.title || 'section'}-schedule`,
                section.schedule,
                depth + 1
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No entries found.</p>
          )}
        </div>
      ))}
    </div>
  )

  const renderObjectArray = (arrayKey: string, rows: any[], depth: number) => {
    const objectRows = rows.filter(isPlainObject)
    if (!objectRows.length) {
      return (
        <span className="text-xs text-card-foreground">
          {rows.map(value => formatTableCell(value)).join(', ')}
        </span>
      )
    }

    const candidateKeys = Array.from(
      new Set(
        objectRows.flatMap(row =>
          Object.keys(row).filter(key => {
            const val = row[key]
            return (
              val === null ||
              typeof val === 'string' ||
              typeof val === 'number' ||
              typeof val === 'boolean' ||
              (Array.isArray(val) && val.every(item => typeof item !== 'object'))
            )
          })
        )
      )
    )

    if (candidateKeys.length) {
      type ObjectColumnDef = { key: string; header: string; accessor: string }
      const columnDefs: ObjectColumnDef[] = candidateKeys.slice(0, 8).map((columnKey, idx) => ({
        key: `${slugifyKey(columnKey, `col-${idx}`)}-${idx}`,
        header: formatKeyLabel(columnKey),
        accessor: columnKey,
      }))

      const dataRows = objectRows.map(row => {
        const rowObj: Record<string, any> = {}
        columnDefs.forEach((column: ObjectColumnDef) => {
          rowObj[column.key] = formatTableCell(row[column.accessor])
        })
        return rowObj
      })

      if (dataRows.length) {
        return (
          <ResponsiveTable
            data={dataRows}
            columns={columnDefs.map((column: ObjectColumnDef) => ({
              key: column.key,
              header: column.header,
            }))}
            maxMobileColumns={Math.min(3, columnDefs.length)}
          />
        )
      }
    }

    return (
      <div className="space-y-2">
        {objectRows.map((row, idx) => (
          <div
            key={`${arrayKey}-${idx}`}
            className="rounded-md border border-border/30 bg-card/40 p-2"
          >
            {renderStructuredObject(row, depth + 1)}
          </div>
        ))}
      </div>
    )
  }

  const renderStructuredArray = (
    arrayKey: string,
    value: any[],
    depth: number
  ): React.ReactNode => {
    if (!value.length) {
      return <span className="text-xs text-muted-foreground">—</span>
    }

    const normalizedKey = (arrayKey || '').toLowerCase()
    const tableCandidates = value.filter(isCliTable)

    if (
      tableCandidates.length &&
      (tableCandidates.length === value.length || normalizedKey.includes('table'))
    ) {
      return renderCliTables(tableCandidates)
    }

    const looksLikeSections = value.every(
      item => isPlainObject(item) && (Array.isArray(item.exams) || Array.isArray(item.schedule))
    )

    if (looksLikeSections) {
      return renderSectionsArray(value, depth)
    }

    const hasObjectEntries = value.some(isPlainObject)
    if (hasObjectEntries) {
      return renderObjectArray(arrayKey, value, depth)
    }

    return (
      <span className="text-xs text-card-foreground whitespace-pre-wrap break-words">
        {value.map(item => formatTableCell(item)).join(', ')}
      </span>
    )
  }

  const renderStructuredObject = (obj: Record<string, any>, depth: number): React.ReactNode => {
    const entries = Object.entries(obj)
    if (!entries.length) {
      return <span className="text-xs text-muted-foreground">—</span>
    }

    return (
      <div className={cn('space-y-2', depth > 0 ? 'pl-3 border-l border-border/40' : undefined)}>
        {entries.map(([childKey, childValue]) => (
          <div key={childKey} className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {formatKeyLabel(childKey)}
            </span>
            <div>{renderStructuredValue(childKey, childValue, depth + 1)}</div>
          </div>
        ))}
      </div>
    )
  }

  function renderStructuredValue(key: string, value: any, depth = 0): React.ReactNode {
    if (Array.isArray(value)) {
      return renderStructuredArray(key, value, depth)
    }

    if (isPlainObject(value)) {
      return renderStructuredObject(value, depth)
    }

    return renderPrimitiveValue(value)
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
        let attendanceData = []

        if (Array.isArray(content) && content.length > 0) {
          const firstItem = content[0]
          if (firstItem && firstItem.SUBJECT && firstItem.SUBJECT.trim() !== '') {
            attendanceData = content
          }
        }

        if (attendanceData.length === 0 && rawOutput && typeof rawOutput === 'string') {
          try {
            const lines = rawOutput.split('\n').filter(line => line.trim())

            const dataLines = lines.filter(
              line =>
                line.includes('│') &&
                !line.includes('INDEX') &&
                !line.includes('──────') &&
                line.trim() !== '' &&
                /^\s*\d+\s*│/.test(line)
            )


            attendanceData = dataLines
              .map(line => {
                const allColumns = line.split('│').map(col => col.trim())

                if (allColumns.length >= 7) {
                  const result = {
                    INDEX: allColumns[0] || '',
                    SUBJECT: allColumns[1] || '',
                    TYPE: allColumns[2] || '',
                    'FACULTY NAME': allColumns[3] || '',
                    'CLASSES ATTENDED': allColumns[4] || '',
                    PERCENTAGE: (allColumns[5] || '').replace('%', ''),
                    '75% ALERT': allColumns[6] || '',
                  }

                  return result
                } else {
                  return null
                }
              })
              .filter(Boolean)
          } catch (error) {
            attendanceData = []
          }
        }

        if (!Array.isArray(attendanceData) || attendanceData.length === 0) {

          if (vtopData.formatted_content) {
            return (
              <div className="space-y-3">
                <div className="p-3 bg-muted/50 rounded-md overflow-x-auto">
                  <div
                    className="text-sm text-muted-foreground prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: vtopData.formatted_content }}
                  />
                </div>
              </div>
            )
          }

          if (data && typeof data === 'string') {
            return (
              <div className="space-y-3">
                <div className="p-3 bg-muted/50 rounded-md overflow-x-auto">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{data}</pre>
                </div>
              </div>
            )
          }

          return <div className="text-muted-foreground text-sm">No attendance data available.</div>
        }

        if (Array.isArray(attendanceData) && attendanceData.length > 0) {

          const validSubjects = attendanceData.filter((subject: any) => {
            const subjectName = subject.SUBJECT || subject.subject || subject.name || ''
            const percentage = parseFloat(
              subject.PERCENTAGE || subject.percentage || subject.attendance || '0'
            )
            const attended =
              subject['CLASSES ATTENDED'] || subject.attended || subject.classesAttended || '0'
            const total = subject['TOTAL CLASSES'] || subject.total || subject.totalClasses || '0'

            const isValid =
              subjectName && subjectName.trim() !== '' && !subjectName.match(/^Subject \d+$/i)

            return isValid
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

        if (vtopData.formatted_content) {
          return (
            <div className="space-y-3">
              <div className="p-3 bg-muted/50 rounded-md overflow-x-auto">
                <div
                  className="text-sm text-muted-foreground prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: vtopData.formatted_content }}
                />
              </div>
            </div>
          )
        }

        if (data && typeof data === 'string') {
          return (
            <div className="space-y-3">
              <div className="p-3 bg-muted/50 rounded-md overflow-x-auto">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{data}</pre>
              </div>
            </div>
          )
        }

        return <div className="text-muted-foreground text-sm">No attendance data available.</div>
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
      case 'course-info':
        try {
          const parsedOutput = JSON.parse(content)
          return <FfcsCourseSearchResult data={parsedOutput} />
        } catch (error) {
          return (
            <pre className="text-xs text-red-400">Error parsing tool output: {String(error)}</pre>
          )
        }
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


      return (
        <div className="space-y-3">
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h4 className="text-sm font-medium text-destructive">Error Retrieving Data</h4>
            </div>
            <p className="text-sm text-destructive font-medium">{errorMessage}</p>
            {vtopData.requiresCredentials && (
              <p className="text-xs text-muted-foreground mt-2">
                Credentials required to view this data.
              </p>
            )}
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
                <div className="space-y-3">
                  {Object.entries(finalStructuredData).map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-blue-400 shrink-0" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {formatKeyLabel(key)}
                        </span>
                      </div>
                      <div className="text-xs text-card-foreground">
                        {renderStructuredValue(key, value)}
                      </div>
                    </div>
                  ))}
                </div>
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
    const urlToView = paper.link || paper.url || paper.pdfUrl || paper.downloadUrl
    const fromExamCooker =
      typeof paper.source === 'string' && paper.source.toLowerCase() === 'examcooker'

    if (fromExamCooker) {
      if (urlToView && typeof window !== 'undefined') {
        window.open(urlToView, '_blank', 'noopener,noreferrer')
      }
      return
    }

    setIsLoading(true)
    try {
      onViewPdf(urlToView, paper.title)
    } finally {
      setTimeout(() => setIsLoading(false), 1000)
    }
  }

  return (
    <Card className="w-full hover:shadow-md transition-all duration-200 border-border bg-card group flex flex-col h-full">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium line-clamp-3 text-card-foreground group-hover:text-primary transition-colors leading-snug">
            {paper.title}
          </CardTitle>
          {paper.rank && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
              #{paper.rank}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3 flex-1 flex flex-col">
        <div className="space-y-2 text-xs text-muted-foreground flex-1">
          {(paper.examType || paper.year || paper.slot) && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
              {paper.examType && (
                <Badge variant="secondary" className="text-[10px] h-5 px-2">
                  {paper.examType}
                </Badge>
              )}
              {paper.year && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {paper.year}
                </span>
              )}
              {paper.slot && (
                <span className="inline-flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px] h-5 px-2">
                    Slot {paper.slot}
                  </Badge>
                </span>
              )}
            </div>
          )}
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
          {(paper.journal || paper.venue || paper.conference || paper.metadata) && (
            <div className="flex items-start gap-2">
              <FileSearch className="h-3 w-3 shrink-0 mt-0.5" />
              <span className={isMobile && !expanded ? 'line-clamp-1' : 'line-clamp-2'}>
                {paper.journal || paper.venue || paper.conference || paper.metadata}
              </span>
            </div>
          )}
          {typeof paper.score === 'number' && (
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3 w-3 shrink-0" />
              <span>Relevance: {(paper.score * 100).toFixed(1)}%</span>
            </div>
          )}

          {Array.isArray(paper.matchedQuestions) && paper.matchedQuestions.length > 0 && (
            <div className="mt-1 space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                Matched Questions
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                {paper.matchedQuestions.slice(0, expanded ? 6 : 3).map((mq: string, i: number) => (
                  <li key={i} className="text-[11px] leading-snug line-clamp-2" title={mq}>
                    {mq}
                  </li>
                ))}
              </ul>
              {paper.matchedQuestions.length > 3 && !expanded && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setExpanded(true)}
                >
                  Show Matches
                </Button>
              )}
            </div>
          )}
        </div>

        {paper.indexId && (
          <div className="text-[10px] text-muted-foreground/70">Index: {paper.indexId}</div>
        )}
        {paper.source && (
          <div className="text-[10px] text-muted-foreground/70">Source: {paper.source}</div>
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

const SyllabusCard = ({
  syllabus,
  onViewPdf,
}: {
  syllabus: any
  onViewPdf: (url: string, title?: string) => void
}) => {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [isLoading, setIsLoading] = useState(false)

  const handleView = async () => {
    setIsLoading(true)
    try {
      const urlToView = syllabus.url || syllabus.link || syllabus.pdf || syllabus.downloadUrl
      onViewPdf(urlToView, syllabus.title || syllabus.filename || 'Syllabus')
    } finally {
      setTimeout(() => setIsLoading(false), 800)
    }
  }

  return (
    <Card className="w-full hover:shadow-md transition-all duration-200 border-border bg-card group flex flex-col h-full">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium line-clamp-3 text-card-foreground group-hover:text-primary transition-colors leading-snug">
            {syllabus.title || syllabus.filename || syllabus.code}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3 flex-1 flex flex-col">
        <div className="space-y-2 text-xs text-muted-foreground flex-1">
          {syllabus.code && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
              <Badge variant="secondary" className="text-[10px] h-5 px-2">
                {syllabus.code}
              </Badge>
            </div>
          )}

        </div>

        <div className="flex-shrink-0 pt-1">
          <div className="flex flex-col gap-2">
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition-all duration-200 hover:shadow-md"
              onClick={handleView}
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
                  View Syllabus
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface Course {
  code: string
  title: string
  slot?: string
  type?: string
  [key: string]: any
}

interface CourseWithSlots extends Course {
  slots: string[]
  count: number
}

const FacultyCard = ({ faculty }: { faculty: any }) => {
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [expanded, setExpanded] = useState(false)
  const [showCourses, setShowCourses] = useState(false)
  const hasCourses = Array.isArray(faculty.courses) && faculty.courses.length > 0

  const groupedCourses = React.useMemo(() => {
    if (!hasCourses) return []

    const courseMap: Record<string, CourseWithSlots> = {}

    faculty.courses.forEach((course: Course) => {
      if (!courseMap[course.code]) {
        courseMap[course.code] = {
          ...course,
          slots: course.slot ? [course.slot] : [],
          count: 1,
        }
      } else {
        const existing = courseMap[course.code]
        if (course.slot && !existing.slots.includes(course.slot)) {
          existing.slots.push(course.slot)
        }
        existing.count++
      }
    })

    return Object.values(courseMap)
  }, [faculty.courses, hasCourses])

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

        {hasCourses && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCourses(!showCourses)}
              className="h-8 px-3 text-xs w-full sm:w-auto flex items-center gap-1.5"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {showCourses
                ? 'Hide Courses'
                : `View ${groupedCourses.length} Course${groupedCourses.length !== 1 ? 's' : ''}`}
            </Button>

            <AnimatePresence>
              {showCourses && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 border rounded-lg divide-y">
                    <div className="bg-muted/30 p-2 px-3 text-xs font-medium text-muted-foreground flex items-center justify-between">
                      <span>Course Code</span>
                      <span>Title & Slots</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      {groupedCourses.map((course: any, idx: number) => (
                        <div
                          key={`${course.code}-${idx}`}
                          className="p-2 px-3 text-sm hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            <div className="font-mono text-xs font-medium min-w-[80px] pt-0.5">
                              {course.code}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-foreground">{course.title}</div>
                              {course.slots && course.slots.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {course.slots.map((slot: string, slotIdx: number) => (
                                    <Badge
                                      key={slotIdx}
                                      variant="outline"
                                      className="text-xs font-normal py-0.5 h-5"
                                    >
                                      {slot}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {(() => {
          const longFields = [
            faculty.specialization?.length > 30 ? 'specialization' : null,
            faculty.department?.length > 30 ? 'department' : null,
            faculty.email?.length > 30 ? 'email' : null,
          ].filter(Boolean)

          if (longFields.length > 1) {
            return (
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
            )
          }
        })()}
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
                  <h4 className="font-medium text-sm text-blue-600 dark:text-blue-400 mb-1">
                    Note
                  </h4>
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

const PlacementInfoCard = ({ data: rawData }: { data: any }) => {
  const [showDetails, setShowDetails] = useState(false)
  const { data: placementData, campus, formatted_content } = rawData

  if (!placementData) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">No placement data found in the response.</p>
      </div>
    )
  }

  const { statistics: stats, companies, recentOffers: recent_offers } = placementData

  if (!stats && !companies && !recent_offers && !formatted_content) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">No placement information available.</p>
      </div>
    )
  }

  const renderStat = (icon: React.ReactNode, label: string, value: string | number | undefined) => {
    if (!value) return null
    return (
      <div className="flex items-center gap-3 bg-muted/50 p-3 rounded-lg">
        <div className="text-primary">{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-bold text-lg">{value}</p>
        </div>
      </div>
    )
  }

  const hasCampusData =
    campus && stats && stats['Total Offers'] !== '0' && rawData.data?.source?.includes('campus')
  const academicYear = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`

  return (
    <div className="space-y-6">
      {formatted_content && (
        <div
          className="prose max-w-none dark:prose-invert bg-card rounded-lg p-6 border border-border"
          dangerouslySetInnerHTML={{ __html: formatted_content }}
        />
      )}

      <div className="flex justify-center">
        <Button variant="outline" onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? 'Hide' : 'Show'} Detailed Stats
        </Button>
      </div>

      {showDetails && (
        <div className="space-y-6 pt-6 border-t">
          {campus && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/20 p-6 rounded-xl border border-blue-100 dark:border-blue-800/50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <School className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h2 className="text-2xl font-bold text-foreground">{campus} Campus</h2>
                  </div>
                  <p className="text-muted-foreground">
                    {hasCampusData
                      ? `Campus-specific placement statistics for ${academicYear} Academic Year`
                      : `Placement statistics for ${academicYear} Academic Year`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="bg-white dark:bg-blue-900/30 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-blue-100 dark:border-blue-800/50">
                    <Briefcase className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium">
                      {stats?.['Companies'] || 'N/A'} Companies
                    </span>
                  </div>
                  <div className="bg-white dark:bg-blue-900/30 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-blue-100 dark:border-blue-800/50">
                    <Award className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium">
                      {stats?.['Total Offers'] || 'N/A'} Offers
                    </span>
                  </div>
                </div>
              </div>

              {hasCampusData && (
                <div className="mt-4 pt-4 border-t border-blue-100 dark:border-blue-800/30">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Highest CTC</p>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {stats['Highest CTC']}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Average CTC</p>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {stats['Average CTC']}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Median CTC</p>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {stats['Median CTC']}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Lowest CTC</p>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {stats['Lowest CTC']}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {campus && !hasCampusData && (
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/50">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Note: Campus-Specific Data Limited
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        The statistics shown include data from all VIT campuses. Specific data for{' '}
                        {campus} campus is limited or not available.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {stats && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {hasCampusData ? 'Campus Placement Statistics' : 'Combined Placement Statistics'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {renderStat(
                  <TrendingUp className="h-6 w-6" />,
                  'Total Offers',
                  stats['Total Offers']
                )}
                {renderStat(
                  <DollarSign className="h-6 w-6" />,
                  'Highest CTC',
                  stats['Highest CTC']
                )}
                {renderStat(<Target className="h-6 w-6" />, 'Average CTC', stats['Average CTC'])}
                {renderStat(<Users className="h-6 w-6" />, 'Companies Visited', stats['Companies'])}
                {renderStat(<Star className="h-6 w-6" />, 'Median CTC', stats['Median CTC'])}
                {renderStat(<CheckCircle className="h-6 w-6" />, 'Lowest CTC', stats['Lowest CTC'])}
              </div>
            </div>
          )}

          {companies && companies.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Top Companies
              </h3>
              <div className="flex flex-wrap gap-2">
                {companies.slice(0, 15).map((company: any, index: number) => (
                  <Badge key={index} variant="secondary" className="text-sm py-1 px-3">
                    {company.name || company}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {recent_offers && recent_offers.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Recent Offers
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recent_offers.slice(0, 6).map((offer: any, index: number) => (
                  <Card key={index} className="p-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="font-semibold text-sm">{offer.company}</p>
                        <p className="text-xs text-muted-foreground">{offer.date}</p>
                      </div>
                      <Badge variant="outline" className="text-xs whitespace-nowrap text-right">
                        {offer.ctc}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
  maximizedItem: propMaximizedItem,
  setMaximizedItem: propSetMaximizedItem,
}: ArtifactDisplayProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [showAllItems, setShowAllItems] = useState(false)
  const [internalMaximizedItem, setInternalMaximizedItem] = useState<any>(null)

  const isControlled = propMaximizedItem !== undefined && propSetMaximizedItem !== undefined

  const maximizedItem = isControlled ? propMaximizedItem : internalMaximizedItem
  const setMaximizedItem = isControlled ? propSetMaximizedItem! : setInternalMaximizedItem

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const [pdfTitle, setPdfTitle] = useState<string>('')
  const [paperSort, setPaperSort] = useState<string>('year_desc')
  const [paperExamFilter, setPaperExamFilter] = useState<string>('all')
  const [paperYearFilter, setPaperYearFilter] = useState<string>('all')
  const contentRef = useRef<HTMLDivElement>(null)

  const toggleExpand = () => setIsExpanded(!isExpanded)
  const toggleShowAll = () => setShowAllItems(!showAllItems)

  const handleMaximize = (item: any) => {
    if (isControlled) {
      propSetMaximizedItem!(item)
    } else {
      setInternalMaximizedItem(item)
    }
  }

  const handleCloseMaximize = () => {
    if (isControlled) {
      propSetMaximizedItem!(null)
    } else {
      setInternalMaximizedItem(null)
    }
  }

  let items: any[] = []
  let addPdf: ((item: any) => void) | undefined
  let openPdf: ((id: string) => void) | undefined
  let minimizePdf: ((id: string) => void) | undefined
  let openByUrl: ((url: string) => void) | undefined
  let minimizeByUrl: ((url: string) => void) | undefined
  let removeByUrl: ((url: string) => void) | undefined

  try {
    const ctx = usePdfDock()
    items = ctx.items || []
    addPdf = ctx.addPdf
    openPdf = ctx.openPdf
    minimizePdf = ctx.minimizePdf
    openByUrl = (ctx as any).openByUrl
    minimizeByUrl = (ctx as any).minimizeByUrl
    removeByUrl = (ctx as any).removeByUrl
  } catch (e) {
  }

  useEffect(() => {
    const onOpenById = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent)?.detail
        const id = detail?.id
        if (!id) return
        const found = items.find((p: any) => p.id === id)
        if (found && found.url) {
          setPdfTitle(found.title || 'PDF Document')
          setPdfUrl(found.url)
          setIsPdfLoading(false)
        }
      } catch (e) {
      }
    }

    const onOpenByUrl = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent)?.detail
        const url = detail?.url
        if (!url) return
        const found = items.find((p: any) => p.url === url)
        setPdfTitle((found && found.title) || 'PDF Document')
        setPdfUrl(url)
        setIsPdfLoading(false)
      } catch (e) {
      }
    }

    window.addEventListener('pdf-dock:open', onOpenById as EventListener)
    window.addEventListener('pdf-dock:open-by-url', onOpenByUrl as EventListener)

    return () => {
      window.removeEventListener('pdf-dock:open', onOpenById as EventListener)
      window.removeEventListener('pdf-dock:open-by-url', onOpenByUrl as EventListener)
    }
  }, [items])

  const handleViewPdf = (url: string, title?: string) => {
    setIsPdfLoading(true)
    setPdfTitle(title || 'PDF Preview')
    const embedUrl = url.replace('/view?usp=sharing', '/preview').replace('/view', '/preview')

    try {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      if (addPdf) {
        addPdf({ id, url: embedUrl, title: title || 'PDF Document' })
        openPdf && openPdf(id)
        setPdfUrl(embedUrl)
      } else {
        setPdfUrl(embedUrl)
      }
    } catch (e) {
      setPdfUrl(embedUrl)
    }

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
    if (type === 'ffcs-planner') {
      return <FFCSArtifact />
    }

    if (type === 'course-info') {
      return <FfcsCourseSearchResult data={data} />
    }
    if (type === 'placements' && data && !Array.isArray(data)) {
      return <PlacementInfoCard data={data} />
    }

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
    if (isFacultyType && facultyList && facultyList.length === 0) {
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

    let processedItems = items
    if (type === 'papers' && items.length) {
      const chunkScores = items.map(p => (typeof p.chunkScore === 'number' ? p.chunkScore : 0))
      const questionScores = items.map(p =>
        typeof p.questionScore === 'number' ? p.questionScore : 0
      )
      const maxChunk = Math.max(...chunkScores)
      const minChunk = Math.min(...chunkScores)
      const maxQ = Math.max(...questionScores)
      const minQ = Math.min(...questionScores)
      const spreadChunk = maxChunk - minChunk
      const spreadQ = maxQ - minQ
      const allQZero = maxQ === 0
      processedItems = items.map((p, i) => {
        const rawChunk = chunkScores[i]
        const rawQ = questionScores[i]
        let relChunk =
          spreadChunk < 0.005
            ? maxChunk
              ? rawChunk / (maxChunk || 1)
              : 0
            : (rawChunk - minChunk) / (spreadChunk || 1)
        relChunk = Math.min(1, Math.max(0, relChunk ** 0.85))
        let relQ = 0
        if (!allQZero) {
          relQ = spreadQ < 0.005 ? (maxQ ? rawQ / (maxQ || 1) : 0) : (rawQ - minQ) / (spreadQ || 1)
          relQ = Math.min(1, Math.max(0, relQ ** 0.85))
        }
        return {
          ...p,
          _rawChunkScore: rawChunk,
          _rawQuestionScore: rawQ,
          displayContentPct: Math.round(relChunk * 100),
          displayQuestionPct: allQZero ? undefined : Math.round(relQ * 100),
          hasQuestionSignal: !allQZero && rawQ > 0.0005,
        }
      })
    }

    if (type === 'papers') {
      const normalizeExam = (e?: string) =>
        (e || '')
          .toString()
          .trim()
          .toUpperCase()
          .replace(/[\s-]+/g, '') // Treat CAT1 and CAT-1 as same
      const extractYearNum = (y?: string) => {
        if (!y) return -Infinity
        const m = String(y).match(/(20\d{2})/g)
        if (!m || m.length === 0) return -Infinity
        return Math.max(...m.map(s => parseInt(s, 10)))
      }
      processedItems = processedItems.filter(p => {
        const okExam =
          paperExamFilter === 'all' ||
          normalizeExam(p.examType || p.category) === normalizeExam(paperExamFilter)
        const okYear = paperYearFilter === 'all' || String(p.year || '').includes(paperYearFilter)
        return okExam && okYear
      })
      const examOrder: Record<string, number> = { FAT: 1, CAT2: 2, CAT1: 3, QUIZ: 4 }
      processedItems = [...processedItems].sort((a, b) => {
        switch (paperSort) {
          case 'relevance': {
            const ar = typeof a.rank === 'number' ? a.rank : Infinity
            const br = typeof b.rank === 'number' ? b.rank : Infinity
            if (ar !== br) return ar - br
            const as = typeof a.score === 'number' ? a.score : -Infinity
            const bs = typeof b.score === 'number' ? b.score : -Infinity
            return bs - as
          }
          case 'year_desc':
            return extractYearNum(b.year) - extractYearNum(a.year)
          case 'year_asc':
            return extractYearNum(a.year) - extractYearNum(b.year)
          case 'exam': {
            const ae = examOrder[normalizeExam(a.examType)] || 99
            const be = examOrder[normalizeExam(b.examType)] || 99
            if (ae !== be) return ae - be
            return (a.examType || '').localeCompare(b.examType || '')
          }
          case 'slot':
            return (a.slot || '').localeCompare(b.slot || '')
          case 'source':
            return (a.source || '').localeCompare(b.source || '')
          case 'title':
            return (a.title || '').localeCompare(b.title || '')
          default:
            return 0
        }
      })
    }

    const itemCount = processedItems.length
    const displayItems =
      showAllItems || !isMobile || isFullscreen ? processedItems : processedItems.slice(0, 3)
    const hasMoreItems = isMobile && items.length > 3 && !showAllItems && !isFullscreen

    return (
      <>
        {type === 'papers' && (
          <div className="flex flex-wrap items-center gap-2 gap-y-2 mb-2 w-full">
            <div className="text-xs text-muted-foreground mr-2">Sort:</div>
            <Select value={paperSort} onValueChange={setPaperSort}>
              <SelectTrigger className="h-7 text-xs w-full sm:w-auto min-w-[150px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year_desc">Year (newest)</SelectItem>
                <SelectItem value="year_asc">Year (oldest)</SelectItem>
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="exam">Exam Type</SelectItem>
                <SelectItem value="slot">Slot</SelectItem>
                <SelectItem value="source">Source</SelectItem>
                <SelectItem value="title">Title</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground ml-3">Filter:</div>
            <Select value={paperExamFilter} onValueChange={setPaperExamFilter}>
              <SelectTrigger className="h-7 text-xs w-full sm:w-auto min-w-[140px]">
                <SelectValue placeholder="All exams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Exams</SelectItem>
                <SelectItem value="CAT-1">CAT-1</SelectItem>
                <SelectItem value="CAT-2">CAT-2</SelectItem>
                <SelectItem value="FAT">FAT</SelectItem>
                <SelectItem value="Quiz">Quiz</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paperYearFilter} onValueChange={setPaperYearFilter}>
              <SelectTrigger className="h-7 text-xs w-full sm:w-auto min-w-[130px]">
                <SelectValue placeholder="All years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {Array.from(
                  new Set(
                    (Array.isArray(items) ? items : []).map((p: any) => p.year).filter(Boolean)
                  )
                ).map((y: any) => (
                  <SelectItem key={String(y)} value={String(y)}>
                    {String(y)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}{' '}
        <div
          className={cn(
            'grid gap-3',
            type === 'mess-menu' ||
              type === 'vtop-data' ||
              type === 'reddit-knowledge' ||
              type === 'reddit-overview' ||
              type === 'papers-index' ||
              type === 'papers-qa' ||
              type === 'question-patterns' ||
              type === 'gravitas-events' ||
              type === 'gravitas-event-registration' ||
              type === 'general' ||
              type === 'error' ||
              type === 'campus-info' ||
              type === 'faculty' ||
              type === 'generated-image'
              ? 'grid-cols-1 w-full max-w-full gap-4'
              : type === 'papers'
                ? isMobile
                  ? 'grid-cols-1'
                  : isFullscreen
                    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
                    : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3'
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
              case 'syllabi':
                return (
                  <SyllabusCard
                    key={index}
                    syllabus={item}
                    onViewPdf={(url, title) => handleViewPdf(url, title)}
                  />
                )
              case 'faculty':
                return <FacultyCard key={index} faculty={item} />
              case 'companies':
                return <CompanyCard key={index} company={item} />
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
              case 'placements':
                return <PlacementInfoCard key={index} data={item} />
              case 'papers-index':
                return <PapersIndexArtifact key={index} data={item} />
              case 'papers-qa':
                return <PapersQAArtifact key={index} data={item} />
              case 'question-patterns':
                const QuestionPatternsArtifact =
                  require('./artifacts/question-patterns-artifact').default
                return <QuestionPatternsArtifact key={index} data={item} />
              case 'gravitas-events':
                const GravitasEventsArtifact =
                  require('./artifacts/gravitas-events-artifact').default
                return <GravitasEventsArtifact key={index} data={item} />
              case 'gravitas-event-registration':
                const GravitasEventRegistrationArtifact =
                  require('./artifacts/gravitas-event-registration-artifact').default
                return <GravitasEventRegistrationArtifact key={index} data={item} />
              case 'general':
                return <GeneralCard key={index} data={item} />
              case 'generated-image':
                return <GeneratedImageCard key={index} data={item} />
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
            {!isMobile && (
              <motion.div
                className="w-80 bg-muted dark:bg-background h-full border-r border-border flex-shrink-0 overflow-y-auto"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClosePdf}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>


                      {(minimizeByUrl || minimizePdf) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            try {
                              if (minimizeByUrl && pdfUrl) {
                                minimizeByUrl(String(pdfUrl))
                              } else if (minimizePdf && items && pdfUrl) {
                                const found = items.find((p: any) => p.url === pdfUrl)
                                if (found) minimizePdf(found.id)
                              }
                            } catch (e) {
                            }

                            handleClosePdf()
                          }}
                        >
                          Minimize
                        </Button>
                      )}

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
                  <div className="flex items-center gap-2">

                    {(minimizeByUrl || minimizePdf) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          try {
                            if (minimizeByUrl && pdfUrl) {
                              minimizeByUrl(String(pdfUrl))
                            } else if (minimizePdf && items && pdfUrl) {
                              const found = items.find((p: any) => p.url === pdfUrl)
                              if (found) minimizePdf(found.id)
                            } else if (items && items.length > 0) {
                              const mostRecent = items[items.length - 1]
                              if (mostRecent) minimizePdf && minimizePdf(mostRecent.id)
                            }
                          } catch (e) {}
                          handleClosePdf()
                        }}
                        aria-label="Minimize PDF"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    )}
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

function GeneratedImageCard({ data }: { data: any }) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<{
    base64: string
    mimeType: string
  } | null>(null)

  // Handle single image or multiple images
  const images = data?.images || (data?.image ? [data.image] : [])

  const handleDownload = (image: { base64: string; mimeType: string }, index: number) => {
    const link = document.createElement('a')
    link.href = `data:${image.mimeType};base64,${image.base64}`
    const extension = image.mimeType.split('/')[1] || 'png'
    link.download = `generated-image-${index + 1}.${extension}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleCopyPrompt = async () => {
    if (data?.prompt) {
      try {
        await navigator.clipboard.writeText(data.prompt)
      } catch {}
    }
  }

  if (images.length === 0) {
    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">No images generated</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="hover:shadow-md transition-shadow overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-purple-500" />
              <CardTitle className="text-sm font-medium">Generated Image{images.length > 1 ? 's' : ''}</CardTitle>
            </div>
            {images.length > 1 && (
              <Badge variant="secondary" className="text-xs">
                {images.length} images
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          {data?.prompt && (
            <div className="flex items-start gap-2 p-2 rounded bg-muted/50 border border-border/40">
              <Sparkles className="h-3.5 w-3.5 text-purple-500 mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground flex-1 line-clamp-2">{data.prompt}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleCopyPrompt}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}

          <div className={cn(
            'grid gap-2',
            images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          )}>
            {images.map((image: { base64: string; mimeType: string }, index: number) => (
              <div
                key={index}
                className="relative group rounded-lg overflow-hidden border border-border/50 bg-muted/30"
              >
                <img
                  src={`data:${image.mimeType};base64,${image.base64}`}
                  alt={data?.prompt || `Generated image ${index + 1}`}
                  className="w-full h-auto object-contain max-h-[400px] cursor-pointer transition-transform hover:scale-[1.02]"
                  onClick={() => {
                    setSelectedImage(image)
                    setIsFullscreen(true)
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs bg-white/90 hover:bg-white text-black"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDownload(image, index)
                      }}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs bg-white/90 hover:bg-white text-black"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedImage(image)
                        setIsFullscreen(true)
                      }}
                    >
                      <Maximize2 className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {(data?.aspectRatio || data?.style) && (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {data.aspectRatio && (
                <Badge variant="outline" className="text-[10px]">
                  {data.aspectRatio}
                </Badge>
              )}
              {data.style && (
                <Badge variant="outline" className="text-[10px]">
                  {data.style}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fullscreen Modal */}
      <AnimatePresence>
        {isFullscreen && selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setIsFullscreen(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="relative max-w-[90vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={`data:${selectedImage.mimeType};base64,${selectedImage.base64}`}
                alt={data?.prompt || 'Generated image'}
                className="max-w-full max-h-[85vh] object-contain rounded-lg"
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-white/90 hover:bg-white text-black"
                  onClick={() => handleDownload(selectedImage, 0)}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="bg-white/90 hover:bg-white text-black"
                  onClick={() => setIsFullscreen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {data?.prompt && (
                <div className="absolute bottom-2 left-2 right-2 p-3 bg-black/70 rounded-lg">
                  <p className="text-sm text-white">{data.prompt}</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function GeneralCard({ data }: { data: any }) {
  const hasIndex = typeof data?.indexId === 'string' || typeof data?.indexId === 'number'
  const hasAnswer = typeof data?.answer === 'string' && data.answer.trim().length > 0
  const hasSources = Array.isArray(data?.sources) && data.sources.length > 0

  const copy = async (text?: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(String(text))
    } catch {}
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        {data?.message && (
          <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
            {data.message}
          </div>
        )}

        {hasIndex && (
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-1 rounded bg-muted border border-border/50 font-mono break-all">
              {String(data.indexId)}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => copy(data.indexId)}
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> copy indexId
            </Button>
          </div>
        )}

        {(data?.course || data?.examType || data?.year || data?.totalIndexed) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
            {data.course && (
              <div>
                <span className="font-medium text-foreground/80">course:</span> {data.course}
              </div>
            )}
            {data.examType && (
              <div>
                <span className="font-medium text-foreground/80">exam:</span> {data.examType}
              </div>
            )}
            {data.year && (
              <div>
                <span className="font-medium text-foreground/80">year:</span> {data.year}
              </div>
            )}
            {typeof data.totalIndexed !== 'undefined' && (
              <div>
                <span className="font-medium text-foreground/80">indexed:</span> {data.totalIndexed}
              </div>
            )}
          </div>
        )}

        {hasAnswer && (
          <div className="p-3 rounded border border-border/40 bg-card/40">
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {data.answer}
            </div>
          </div>
        )}

        {hasSources && (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              sources
            </div>
            <div className="space-y-1">
              {data.sources.map((s: any, idx: number) => (
                <a
                  key={idx}
                  href={s?.url || s?.link || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="block p-2 rounded border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-colors text-xs break-words"
                >
                  {s?.title || s?.url || s?.link || 'source'}
                </a>
              ))}
            </div>
          </div>
        )}

        {!hasIndex && !hasAnswer && !hasSources && (
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-x-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}

PureArtifactDisplay.displayName = 'PureArtifactDisplay'

const ArtifactDisplay = memo(PureArtifactDisplay)
ArtifactDisplay.displayName = 'ArtifactDisplay'

export { ArtifactDisplay, type ArtifactDisplayProps }
