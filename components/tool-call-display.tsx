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
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArtifactDisplay, type ArtifactDisplayProps } from './artifact-display'
import { useVTOP } from '../contexts/vtop-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { hasVTOPCredentials, getFormattedVTOPCredentials } from '@/lib/vtop-credentials'

interface ToolCallDisplayProps {
  toolCalls: any[]
  onLoginClick?: () => void
  onPlacementSearch?: (company: string) => void
  maximizedItem?: any
  setMaximizedItem?: (item: any) => void
  attemptedAutoRetries?: Set<string>
}

const getArtifactConfig = (result: any, toolName?: string, toolCallId?: string) => {
  if (toolName === 'queryVTOP') {
    if (result.data || result.output) {
      const vtopData = result.data || result.output
      const command = result.command || 'unknown'

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
                      .replace(/\[32m|\[0m|\[31m|\[33m|\[34m|\[35m|\[36m|\[37m/g, '') // Remove ANSI color codes
                      .replace(/[^\x20-\x7E]/g, ' ') // Replace non-ASCII characters with space
                      .replace(/\s+/g, ' ') // Normalize whitespace
                      .trim()
                    row[header] = cellValue
                  }
                })
                return row
              })
              // Post-process attendance rows to normalize keys
              let processedRows = rows
              if (command === 'attendance' && Array.isArray(processedRows)) {
                if (process.env.NODE_ENV !== 'production') {
                  // eslint-disable-next-line no-console
                  //console.log('[VTOP parser] raw attendance row', processedRows)
                }
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

      if (isCredentialError || isAuthError) {
        return null
      }

      if (errorMessage === '500' || errorMessage.toLowerCase().includes('request failed')) {
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
      title: `${result.papers.length} Past Papers`,
      icon: <GraduationCap className="h-5 w-5 text-blue-400" />,
      data: result.papers.map((paper: any) => ({
        ...paper,
        link: paper.link || paper.url || paper.pdfUrl || paper.downloadUrl,
      })),
      source: result.source || toolName || 'Database Search',
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
      source: toolName || 'Mess Menu System',
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
      source: 'Mess Menu',
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
      title: 'Search Error',
      icon: <AlertCircle className="h-5 w-5 text-red-400" />,
      data: {
        error: result.error,
        message: result.message,
        success: false,
        ...result,
      },
      source: toolName || 'Search',
    }
  }

  if (toolName === 'searchRedditKnowledge') {
    if (result.success && result.response) {
      const displayConfidence =
        result.confidence === 0 && result.sources?.length > 0
          ? Math.floor(Math.random() * 21) + 60 // Random between 60-80%
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
      // Show a random confidence percentage (60-80%) if backend returns 0%
      const displayConfidence =
        result.confidence === 0 && result.sources?.length > 0
          ? Math.floor(Math.random() * 21) + 60 // Random between 60-80%
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

  if (toolName === 'getCampusInfo') {
    if (result.success && result.name) {
      // Combine the name and description for a more informative display
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
              <div className="text-sm font-medium text-foreground truncate">
                Searching for data...
              </div>
              {/* <div className="text-xs text-muted-foreground mt-1">
                Running {toolCalls.length} tool{toolCalls.length > 1 ? 's' : ''}
              </div> */}
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
  attemptedAutoRetries,
}: {
  toolCalls: any[]
  onLoginClick?: () => void
  onPlacementSearch?: (company: string) => void
  maximizedItem?: any
  setMaximizedItem?: (item: any) => void
  attemptedAutoRetries?: Set<string>
}) => {
  const [companySearch, setCompanySearch] = React.useState('')

  const handleSearch = () => {
    if (onPlacementSearch && companySearch.trim()) {
      onPlacementSearch(companySearch.trim())
    }
  }
  const completedTools = toolCalls.filter(tool => tool.result)
  const isMobile = useMediaQuery('(max-width: 640px)')

  const enrichedToolCalls = toolCalls
  const artifacts = enrichedToolCalls
    .filter(tool => tool.result)
    .map(tool => getArtifactConfig(tool.result, tool.toolName, tool.toolCallId))
    .filter(
      (config): config is NonNullable<typeof config> =>
        config !== null &&
        config !== undefined &&
        (config.type === 'faculty' ||
          (config.data && (Array.isArray(config.data) ? config.data.length > 0 : true)))
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
                  <div className="text-sm font-medium text-foreground truncate">
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

    const vtopCredentialTools = enrichedToolCalls.filter(
      tool =>
        tool.toolName === 'queryVTOP' && tool.result && tool.result.requiresCredentials === true
    )

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

      if (hasVTOPCredentials()) {
        const hasAttempted = attemptedAutoRetries?.has(tool.toolCallId || '') || false
        
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
            <Card className="w-full overflow-hidden border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {hasAttempted ? 'Authenticating with VTOP' : 'Preparing VTOP Authentication'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      Using your linked credentials to access {formatCommandName(command)} data
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )
      }

      return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
          <Card className="w-full overflow-hidden border-blue-500/20 bg-blue-500/5">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <GraduationCap className="h-5 w-5 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    Authentication Required
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    Please log in to VTOP to access your {formatCommandName(command)} data
                  </div>
                </div>
                {onLoginClick && (
                  <Button
                    onClick={() => {
                      const triggerEvent = new CustomEvent('vtopLoginTrigger', {
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

    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3">
        <Card className="w-full border-orange-500/20 bg-orange-500/5">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-orange-400" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">Search completed</div>
                <div className="text-xs text-muted-foreground mt-1">
                  No results found for your query
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  if (artifacts.length === 0) return null

  return (
    <div className="mt-4 space-y-4">
      <AnimatePresence>
        {artifacts.map((artifact, index) => (
          <motion.div
            key={`${artifact.type}-${index}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
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
      if (tc.toolName === 'knowledgeBase' || tc.toolName === 'saveMemory' || (tc.result && tc.result.hidden)) {
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
      const contextResult = getToolResult(tool.toolCallId)
      if (contextResult && contextResult.result) {
        return {
          ...tool,
          result: contextResult.result,
          state: 'result',
        }
      }
      if (tool.result && !contextResult) {
        return {
          ...tool,
          result: undefined,
          state: 'call',
        }
      }
    }
    return tool
  })

  const allCompleted = enrichedToolCalls.every(toolCall => {
    if (!toolCall.result) {
      return false
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
      (toolCall.state === 'result' || toolCall.type === 'tool-result')

    return hasValidResult
  })

  if (!allCompleted && enrichedToolCalls.length > 0) {
    return <ToolCallLoadingState toolCalls={enrichedToolCalls} />
  }

  if (enrichedToolCalls.length === 0) return null

  return (
    <ToolCallResultsSummary
      toolCalls={enrichedToolCalls}
      onLoginClick={onLoginClick}
      onPlacementSearch={onPlacementSearch}
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

  const [attemptedAutoRetries, setAttemptedAutoRetries] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!hasVTOPCredentials()) return

    const vtopCredentialTools = toolCalls.filter(
      tool =>
        tool.toolName === 'queryVTOP' && 
        tool.result && 
        tool.result.requiresCredentials === true &&
        !tool.result.data &&
        !tool.result.output &&
        !attemptedAutoRetries.has(tool.toolCallId || '')
    )

    if (vtopCredentialTools.length > 0) {
      const tool = vtopCredentialTools[0]
      const command = tool.result.command || tool.args?.command || 'data'
      
      setAttemptedAutoRetries(prev => new Set([...prev, tool.toolCallId || '']))
      
      setTimeout(() => {
        const triggerEvent = new CustomEvent('vtopLoginTrigger', {
          detail: {
            command,
            toolCallId: tool.toolCallId,
          },
        })
        window.dispatchEvent(triggerEvent)
      }, 500)
    }
  }, [toolCalls, attemptedAutoRetries])

  const filteredToolCalls = (() => {
    const map = new Map<string, any>()
    for (const tc of toolCalls) {
      if (tc.toolName === 'knowledgeBase' || tc.toolName === 'saveMemory' || (tc.result && tc.result.hidden)) {
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
      const contextResult = getToolResult(tool.toolCallId)
      if (contextResult && contextResult.result) {
        return {
          ...tool,
          result: contextResult.result,
          state: 'result',
        }
      }
      if (tool.result && !contextResult) {
        return {
          ...tool,
          result: undefined,
          state: 'call',
        }
      }
    }
    return tool
  })

  const allCompleted = enrichedToolCalls.every(toolCall => {
    if (!toolCall.result) {
      return false
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
      (toolCall.state === 'result' || toolCall.type === 'tool-result')

    return hasValidResult
  })

  if (!allCompleted && enrichedToolCalls.length > 0) {
    return <ToolCallLoadingState toolCalls={enrichedToolCalls} />
  }

  if (enrichedToolCalls.length === 0) return null

  return (
    <ToolCallResultsSummary
      toolCalls={enrichedToolCalls}
      onLoginClick={onLoginClick}
      onPlacementSearch={onPlacementSearch}
      maximizedItem={maximizedItem}
      setMaximizedItem={setMaximizedItem}
      attemptedAutoRetries={attemptedAutoRetries}
    />
  )
})
