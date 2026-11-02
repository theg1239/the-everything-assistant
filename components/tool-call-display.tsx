'use client'

import React, { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  AlertCircle,
  FileSearch,
  Users,
  Building2,
  GraduationCap,
  TrendingUp,
  UtensilsCrossed,
  Shield,
  MapPin,
  Search,
  BookOpen,
  Calendar,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import dynamic from 'next/dynamic'
import type { ArtifactDisplayProps } from './artifact-display'
import { PaperSearchProgress } from './paper-search-progress'
import { useVTOP } from '../contexts/vtop-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { asRecord, readString, readText, type UnknownRecord } from '@/components/narrow'
import { useHydrationSafeField } from '@/lib/hydration-safe'

/** Artifact renderers (~140 KB) load only when a tool result renders one; SSR stays on for history. */
const ArtifactDisplay = dynamic(() => import('./artifact-display').then(mod => mod.ArtifactDisplay))

/**
 * A tool invocation as rendered by this component. `result` is the raw, unvalidated tool output;
 * `function` / `id` / `type` are legacy fields some persisted invocations may still carry.
 */
export type ToolCallInput = {
  toolName?: string
  toolCallId?: string
  id?: string
  type?: string
  args?: Record<string, unknown>
  result?: unknown
  state?: string
  function?: unknown
}

interface ToolCallDisplayProps {
  toolCalls: ToolCallInput[]
  onLoginClick?: () => void
  onPlacementSearch?: (company: string) => void
  maximizedItem?: ArtifactDisplayProps['maximizedItem']
  setMaximizedItem?: ArtifactDisplayProps['setMaximizedItem']
}

const VTOP_ARTIFACT_BLACKLIST = new Set(['exams', 'exam-schedule'])

/** Reads `command` from a legacy `function.arguments` payload (object or JSON string). */
const commandFromFunctionArgs = (fn: unknown): unknown => {
  const args = asRecord(fn)?.arguments
  if (typeof args === 'string') {
    try {
      return asRecord(JSON.parse(args || '{}'))?.command
    } catch {
      return null
    }
  }
  return asRecord(args)?.command
}

const resolveToolCommand = (tool: ToolCallInput, fallback: string): string =>
  readString(asRecord(tool.result)?.command) ||
  readString(tool.args?.command) ||
  readString(commandFromFunctionArgs(tool.function)) ||
  fallback

const getArtifactConfig = (rawResult: unknown, toolName?: string, toolCallId?: string) => {
  // Non-object results have no readable fields; they still flow through as `data` below.
  const result: UnknownRecord = asRecord(rawResult) ?? {}

  if (toolName === 'resolveCourseCode') {
    return null
  }

  if (toolName === 'submitFeedback' || toolName === 'contributeKnowledge') {
    return null
  }

  if (toolName === 'queryVTOP') {
    if (result.data || result.output) {
      const vtopData = result.data || result.output
      const command = readString(result.command) || 'unknown'

      if (VTOP_ARTIFACT_BLACKLIST.has(command)) {
        return null
      }

      let parsedData: unknown = vtopData
      if (typeof vtopData === 'string') {
        if (vtopData.includes('│') && vtopData.includes('──')) {
          const lines = vtopData.split('\n').filter(line => line.trim() && !line.includes('──'))
          const headerLine = lines[0]

          if (lines.length > 1 && headerLine !== undefined) {
            const firstLine = headerLine
              .split('│')
              .map(h => h.trim())
              .filter(h => h)
            if (
              firstLine.length === 2 &&
              firstLine[0] === 'FIELD' &&
              firstLine[1] === 'INFORMATION'
            ) {
              const profileData: Record<string, string> = {}
              const dataLines = lines.slice(1)

              dataLines.forEach(line => {
                const [nameCell, valueCell] = line
                  .split('│')
                  .map(c => c.trim())
                  .filter(c => c)
                if (nameCell !== undefined && valueCell !== undefined) {
                  const fieldName = nameCell.replace(/\[32m|\[0m/g, '')
                  const fieldValue = valueCell.replace(/\[32m|\[0m/g, '')
                  profileData[fieldName] = fieldValue
                }
              })
              parsedData = profileData
            } else {
              const headers = firstLine.filter(h => h !== 'INDEX')
              const rows = lines.slice(1).map(line => {
                const cells = line
                  .split('│')
                  .map(c => c.trim())
                  .filter(c => c)
                const row: Record<string, string> = {}
                const indexOffset = cells.length - headers.length
                headers.forEach((header, index) => {
                  const cell = cells[index + (indexOffset > 0 ? 1 : 0)]
                  if (cell !== undefined) {
                    const cellValue = cell
                      .replace(/\[32m|\[0m|\[31m|\[33m|\[34m|\[35m|\[36m|\[37m/g, '')
                      .replace(/[^\x20-\x7E]/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                    row[header] = cellValue
                  }
                })
                return row
              })
              let processedRows = rows
              if (command === 'attendance' && Array.isArray(processedRows)) {
                processedRows = processedRows.map(row => {
                  const clean = (val: string | undefined) => val?.trim()
                  return {
                    SUBJECT:
                      clean(row.SUBJECT) ||
                      clean(row['SUBJECT NAME']) ||
                      clean(row['SUBJECT CODE']) ||
                      clean(row.Subject) ||
                      clean(row['Subject Name']) ||
                      clean(row['Subject Code']) ||
                      clean(row.NAME) ||
                      clean(row.name) ||
                      '',
                    PERCENTAGE:
                      clean(row.PERCENTAGE) ||
                      clean(row['%']) ||
                      clean(row['ATTENDANCE PERCENTAGE']) ||
                      clean(row.percentage) ||
                      clean(row.attendance) ||
                      '',
                    'CLASSES ATTENDED':
                      clean(row['CLASSES ATTENDED']) ||
                      clean(row.ATTENDED) ||
                      clean(row['Classes Attended']) ||
                      clean(row.attended) ||
                      '',
                    'TOTAL CLASSES':
                      clean(row['TOTAL CLASSES']) ||
                      clean(row.TOTAL) ||
                      clean(row['Total Classes']) ||
                      clean(row.total) ||
                      '',
                    '75% ALERT':
                      clean(row['75% ALERT']) ||
                      clean(row.ALERT) ||
                      clean(row.Status) ||
                      clean(row.STATUS) ||
                      clean(row.alert) ||
                      '',
                  }
                })
              }
              parsedData = processedRows
            }
          }
        } else {
          try {
            parsedData = JSON.parse(vtopData)
          } catch (e) {
            parsedData = vtopData
          }
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
          da: 'Digital Assignment',
          timetable: 'Timetable',
          attendance: 'Attendance',
          grades: 'Grades',
          profile: 'Profile',
        }
        return commandMap[cmd] || cmd.charAt(0).toUpperCase() + cmd.slice(1).replace(/-/g, ' ')
      }

      return {
        type: 'vtop-data' as const,
        title: `VTOP ${formatCommandName(command)} Data`,
        icon: <GraduationCap className="h-5 w-5 text-blue-500" />,
        data: {
          command,
          content: parsedData,
          rawOutput: vtopData,
          success: result.success !== false,
          parsedData: result.parsedData,
          formatted_content: result.formatted_content,
          structured_data: result.structured_data,
          summary: result.summary,
          error: result.error,
          message: result.message,
        },
        source: 'VTOP',
      }
    }

    if (result.requiresCredentials === true) {
      return null
    }

    if (result.success === false || result.error) {
      let errorMessage = readString(result.error) || readString(result.message) || ''

      if (
        !errorMessage ||
        errorMessage === '500' ||
        errorMessage.toLowerCase().includes('request failed') ||
        errorMessage.includes('VTOP request failed: 500')
      ) {
        const rawData = result.output || result.data
        if (typeof rawData === 'string') {
          if (
            rawData.includes('Login failed') ||
            rawData.includes('session could not be established') ||
            rawData.includes('Invalid LoginId/Password')
          ) {
            if (rawData.includes('Invalid LoginId/Password')) {
              errorMessage = 'Invalid LoginId/Password'
            } else {
              errorMessage = 'Login failed - incorrect username/password'
            }
          } else if (
            rawData.includes('credentials required') ||
            rawData.includes('VTOP credentials required')
          ) {
            errorMessage = 'VTOP credentials required'
          } else if (rawData.includes('error') || rawData.includes('Error')) {
            const lines = rawData.split('\n')
            const errorLine = lines.find(
              line =>
                line.toLowerCase().includes('error') ||
                line.toLowerCase().includes('failed') ||
                line.toLowerCase().includes('invalid')
            )
            if (errorLine) {
              errorMessage = errorLine.trim()
            }
          }
        }
      }

      if (errorMessage.includes('Login failed or session could not be established')) {
        errorMessage = 'Login failed - incorrect username/password'
      }

      const isCredentialError =
        errorMessage.includes('VTOP credentials required') ||
        errorMessage.includes('credentials') ||
        (errorMessage.includes('500') && !errorMessage.includes('server error'))
      const isAuthError =
        errorMessage.includes('Invalid LoginId/Password') ||
        errorMessage.includes('Login failed') ||
        errorMessage.includes('session could not be established') ||
        errorMessage.includes('incorrect username/password') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('Login failed or session could not be established')

      if (isCredentialError) {
        return null
      }

      const formatCommandName = (cmd: string) => {
        const commandMap: { [key: string]: string } = {
          'class-message': 'Class Message',
          'exam-schedule': 'Exam Schedule',
          'library-dues': 'Library Dues',
          'leave-status': 'Leave Status',
          nightslip: 'Night Slip',
          'course-page': 'Course Page',
          da: 'Digital Assignment',
          timetable: 'Timetable',
          attendance: 'Attendance',
          grades: 'Grades',
          profile: 'Profile',
        }
        return commandMap[cmd] || cmd.charAt(0).toUpperCase() + cmd.slice(1).replace(/-/g, ' ')
      }

      const errorCommand = readString(result.command) || 'data'
      return {
        type: 'vtop-data' as const,
        title: `VTOP ${formatCommandName(errorCommand)} Data`,
        icon: <GraduationCap className="h-5 w-5 text-blue-500" />,
        data: {
          command: errorCommand,
          requiresCredentials: false,
          success: false,
          error: errorMessage,
          message: result.message,
          rawOutput: result.output || result.data,
        },
        source: 'VTOP Portal',
      }
    }

    return null
  }

  if (Array.isArray(result.papers) && result.papers.length > 0) {
    return {
      type: 'papers' as const,
      title: `${result.papers.length} Past Papers${result.courseCode ? ` (${String(result.courseCode)})` : ''}`,
      icon: <GraduationCap className="h-5 w-5 text-blue-400" />,
      data: result.papers.map((item: unknown) => {
        const paper = asRecord(item) ?? {}
        const link = paper.link || paper.url || paper.pdfUrl || paper.downloadUrl || paper.final_url
        const examType = paper.examType || paper.exam || paper.paperType
        const year = paper.year || paper.academicYear
        const slot = paper.slot
        const source = paper.source
        return {
          ...paper,
          link,
          examType,
          year,
          slot,
          source,
        }
      }),
      source: 'evtg. asst.',
    }
  }

  if (
    toolName === 'getSyllabus' ||
    result.syllabus ||
    result.filename ||
    result.url ||
    (result.success && result.filename)
  ) {
    const normalizeFilename = (fn: unknown) => {
      if (!fn || typeof fn !== 'string') return { code: null, title: null }
      const base = fn.split('/').pop() || fn
      const withoutExt = base.replace(/\.[^.]+$/, '')
      const parts = withoutExt.split(/_(.+)/)
      const codePart = (parts[0] || '').trim()
      const titlePart = (parts[1] || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
      const title = titlePart ? titlePart.replace(/\b\w/g, c => c.toUpperCase()) : null
      return { code: codePart || null, title }
    }

    const makeEntryFrom = (entry: UnknownRecord) => {
      const filename = entry.filename || entry.file || null
      const url =
        entry.url ||
        (filename ? `https://storage.googleapis.com/examcooker/syllabi/${filename}` : null)
      const norm = normalizeFilename(filename)
      const code = entry.code || norm.code
      const title = entry.title || norm.title || (entry.message ? String(entry.message) : null)
      return { filename, url, code, title, raw: entry }
    }

    const resultData = asRecord(result.data)
    let entries: ReturnType<typeof makeEntryFrom>[] = []
    if (result.ambiguous && Array.isArray(result.matches)) {
      entries = result.matches.map((m: unknown) => makeEntryFrom(asRecord(m) ?? {}))
    } else if (Array.isArray(result.syllabi)) {
      entries = result.syllabi.map((s: unknown) => makeEntryFrom(asRecord(s) ?? {}))
    } else if (result.filename || result.url || result.code || result.title) {
      entries = [makeEntryFrom(result)]
    } else if (resultData && resultData.filename) {
      entries = [makeEntryFrom(resultData)]
    }

    const single = entries.length === 1 ? entries[0] : undefined
    const title = single
      ? single.code && single.title
        ? `${String(single.code)} — ${String(single.title)}`
        : `Syllabus: ${String(single.title || single.filename)}`
      : `${entries.length} Syllabi`

    return {
      type: 'syllabi' as const,
      title,
      icon: <BookOpen className="h-5 w-5 text-emerald-500" />,
      data: entries,
      source: 'Syllabus',
    }
  }

  if (result.rankedPapers && Array.isArray(result.rankedPapers) && result.rankedPapers.length > 0) {
    return {
      type: 'papers' as const,
      title:
        `${result.rankedPapers.length} Ranked Past Papers` +
        (result.courseCode ? ` (${String(result.courseCode)})` : ''),
      icon: <GraduationCap className="h-5 w-5 text-indigo-400" />,
      data: result.rankedPapers.map((item: unknown, i: number) => {
        const p = asRecord(item) ?? {}
        return {
          ...p,
          rank: i + 1,
          link: p.url,
          matchedQuestions: p.matchedQuestions || [],
          score: p.score,
          indexId: result.indexId,
          courseCode: result.courseCode,
          runId: result.runId || result.run_id,
        }
      }),
      source: 'Smart Agent',
    }
  }

  if (toolName === 'indexPastPapers') {
    if (result && result.success) {
      return {
        type: 'papers-index' as const,
        title: `Past Papers Indexed${result.indexId ? ` (index ${String(result.indexId).slice(0, 8)}…)` : ''}`,
        icon: <GraduationCap className="h-5 w-5 text-indigo-500" />,
        data: {
          message: result.message || 'Index created successfully',
          indexId: result.indexId,
          course: result.course,
          examType: result.examType,
          year: result.year,
          totalIndexed: result.totalIndexed || result.total || result.count,
          stats: result.stats || undefined,
        },
        source: 'Index Agent',
      }
    } else {
      return {
        type: 'error' as const,
        title: 'Indexing Failed',
        icon: <AlertCircle className="h-5 w-5 text-red-400" />,
        data: {
          success: false,
          error: result?.error || result?.message || 'Unable to index papers',
        },
        source: 'Index Agent',
      }
    }
  }

  if (toolName === 'analyzeQuestionPatterns' || result.source === 'question-patterns') {
    if (result && result.success) {
      return {
        type: 'question-patterns' as const,
        title: `Most Repeated Question Patterns${result.courseCode ? ` (${String(result.courseCode)}${result.examType ? ` • ${String(result.examType)}` : ''})` : ''}`,
        icon: <TrendingUp className="h-5 w-5 text-indigo-500" />,
        data: result,
        source: 'Analysis Agent',
      }
    } else {
      return {
        type: 'error' as const,
        title: 'Question Pattern Analysis Failed',
        icon: <AlertCircle className="h-5 w-5 text-red-400" />,
        data: {
          success: false,
          error: result?.error || result?.message || 'Unable to analyze question patterns',
        },
        source: 'Analysis Agent',
      }
    }
  }

  if (toolName === 'askPaperQuestion') {
    if (result && result.success) {
      return {
        type: 'papers-qa' as const,
        title: 'Past Papers Answer',
        icon: <GraduationCap className="h-5 w-5 text-indigo-500" />,
        data: {
          answer: result.answer || result.response || result.summary || result.message,
          sources: result.sources || result.citations || [],
          indexMeta: result.indexMeta || undefined,
          indexId: result.indexId || asRecord(result.indexMeta)?.id || undefined,
          question: result.question || undefined,
          debug: result.debug || undefined,
        },
        source: 'Papers Agent',
      }
    } else {
      return {
        type: 'error' as const,
        title: 'Paper Q&A Failed',
        icon: <AlertCircle className="h-5 w-5 text-red-400" />,
        data: {
          success: false,
          error: result?.error || result?.message || 'Unable to answer question',
        },
        source: 'Papers Agent',
      }
    }
  }

  if (toolName === 'generateImage') {
    if (result.success && result.image) {
      return {
        type: 'generated-image' as const,
        title: 'Generated Image',
        icon: <Sparkles className="h-5 w-5 text-purple-400" />,
        data: {
          image: result.image,
          images: result.images || [result.image],
          prompt: result.prompt,
          aspectRatio: result.aspectRatio,
          message: result.message,
        },
        source: 'Image Generation',
      }
    } else {
      return {
        type: 'error' as const,
        title: 'Image Generation Failed',
        icon: <AlertCircle className="h-5 w-5 text-red-400" />,
        data: {
          error: result.error,
          message: result.message,
          success: false,
        },
        source: 'Image Generation',
      }
    }
  }

  const menuData = asRecord(result.data)
  if (menuData && menuData.todayMenu && menuData.messType) {
    return {
      type: 'mess-menu' as const,
      title: `${String(menuData.messType)} - ${String(menuData.hostelType)}`,
      icon: <UtensilsCrossed className="h-5 w-5 text-orange-400" />,
      data: {
        hostelType: menuData.hostelType,
        messType: menuData.messType,
        todayMenu: menuData.todayMenu,
        weekMenu: menuData.weekMenu,
        requestedDate: menuData.requestedDate,
        actualDate: menuData.actualDate,
        isExactMatch: menuData.isExactMatch,
        formattedMenu: result.formattedMenu || menuData.formattedMenu,
        message: result.message,
      },
      source: 'MessIt',
    }
  }

  const resultError = readString(result.error)
  if (
    result.success === false &&
    result.error &&
    (resultError?.includes('Menu not available') ||
      resultError?.includes('mess menu') ||
      toolName === 'getMensMealPlan' ||
      toolName === 'getWomensMealPlan' ||
      readString(result.message)?.includes('mess menu'))
  ) {
    return {
      type: 'error' as const,
      title: 'Mess Menu Not Available',
      icon: <AlertCircle className="h-5 w-5 text-red-400" />,
      data: {
        error: result.error,
        message: result.message,
        availableDateRange: result.availableDateRange,
        success: false,
      },
      source: 'MessIt',
    }
  }

  if (Array.isArray(result.faculty) && result.faculty.length > 0) {
    return {
      type: 'faculty' as const,
      title: `${result.faculty.length} Faculty Members`,
      icon: <Users className="h-5 w-5 text-purple-400" />,
      data: result.faculty,
      source: 'Faculty Directory',
    }
  }

  if (Array.isArray(result.faculty)) {
    return {
      type: 'faculty' as const,
      title:
        result.faculty.length > 0 ? `${result.faculty.length} Faculty Members` : 'Faculty Search',
      icon: <Users className="h-5 w-5 text-purple-400" />,
      data: result.faculty,
      source: 'Faculty Directory',
      message: result.message,
      total: result.total,
      success: result.success,
    }
  }

  if (Array.isArray(result.companies) && result.companies.length > 0) {
    return {
      type: 'companies' as const,
      title: `${result.companies.length} Companies`,
      icon: <Building2 className="h-5 w-5 text-cyan-400" />,
      data: result.companies,
      source: result.source || toolName || 'Company Database',
    }
  }

  if (toolName === 'getCourseInfo') {
    return {
      type: 'course-info' as const,
      title: 'Course Information',
      icon: <GraduationCap className="h-4 w-4" />,
      data: result,
      source: 'Course Information',
    }
  }

  if (toolName === 'ffcs_planner') {
    return {
      type: 'ffcs-planner' as const,
      title: 'FFCS Timetable Planner',
      icon: <GraduationCap className="h-4 w-4" />,
      data: result,
      source: 'FFCS Planner',
    }
  }

  if (toolName === 'getPlacementInfo') {
    if (result.success) {
      return {
        type: 'placements' as const,
        title: `Placement Overview ${result.year ? `(${String(result.year)})` : ''}`,
        icon: <TrendingUp className="h-5 w-5 text-green-500" />,
        data: result,
        source: 'VIT Placements',
      }
    } else {
      return {
        type: 'error' as const,
        title: 'Placement Info Error',
        icon: <AlertCircle className="h-5 w-5 text-red-500" />,
        data: { error: result.message || 'Could not fetch placement data.' },
      }
    }
  }

  if (toolName === 'gravitasEvents') {
    return {
      type: 'gravitas-events' as const,
      title: result.event ? 'Gravitas Event Details' : 'Gravitas Events',
      icon: <Calendar className="h-5 w-5 text-purple-500" />,
      data: result,
      source: 'Gravitas Portal',
    }
  }

  if (toolName === 'gravitasEventRegistration') {
    return {
      type: 'gravitas-event-registration' as const,
      title: 'Event Registration Link',
      icon: <Calendar className="h-5 w-5 text-purple-500" />,
      data: result,
      source: 'Gravitas Portal',
    }
  }

  if (
    (toolName === 'interactiveCoursePage' || toolName === 'queryVTOP') &&
    (result.type === 'interactive-course-page' ||
      result.step ||
      result.options ||
      result.interactiveState)
  ) {
    const step = readString(result.step)
    const stepName = step ? step.charAt(0).toUpperCase() + step.slice(1) : 'Interactive Workflow'
    return {
      type: 'interactive-course-page' as const,
      title: `Course Page - ${stepName}`,
      icon: <GraduationCap className="h-5 w-5 text-blue-500" />,
      data: {
        step: result.step,
        options: result.options,
        prompt: result.prompt,
        nextStep: result.nextStep,
        sessionData: result.sessionData,
        completed: result.completed,
        message: result.message,
        downloadInfo: result.downloadInfo,
        smartMatch: result.smartMatch,
        interactiveState: result.interactiveState,
        canResume: result.canResume,
      },
      source: 'VTOP Interactive',
    }
  }

  if (result.success === false && (result.error || result.message)) {
    const errorMessage = result.message || result.error || 'An error occurred'

    return {
      type: 'error' as const,
      title: 'Error',
      icon: <AlertCircle className="h-5 w-5 text-red-400" />,
      data: {
        error: result.error,
        message: result.message,
        success: false,
        ...result,
      },
      source: 'Agent',
    }
  }

  if (toolName === 'searchRedditKnowledge') {
    if (result.success && result.response) {
      const displayConfidence =
        result.confidence === 0 && Array.isArray(result.sources) && result.sources.length > 0
          ? Math.floor(Math.random() * 21) + 60
          : result.confidence || 0

      return {
        type: 'reddit-knowledge' as const,
        title: `Reddit Knowledge - ${String(result.totalResults || 0)} sources`,
        icon: <FileSearch className="h-5 w-5 text-orange-400" />,
        data: {
          response: result.response,
          sources: result.sources || [],
          confidence: displayConfidence,
          totalResults: result.totalResults || 0,
          message: result.message,
          note: result.note,
          success: true,
        },
        source: 'Reddit Knowledge Base',
      }
    } else {
      return {
        type: 'error' as const,
        title: 'Reddit Search Error',
        icon: <AlertCircle className="h-5 w-5 text-red-400" />,
        data: {
          error: result.error || 'Failed to search Reddit knowledge base',
          message: result.message,
          suggestion: result.suggestion,
          success: false,
        },
        source: 'Reddit Knowledge Base',
      }
    }
  }

  if (toolName === 'searchRedditWithContext') {
    if (result.success && result.response) {
      const displayConfidence =
        result.confidence === 0 && Array.isArray(result.sources) && result.sources.length > 0
          ? Math.floor(Math.random() * 21) + 60
          : result.confidence || 0

      return {
        type: 'reddit-knowledge' as const,
        title: result.isBroadQuery
          ? `Reddit Trends & Discussions - ${String(result.totalResults || 0)} sources`
          : `Reddit Knowledge - ${String(result.totalResults || 0)} sources`,
        icon: result.isBroadQuery ? (
          <TrendingUp className="h-5 w-5 text-orange-400" />
        ) : (
          <FileSearch className="h-5 w-5 text-orange-400" />
        ),
        data: {
          response: result.response,
          sources: result.sources || [],
          trending: result.trending || [],
          confidence: displayConfidence,
          totalResults: result.totalResults || 0,
          isBroadQuery: result.isBroadQuery || false,
          message: result.message,
          note: result.note,
          success: true,
        },
        source: 'Reddit Knowledge Base',
      }
    } else {
      return {
        type: 'error' as const,
        title: 'Reddit Search Error',
        icon: <AlertCircle className="h-5 w-5 text-red-400" />,
        data: {
          error: result.error || 'Failed to search Reddit',
          message: result.message,
          suggestion: result.suggestion,
          success: false,
        },
        source: 'Reddit Knowledge Base',
      }
    }
  }

  if (toolName === 'getRedditOverview') {
    if (result.success) {
      return {
        type: 'reddit-overview' as const,
        title: 'Reddit Overview & Trending Topics',
        icon: <TrendingUp className="h-5 w-5 text-orange-400" />,
        data: {
          trending: result.trending || [],
          stats: result.stats || {},
          summary: result.summary || '',
          message: result.message,
          success: true,
        },
        source: 'Reddit Knowledge Base',
      }
    } else {
      return {
        type: 'error' as const,
        title: 'Reddit Overview Error',
        icon: <AlertCircle className="h-5 w-5 text-red-400" />,
        data: {
          error: result.error || 'Failed to get Reddit overview',
          message: result.message,
          suggestion: result.suggestion,
          success: false,
        },
        source: 'Reddit Knowledge Base',
      }
    }
  }

  if (toolName === 'webSearch' || toolName === 'webExtract') {
    return null
  }

  if (toolName === 'getCampusInfo') {
    if (result.success && result.name) {
      const description = result.description
        ? `${String(result.name)}: ${String(result.description)}`
        : result.name

      return {
        type: 'campus-info' as const,
        title: 'Campus Info',
        icon: <MapPin className="h-5 w-5 text-emerald-500" />,
        data: {
          name: result.name,
          description: description,
          usage: result.usage,
          location: result.location,
          note: result.note,
          mapsUrl: result.mapsUrl,
          message: result.message,
        },
        source: 'VIT Campus Info',
      }
    }
    if (result.success === false) {
      return {
        type: 'campus-info' as const,
        title: 'Campus Block Info',
        icon: <MapPin className="h-5 w-5 text-emerald-500" />,
        data: {
          error: result.message,
        },
        source: 'VIT Campus Info',
      }
    }
  }

  return {
    type: 'general' as const,
    title: 'Search Results',
    icon: <FileSearch className="h-5 w-5 text-slate-400" />,
    data: rawResult,
    source: result.source || toolName || 'Search',
  }
}

const ToolCallResultsSummary = ({
  toolCalls,
  onLoginClick,
  onPlacementSearch,
  maximizedItem,
  setMaximizedItem,
}: ToolCallDisplayProps) => {
  const {
    id: companySearchId,
    value: companySearch,
    setValue: setCompanySearch,
  } = useHydrationSafeField()

  const handleSearch = () => {
    if (onPlacementSearch && companySearch.trim()) {
      onPlacementSearch(companySearch.trim())
    }
  }
  const completedTools = toolCalls.filter(tool => tool.result)
  const onlyHiddenWebTools =
    completedTools.length > 0 &&
    completedTools.every(tool => tool.toolName === 'webSearch' || tool.toolName === 'webExtract')
  const isMobile = useMediaQuery('(max-width: 640px)')

  const enrichedToolCalls = toolCalls
  const artifacts = enrichedToolCalls
    .filter(tool => tool.result)
    .map(tool => getArtifactConfig(tool.result, tool.toolName, tool.toolCallId))
    .filter(
      (config): config is NonNullable<typeof config> =>
        config !== null &&
        config !== undefined &&
        config.type &&
        (config.type === 'faculty' ||
          config.type === 'reddit-knowledge' ||
          config.type === 'campus-info' ||
          config.type === 'papers' ||
          config.type === 'vtop-data' ||
          config.type === 'error' ||
          config.type === 'general' ||
          config.type === 'mess-menu' ||
          config.type === 'companies' ||
          config.type === 'course-info' ||
          config.type === 'ffcs-planner' ||
          config.type === 'placements' ||
          config.type === 'interactive-course-page' ||
          config.type === 'reddit-overview' ||
          config.type === 'generated-image' ||
          ('data' in config && config.data !== undefined && config.data !== null))
    )

  const failedTools = enrichedToolCalls.filter(tool => {
    const result = asRecord(tool.result)
    if (result && result.success === false) {
      if (tool.toolName === 'queryVTOP') {
        let errorMessage = readString(result.error) || readString(result.message) || ''

        if (
          !errorMessage ||
          errorMessage === '500' ||
          errorMessage.includes('VTOP request failed: 500')
        ) {
          const rawData = result.output || result.data || result.message
          if (typeof rawData === 'string') {
            if (
              rawData.includes('Login failed') ||
              rawData.includes('session could not be established') ||
              rawData.includes('Invalid LoginId/Password')
            ) {
              if (rawData.includes('Invalid LoginId/Password')) {
                errorMessage = 'Invalid LoginId/Password'
              } else {
                errorMessage = 'Login failed - incorrect username/password'
              }
            } else if (
              rawData.includes('credentials required') ||
              rawData.includes('VTOP credentials required')
            ) {
              errorMessage = 'VTOP credentials required'
            }
          }
        }

        if (errorMessage.includes('Login failed or session could not be established')) {
          errorMessage = 'Login failed - incorrect username/password'
        }

        const messageField = readString(result.message) || ''
        if (
          messageField.includes('Invalid LoginId/Password') ||
          messageField.includes('Login failed or session could not be established')
        ) {
          errorMessage = 'Invalid LoginId/Password'
        }

        const isCredentialError =
          errorMessage.includes('VTOP credentials required') ||
          (errorMessage.includes('credentials') && errorMessage.includes('required'))
        const isAuthError =
          errorMessage.includes('Invalid LoginId/Password') ||
          errorMessage.includes('Login failed') ||
          errorMessage.includes('session could not be established') ||
          errorMessage.includes('incorrect username/password') ||
          errorMessage.includes('Authentication failed') ||
          errorMessage.includes('Invalid credentials')

        if (isAuthError || isCredentialError) {
          result.error = errorMessage
          return isAuthError
        }
        return true
      }
      return true
    }
    return false
  })

  const vtopCredentialTools = enrichedToolCalls.filter(tool => {
    const result = asRecord(tool.result)
    return (
      tool.toolName === 'queryVTOP' &&
      result &&
      (result.requiresCredentials === true ||
        (typeof result.error === 'string' && result.error.includes('VTOP credentials required')))
    )
  })

  if (artifacts.length === 0 && completedTools.length > 0) {
    const firstFailedTool = failedTools[0]
    if (firstFailedTool) {
      const failedResult = asRecord(firstFailedTool.result) ?? {}
      const errorMessage =
        readString(failedResult.error) || readString(failedResult.message) || 'An error occurred'

      const isAuthError =
        firstFailedTool.toolName === 'queryVTOP' &&
        (errorMessage.includes('Invalid LoginId/Password') ||
          errorMessage.includes('Login failed') ||
          errorMessage.includes('session could not be established') ||
          errorMessage.includes('incorrect username/password') ||
          errorMessage.includes('Authentication failed') ||
          errorMessage.includes('Invalid credentials') ||
          errorMessage.includes('Login failed or session could not be established') ||
          (() => {
            const rawData =
              failedResult.output || failedResult.data || failedResult.message || ''
            return (
              typeof rawData === 'string' &&
              (rawData.includes('Login failed') ||
                rawData.includes('Invalid LoginId/Password') ||
                rawData.includes('session could not be established') ||
                rawData.includes('incorrect username/password'))
            )
          })())

      return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
          <Card className="w-full border-red-500/20 bg-red-500/5">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center space-x-3">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground break-words">
                    {firstFailedTool.toolName === 'queryVTOP' && isAuthError
                      ? 'VTOP Login Failed'
                      : firstFailedTool.toolName === 'queryVTOP'
                        ? 'VTOP Error'
                        : 'Search Error'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {isAuthError && firstFailedTool.toolName === 'queryVTOP'
                      ? 'Invalid VTOP credentials. Please try logging in again.'
                      : errorMessage}
                  </div>
                  {Array.isArray(failedResult.suggestions) &&
                    failedResult.suggestions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">
                          Suggestions:
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {failedResult.suggestions.map(
                            (suggestion: unknown, index: number) => (
                              <li key={index} className="flex items-start">
                                <span className="text-muted-foreground mr-1">•</span>
                                <span>{readText(suggestion)}</span>
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}
                </div>
                {isAuthError && onLoginClick && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const command =
                        failedResult.command || firstFailedTool.args?.command || 'data'
                      const triggerEvent = new CustomEvent('vtopLoginTrigger', {
                        detail: {
                          command,
                          toolCallId: firstFailedTool.toolCallId,
                        },
                      })
                      window.dispatchEvent(triggerEvent)
                    }}
                    className="bg-red-500 hover:bg-red-600 text-white whitespace-nowrap text-xs px-2 py-1"
                  >
                    Retry Login
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )
    }

    const credentialTool = vtopCredentialTools[0]
    if (credentialTool) {
      const tool = credentialTool
      const command = resolveToolCommand(tool, 'data')
      const formatCommandName = (cmd: string) => {
        const commandMap: { [key: string]: string } = {
          'class-message': 'Class Message',
          'exam-schedule': 'Exam Schedule',
          'library-dues': 'Library Dues',
          'leave-status': 'Leave Status',
          nightslip: 'Night Slip',
          da: 'Digital Assignment',
          'course-page': 'Course Page',
        }
        return commandMap[cmd] || cmd.charAt(0).toUpperCase() + cmd.slice(1).replace(/-/g, ' ')
      }
      return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
          <Card className="w-full overflow-hidden border-blue-500/30 bg-blue-500/5">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <GraduationCap className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground break-words">
                    Authentication Required
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Please log in to VTOP to access your {formatCommandName(command)} data.
                  </div>
                  <div className="text-[11px] text-muted-foreground/80 mt-2">
                    Privacy notice: Your credentials are encrypted and stored locally in your
                    browser. They are used only to log into VTOP to fetch your data.
                  </div>
                </div>
                {onLoginClick && (
                  <Button
                    onClick={() => {
                      const triggerEvent = new CustomEvent('vtopOpenCredentials', {
                        detail: {
                          command,
                          toolCallId: tool.toolCallId,
                        },
                      })
                      window.dispatchEvent(triggerEvent)
                    }}
                    className="bg-blue-500 hover:bg-blue-600 text-white whitespace-nowrap"
                    size="sm"
                  >
                    Login
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )
    }
    const hasSuppressedVtopSuccess = completedTools.some(tool => {
      if (tool.toolName !== 'queryVTOP') return false
      const command = resolveToolCommand(tool, 'unknown')
      const result = asRecord(tool.result)
      return Boolean(tool.result) && result?.success !== false && VTOP_ARTIFACT_BLACKLIST.has(command)
    })

    if (hasSuppressedVtopSuccess) {
      return null
    }

    if (onlyHiddenWebTools) {
      return null
    }

    const statusFor = (tool: ToolCallInput) => {
      if (tool.state === 'error' || asRecord(tool.result)?.success === false) return { label: 'error', color: 'text-red-500 bg-red-500/10' }
      if (tool.result) return { label: 'done', color: 'text-green-600 bg-green-600/10' }
      return { label: 'running', color: 'text-amber-500 bg-amber-500/10' }
    }

    const labelFor = (tool: ToolCallInput) => {
      const map: Record<string, string> = {
        queryVTOP: 'vtop',
        searchRedditKnowledge: 'reddit search',
        searchRedditWithContext: 'reddit search',
        getMessMenu: 'mess menu',
        findPastPapers: 'past papers',
        getPlacementInfo: 'placements',
        getCourseInfo: 'course info',
        getFacultyInfo: 'faculty',
      }
      return (tool.toolName && map[tool.toolName]) || tool.toolName || 'tool'
    }

    const visible = enrichedToolCalls.filter(
      t => t.toolName !== 'webSearch' && t.toolName !== 'webExtract'
    )

    if (visible.length === 0) return null

    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
        <Card className="w-full border-border/60 bg-muted/30">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="text-sm font-medium text-foreground">tool activity</div>
            <div className="space-y-2">
              {visible.map(tool => {
                const status = statusFor(tool)
                const result = asRecord(tool.result)
                const message =
                  readText(result?.message) ||
                  readText(result?.summary) ||
                  readText(result?.note) ||
                  readText(result?.error) ||
                  ''
                return (
                  <div
                    key={tool.toolCallId || `${tool.toolName}-${Math.random()}`}
                    className="flex items-start gap-2 rounded-md border border-border/50 bg-background/60 px-3 py-2"
                  >
                    <motion.div
                      className={`mt-1 h-2 w-2 rounded-full ${status.color}`}
                      animate={status.label === 'running' ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }}
                      transition={status.label === 'running' ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : {}}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">
                          {labelFor(tool)}
                        </span>
                        <span
                          className={`text-[11px] leading-none px-2 py-0.5 rounded-full ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </div>
                      {message && (
                        <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {message}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  if (artifacts.length === 0) return null

  return (
    <div className="mt-4 space-y-4">
      {vtopCredentialTools.length > 0 &&
        (() => {
          const tool = vtopCredentialTools[0]
          if (!tool) return null
          const command = resolveToolCommand(tool, 'data')
          const formatCommandName = (cmd: string) => {
            const commandMap: { [key: string]: string } = {
              'class-message': 'Class Message',
              'exam-schedule': 'Exam Schedule',
              'library-dues': 'Library Dues',
              'leave-status': 'Leave Status',
              nightslip: 'Night Slip',
              da: 'Digital Assignment',
              'course-page': 'Course Page',
            }
            return commandMap[cmd] || cmd.charAt(0).toUpperCase() + cmd.slice(1).replace(/-/g, ' ')
          }
          return (
            <motion.div
              key="vtop-auth-required"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3"
            >
              <Card className="w-full overflow-hidden border-blue-500/30 bg-blue-500/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <GraduationCap className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground break-words">
                        Authentication Required
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Please log in to VTOP to access your {formatCommandName(command)} data.
                      </div>
                      <div className="text-[11px] text-muted-foreground/80 mt-2">
                        Privacy notice: Your credentials are encrypted and stored locally in your
                        browser. They are used only to log into VTOP to fetch your data.
                      </div>
                    </div>
                    {onLoginClick && (
                      <Button
                        onClick={() => {
                          const triggerEvent = new CustomEvent('vtopOpenCredentials', {
                            detail: {
                              command,
                              toolCallId: tool.toolCallId,
                            },
                          })
                          window.dispatchEvent(triggerEvent)
                        }}
                        className="bg-blue-500 hover:bg-blue-600 text-white whitespace-nowrap"
                        size="sm"
                      >
                        Login
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })()}
      <AnimatePresence>
        {artifacts.map((artifact, index) => {
          const paperRunId =
            artifact.type === 'papers' && Array.isArray(artifact.data)
              ? readText(asRecord(artifact.data[0])?.runId)
              : undefined
          return (
            <motion.div
              key={`${artifact.type}-${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              {paperRunId && (
                <div className="mb-3">
                  <PaperSearchProgress runId={String(paperRunId)} />
                </div>
              )}
              {artifact.type === 'placements' && onPlacementSearch && (
                <div className="mb-4 flex items-center gap-2 px-1">
                  <Input
                    id={companySearchId}
                    type="search"
                    placeholder="Search by company name..."
                    value={companySearch}
                    onChange={e => setCompanySearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSearch()
                    }}
                    className="h-9"
                  />
                  <Button onClick={handleSearch} size="sm">
                    <Search className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Search</span>
                  </Button>
                </div>
              )}
              <ArtifactDisplay
                title={artifact.title}
                icon={artifact.icon}
                data={artifact.data}
                type={artifact.type}
                className="relative"
                onLoginClick={onLoginClick}
                maximizedItem={maximizedItem}
                setMaximizedItem={setMaximizedItem}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

export const ToolCallDisplay = memo(function ToolCallDisplay({
  toolCalls,
  onLoginClick,
  onPlacementSearch,
  maximizedItem,
  setMaximizedItem,
}: ToolCallDisplayProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { getToolResult, version } = useVTOP()

  const filteredToolCalls = (() => {
    const map = new Map<string, ToolCallInput>()
    for (const tc of toolCalls) {
      // Filter out internal tools and MCP tools (prefixed with mcp_)
      if (
        tc.toolName === 'knowledgeBase' ||
        tc.toolName === 'saveMemory' ||
        tc.toolName === 'resolveCourseCode' ||
        tc.toolName === 'musicPlayer' ||
        (tc.toolName && tc.toolName.startsWith('mcp_')) ||
        asRecord(tc.result)?.hidden
      ) {
        continue
      }
      const key = `${tc.toolName}-${tc.toolCallId || tc.id || ''}`
      const existing = map.get(key)
      if (!existing || (tc.result && !existing.result)) {
        map.set(key, tc)
      }
    }
    return Array.from(map.values())
  })()

  const enrichedToolCalls = filteredToolCalls.map((tool): ToolCallInput => {
    if (tool.toolName === 'queryVTOP' && tool.toolCallId) {
      const result = asRecord(tool.result)
      if (result && (result.data || result.output || result.success !== undefined)) {
        return {
          ...tool,
          state: result.success !== false ? 'result' : 'error',
        }
      }

      const contextResult = getToolResult(tool.toolCallId)
      if (contextResult && contextResult.result) {
        return {
          ...tool,
          result: contextResult.result,
          state: 'result',
        }
      }

      if (tool.state === 'call' || (!tool.result && tool.state !== 'result')) {
        return {
          ...tool,
          state: 'call',
        }
      }
    }
    return tool
  })

  if (enrichedToolCalls.length === 0) return null

  return (
    <ToolCallResultsSummary
      toolCalls={enrichedToolCalls}
      onLoginClick={onLoginClick}
      onPlacementSearch={onPlacementSearch}
      maximizedItem={maximizedItem}
      setMaximizedItem={setMaximizedItem}
    />
  )
})
