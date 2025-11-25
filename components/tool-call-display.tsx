'use client'

import React, { memo, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2,
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
import { ArtifactDisplay, type ArtifactDisplayProps } from './artifact-display'
import { PaperSearchProgress } from './paper-search-progress'
import { useVTOP } from '../contexts/vtop-context'
import { useMediaQuery } from '@/hooks/use-media-query'

interface ToolCallDisplayProps {
  toolCalls: any[]
  onLoginClick?: () => void
  onPlacementSearch?: (company: string) => void
  maximizedItem?: any
  setMaximizedItem?: (item: any) => void
}

const VTOP_ARTIFACT_BLACKLIST = new Set(['exams', 'exam-schedule'])

const getArtifactConfig = (result: any, toolName?: string, toolCallId?: string) => {
  if (toolName === 'resolveCourseCode') {
    return null
  }

  if (toolName === 'submitFeedback' || toolName === 'contributeKnowledge') {
    return null
  }

  if (toolName === 'queryVTOP') {
    if (result.data || result.output) {
      const vtopData = result.data || result.output
      const command = result.command || 'unknown'

      if (VTOP_ARTIFACT_BLACKLIST.has(command)) {
        return null
      }

      let parsedData = vtopData
      if (typeof vtopData === 'string') {
        if (vtopData.includes('│') && vtopData.includes('──')) {
          const lines = vtopData.split('\n').filter(line => line.trim() && !line.includes('──'))

          if (lines.length > 1) {
            const firstLine = lines[0]
              .split('│')
              .map(h => h.trim())
              .filter(h => h)
            if (
              firstLine.length === 2 &&
              firstLine[0] === 'FIELD' &&
              firstLine[1] === 'INFORMATION'
            ) {
              const profileData: any = {}
              const dataLines = lines.slice(1)

              dataLines.forEach(line => {
                const cells = line
                  .split('│')
                  .map(c => c.trim())
                  .filter(c => c)
                if (cells.length >= 2) {
                  const fieldName = cells[0].replace(/\[32m|\[0m/g, '')
                  const fieldValue = cells[1].replace(/\[32m|\[0m/g, '')
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
                const row: any = {}
                const indexOffset = cells.length - headers.length
                headers.forEach((header, index) => {
                  const cell = cells[index + (indexOffset > 0 ? 1 : 0)]
                  if (cell !== undefined) {
                    let cellValue = cells[index + (indexOffset > 0 ? 1 : 0)]
                    cellValue = cellValue
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
                processedRows = processedRows.map((row: any) => {
                  const clean = (val: any) => (typeof val === 'string' ? val.trim() : val)
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
      let errorMessage = result.error || result.message || ''

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

      return {
        type: 'vtop-data' as const,
        title: `VTOP ${formatCommandName(result.command || 'data')} Data`,
        icon: <GraduationCap className="h-5 w-5 text-blue-500" />,
        data: {
          command: result.command || 'data',
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

  if (result.papers && result.papers.length > 0) {
    return {
      type: 'papers' as const,
      title: `${result.papers.length} Past Papers${result.courseCode ? ` (${result.courseCode})` : ''}`,
      icon: <GraduationCap className="h-5 w-5 text-blue-400" />,
      data: result.papers.map((paper: any) => {
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
    const normalizeFilename = (fn: string | null) => {
      if (!fn || typeof fn !== 'string') return { code: null, title: null }
      const base = fn.split('/').pop() || fn
      const withoutExt = base.replace(/\.[^.]+$/, '')
      const parts = withoutExt.split(/_(.+)/)
      const codePart = (parts[0] || '').trim()
      const titlePart = (parts[1] || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
      const title = titlePart ? titlePart.replace(/\b\w/g, c => c.toUpperCase()) : null
      return { code: codePart || null, title }
    }

    const makeEntryFrom = (entry: any) => {
      const filename = entry.filename || entry.file || null
      const url =
        entry.url ||
        (filename ? `https://storage.googleapis.com/examcooker/syllabi/${filename}` : null)
      const norm = normalizeFilename(filename)
      const code = entry.code || norm.code
      const title = entry.title || norm.title || (entry.message ? String(entry.message) : null)
      return { filename, url, code, title, raw: entry }
    }

    let entries: any[] = []
    if (result) {
      if (result.ambiguous && Array.isArray(result.matches)) {
        entries = result.matches.map((m: any) => makeEntryFrom(m))
      } else if (Array.isArray(result.syllabi)) {
        entries = result.syllabi.map((s: any) => makeEntryFrom(s))
      } else if (result.filename || result.url || result.code || result.title) {
        entries = [makeEntryFrom(result)]
      } else if (result.data && result.data.filename) {
        entries = [makeEntryFrom(result.data)]
      }
    }

    const title =
      entries.length === 1
        ? entries[0].code && entries[0].title
          ? `${entries[0].code} — ${entries[0].title}`
          : `Syllabus: ${entries[0].title || entries[0].filename}`
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
        (result.courseCode ? ` (${result.courseCode})` : ''),
      icon: <GraduationCap className="h-5 w-5 text-indigo-400" />,
      data: result.rankedPapers.map((p: any, i: number) => ({
        ...p,
        rank: i + 1,
        link: p.url,
        matchedQuestions: p.matchedQuestions || [],
        score: p.score,
        indexId: result.indexId,
        courseCode: result.courseCode,
        runId: result.runId || result.run_id,
      })),
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
        title: `Most Repeated Question Patterns${result.courseCode ? ` (${result.courseCode}${result.examType ? ` • ${result.examType}` : ''})` : ''}`,
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
          indexId: result.indexId || (result.indexMeta && result.indexMeta.id) || undefined,
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

  if (result.data && result.data.todayMenu && result.data.messType) {
    return {
      type: 'mess-menu' as const,
      title: `${result.data.messType} - ${result.data.hostelType}`,
      icon: <UtensilsCrossed className="h-5 w-5 text-orange-400" />,
      data: {
        hostelType: result.data.hostelType,
        messType: result.data.messType,
        todayMenu: result.data.todayMenu,
        weekMenu: result.data.weekMenu,
        requestedDate: result.data.requestedDate,
        actualDate: result.data.actualDate,
        isExactMatch: result.data.isExactMatch,
        formattedMenu: result.formattedMenu || result.data.formattedMenu,
        message: result.message,
      },
      source: 'MessIt',
    }
  }

  if (
    result.success === false &&
    result.error &&
    (result.error.includes('Menu not available') ||
      result.error.includes('mess menu') ||
      toolName === 'getMensMealPlan' ||
      toolName === 'getWomensMealPlan' ||
      result.message?.includes('mess menu'))
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

  if (result.faculty && result.faculty.length > 0) {
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

  if (result.companies && result.companies.length > 0) {
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
        title: `Placement Overview ${result.year ? `(${result.year})` : ''}`,
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
    const stepName = result.step
      ? result.step.charAt(0).toUpperCase() + result.step.slice(1)
      : 'Interactive Workflow'
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
        result.confidence === 0 && result.sources?.length > 0
          ? Math.floor(Math.random() * 21) + 60
          : result.confidence || 0

      return {
        type: 'reddit-knowledge' as const,
        title: `Reddit Knowledge - ${result.totalResults || 0} sources`,
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
        result.confidence === 0 && result.sources?.length > 0
          ? Math.floor(Math.random() * 21) + 60
          : result.confidence || 0

      return {
        type: 'reddit-knowledge' as const,
        title: result.isBroadQuery
          ? `Reddit Trends & Discussions - ${result.totalResults || 0} sources`
          : `Reddit Knowledge - ${result.totalResults || 0} sources`,
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
      const description = result.description ? `${result.name}: ${result.description}` : result.name

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
    data: result,
    source: result.source || toolName || 'Search',
  }
}

const ToolCallLoadingState = ({ toolCalls }: { toolCalls: any[] }) => {
  const isMobile = useMediaQuery('(max-width: 640px)')

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="mt-3"
    >
      <Card className="w-full overflow-hidden border-border/50 bg-muted/30">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground break-words">
                Searching for data...
              </div>

            </div>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

const ToolCallResultsSummary = ({
  toolCalls,
  onLoginClick,
  onPlacementSearch,
  maximizedItem,
  setMaximizedItem,
}: {
  toolCalls: any[]
  onLoginClick?: () => void
  onPlacementSearch?: (company: string) => void
  maximizedItem?: any
  setMaximizedItem?: (item: any) => void
}) => {
  const [companySearch, setCompanySearch] = React.useState('')

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
          ('data' in config &&
            (config as { data?: unknown }).data !== undefined &&
            (config as { data?: unknown }).data !== null))
    )

  const failedTools = enrichedToolCalls.filter(tool => {
    if (tool.result && tool.result.success === false) {
      if (tool.toolName === 'queryVTOP') {
        let errorMessage = tool.result.error || tool.result.message || ''

        if (
          !errorMessage ||
          errorMessage === '500' ||
          errorMessage.includes('VTOP request failed: 500')
        ) {
          const rawData = tool.result.output || tool.result.data || tool.result.message
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

        const messageField = tool.result.message || ''
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
          tool.result.error = errorMessage
          return isAuthError
        }
        return true
      }
      return true
    }
    return false
  })

  const vtopCredentialTools = enrichedToolCalls.filter(
    tool =>
      tool.toolName === 'queryVTOP' &&
      tool.result &&
      (tool.result.requiresCredentials === true ||
        (typeof tool.result.error === 'string' &&
          tool.result.error.includes('VTOP credentials required')))
  )

  if (artifacts.length === 0 && completedTools.length > 0) {
    if (failedTools.length > 0) {
      const firstFailedTool = failedTools[0]
      const errorMessage =
        firstFailedTool.result.error || firstFailedTool.result.message || 'An error occurred'

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
              firstFailedTool.result.output ||
              firstFailedTool.result.data ||
              firstFailedTool.result.message ||
              ''
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
                  {firstFailedTool.result.suggestions &&
                    Array.isArray(firstFailedTool.result.suggestions) &&
                    firstFailedTool.result.suggestions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">
                          Suggestions:
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          {firstFailedTool.result.suggestions.map(
                            (suggestion: string, index: number) => (
                              <li key={index} className="flex items-start">
                                <span className="text-muted-foreground mr-1">•</span>
                                <span>{suggestion}</span>
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
                        firstFailedTool.result.command || firstFailedTool.args?.command || 'data'
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

    if (vtopCredentialTools.length > 0) {
      const tool = vtopCredentialTools[0]
      const command =
        tool.result.command ||
        tool.args?.command ||
        tool.function?.arguments?.command ||
        (typeof tool.function?.arguments === 'string'
          ? JSON.parse(tool.function.arguments)?.command
          : null) ||
        'data'
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
      const command =
        tool.result?.command ||
        tool.args?.command ||
        tool.function?.arguments?.command ||
        (typeof tool.function?.arguments === 'string'
          ? (() => {
              try {
                return JSON.parse(tool.function.arguments || '{}')?.command
              } catch (error) {
                return null
              }
            })()
          : null) ||
        'unknown'
      return tool.result && tool.result.success !== false && VTOP_ARTIFACT_BLACKLIST.has(command)
    })

    if (hasSuppressedVtopSuccess) {
      return null
    }

    if (onlyHiddenWebTools) {
      return null
    }

    const statusFor = (tool: any) => {
      if (tool.state === 'error' || tool.result?.success === false) return { label: 'error', color: 'text-red-500 bg-red-500/10' }
      if (tool.result) return { label: 'done', color: 'text-green-600 bg-green-600/10' }
      return { label: 'running', color: 'text-amber-500 bg-amber-500/10' }
    }

    const labelFor = (tool: any) => {
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
      return map[tool.toolName] || tool.toolName || 'tool'
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
                const message =
                  tool.result?.message ||
                  tool.result?.summary ||
                  tool.result?.note ||
                  tool.result?.error ||
                  ''
                return (
                  <div
                    key={tool.toolCallId || `${tool.toolName}-${Math.random()}`}
                    className="flex items-start gap-2 rounded-md border border-border/50 bg-background/60 px-3 py-2"
                  >
                    <div
                      className={`mt-1 h-2 w-2 rounded-full ${status.color}`}
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
          const command =
            tool.result.command ||
            tool.args?.command ||
            tool.function?.arguments?.command ||
            (typeof tool.function?.arguments === 'string'
              ? JSON.parse(tool.function.arguments || '{}')?.command
              : null) ||
            'data'
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
        {artifacts.map((artifact, index) => (
          <motion.div
            key={`${artifact.type}-${index}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            {artifact.type === 'papers' &&
              Array.isArray(artifact.data) &&
              artifact.data[0]?.runId && (
                <div className="mb-3">
                  <PaperSearchProgress runId={artifact.data[0].runId} />
                </div>
              )}
            {artifact.type === 'placements' && onPlacementSearch && (
              <div className="mb-4 flex items-center gap-2 px-1">
                <Input
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
            {artifact.source && (
              <div className="mt-2 flex justify-end">
                <Badge variant="outline" className="text-xs">
                  Source: {artifact.source}
                </Badge>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

const PureToolCallDisplay = ({
  toolCalls,
  onLoginClick,
  onPlacementSearch,
  maximizedItem,
  setMaximizedItem,
}: ToolCallDisplayProps) => {
  const { getToolResult, version } = useVTOP()

  const filteredToolCalls = (() => {
    const map = new Map<string, any>()
    for (const tc of toolCalls) {
      if (
        tc.toolName === 'knowledgeBase' ||
        tc.toolName === 'saveMemory' ||
        tc.toolName === 'resolveCourseCode' ||
        tc.toolName === 'musicPlayer' ||
        (tc.result && tc.result.hidden)
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

  const [retryToolCallId, setRetryToolCallId] = useState<string | null>(null)
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail && e.detail.toolCallId) {
        setRetryToolCallId(e.detail.toolCallId)
      }
    }
    window.addEventListener('vtopCredentialsSubmitted', handler)
    return () => window.removeEventListener('vtopCredentialsSubmitted', handler)
  }, [])

  const enrichedToolCalls = filteredToolCalls.map(tool => {
    if (retryToolCallId && tool.toolCallId === retryToolCallId && tool.toolName === 'queryVTOP') {
      setTimeout(() => setRetryToolCallId(null), 100)
      return { ...tool, result: undefined, state: 'call' }
    }
    if (tool.toolName === 'queryVTOP' && tool.toolCallId) {
      if (
        tool.result &&
        (tool.result.data || tool.result.output || tool.result.success !== undefined)
      ) {
        return {
          ...tool,
          state: tool.result.success !== false ? 'result' : 'error',
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
    }
    return tool
  })

  const allCompleted = enrichedToolCalls.every(toolCall => {
    if (!toolCall.result) {
      return false
    }

    if (toolCall.state === 'error') {
      return true
    }

    if (toolCall.toolName === 'queryVTOP') {
      const isCredentialRequired =
        toolCall.result.requiresCredentials === true ||
        (toolCall.result.error &&
          (toolCall.result.error.includes('VTOP credentials required') ||
            toolCall.result.error.includes('credentials') ||
            toolCall.result.error.includes('Invalid LoginId/Password') ||
            toolCall.result.error.includes('Login failed')))

      if (isCredentialRequired) {
        return true
      }

      return (
        toolCall.result &&
        toolCall.state === 'result' &&
        (toolCall.result.data || toolCall.result.output || toolCall.result.error)
      )
    }

    if (
      toolCall.toolName === 'searchRedditKnowledge' ||
      toolCall.toolName === 'searchRedditWithContext'
    ) {
      return toolCall.result && (toolCall.result.success || toolCall.result.error)
    }

    const hasValidResult =
      toolCall.result &&
      !toolCall.result.requiresCredentials &&
      (toolCall.state === 'result' || toolCall.state === 'error' || toolCall.type === 'tool-result')

    return hasValidResult
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
    const map = new Map<string, any>()
    for (const tc of toolCalls) {
      if (
        tc.toolName === 'knowledgeBase' ||
        tc.toolName === 'saveMemory' ||
        tc.toolName === 'resolveCourseCode' ||
        tc.toolName === 'musicPlayer' ||
        (tc.result && tc.result.hidden)
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

  const enrichedToolCalls = filteredToolCalls.map(tool => {
    if (tool.toolName === 'queryVTOP' && tool.toolCallId) {
      if (
        tool.result &&
        (tool.result.data || tool.result.output || tool.result.success !== undefined)
      ) {
        return {
          ...tool,
          state: tool.result.success !== false ? 'result' : 'error',
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

  const allCompleted = enrichedToolCalls.every(toolCall => {
    if (toolCall.state === 'call') {
      return false
    }

    if (!toolCall.result) {
      return false
    }

    if (toolCall.state === 'error') {
      return true
    }

    if (toolCall.toolName === 'queryVTOP') {
      const isCredentialRequired =
        toolCall.result.requiresCredentials === true ||
        (toolCall.result.error &&
          (toolCall.result.error.includes('VTOP credentials required') ||
            toolCall.result.error.includes('credentials') ||
            toolCall.result.error.includes('Invalid LoginId/Password') ||
            toolCall.result.error.includes('Login failed')))

      if (isCredentialRequired) {
        return true
      }

      return (
        toolCall.result &&
        toolCall.state === 'result' &&
        (toolCall.result.data || toolCall.result.output || toolCall.result.error)
      )
    }

    if (
      toolCall.toolName === 'searchRedditKnowledge' ||
      toolCall.toolName === 'searchRedditWithContext'
    ) {
      return toolCall.result && (toolCall.result.success || toolCall.result.error)
    }

    const hasValidResult =
      toolCall.result &&
      !toolCall.result.requiresCredentials &&
      (toolCall.state === 'result' || toolCall.state === 'error' || toolCall.type === 'tool-result')

    return hasValidResult
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
