import { tool } from 'ai'
import * as z from 'zod'

import { hasVTOPCredentials, getFormattedVTOPCredentials } from '@/lib/server-vtop-credentials'
import type {
  JsonValue,
  VtopCommandFlags,
  VtopInteractiveRequestBody,
  VtopRequestBody,
} from '@/types/tools'

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
)

const vtopErrorResponseSchema = z
  .object({
    error: z.string().optional(),
  })
  .catchall(jsonValueSchema)

const vtopProxyResponseSchema = z.object({
  success: z.boolean().optional(),
  data: jsonValueSchema.optional(),
  output: jsonValueSchema.optional(),
  structured_data: jsonValueSchema.optional(),
  message: z.string().optional(),
  raw: z.boolean().optional(),
  meta: jsonValueSchema.optional(),
  error: z.string().optional(),
})

const vtopInteractiveResponseSchema = vtopProxyResponseSchema.extend({
  options: jsonValueSchema.optional(),
  prompt: z.string().optional(),
  nextStep: z.string().optional(),
  sessionData: jsonValueSchema.optional(),
  completed: z.boolean().optional(),
  downloadInfo: jsonValueSchema.optional(),
  smartMatch: jsonValueSchema.optional(),
})

function extractMaterialSelection(userContent: string): string | null {
  if (
    userContent.includes('all') ||
    userContent.includes('everything') ||
    userContent.includes('bulk download') ||
    userContent.includes('download all')
  ) {
    return 'all'
  }
  const numberPattern = userContent.match(/(\d+[-,\s]*\d*)/g)
  if (numberPattern) return numberPattern.join(',')
  if (userContent.includes('first') && userContent.match(/\d+/)) {
    const num = userContent.match(/\d+/)?.[0]
    if (num) return `1-${num}`
  }
  return null
}

function extractOptionsFromContent(content: string): any[] | null {
  if (!content || typeof content !== 'string') return null
  const lines = content.split('\n')
  const options = []
  for (const line of lines) {
    const match = line.match(/^\s*(\d+)\s*[│|]\s*(.+)/)
    if (match) {
      const [, number, description] = match
      options.push({ number: parseInt(number), description: description.trim() })
    }
  }
  return options.length > 0 ? options : null
}

async function handleIntelligentCoursePage(params: {
  username: string
  password: string
  semesterQuery?: string
  courseQuery?: string
  facultyQuery?: string
  materialQuery?: string
  interactiveStep?: string
  semester?: number
  course?: number
  faculty?: number
  fuzzyIndex?: number
  messages?: any[]
}) {
  const {
    username,
    password,
    semesterQuery,
    courseQuery,
    facultyQuery,
    materialQuery,
    interactiveStep,
    semester,
    course,
    faculty,
    fuzzyIndex,
    messages,
  } = params

  let contextualSemesterQuery = semesterQuery
  let contextualCourseQuery = courseQuery
  let contextualFacultyQuery = facultyQuery
  let contextualMaterialQuery = materialQuery
  let previousOptions: any[] | null = null
  let previousStepType: string | null = null

  if (messages && messages.length > 0) {
    const recentMessages = messages.slice(-10)
    for (const message of recentMessages.reverse()) {
      if (message.toolInvocations) {
        for (const toolCall of message.toolInvocations) {
          if (toolCall.toolName === 'queryVTOP' && toolCall.result && toolCall.result.success) {
            const result = toolCall.result
            if (result.step && result.data) {
              previousStepType = result.step
              if (typeof result.data === 'string') {
                try {
                  const parsedData = JSON.parse(result.data)
                  if (parsedData.options && Array.isArray(parsedData.options)) {
                    previousOptions = parsedData.options
                  }
                } catch (e) {
                  if (result.formatted_content) {
                    previousOptions = extractOptionsFromContent(result.formatted_content)
                  }
                }
              } else if (result.data.options && Array.isArray(result.data.options)) {
                previousOptions = result.data.options
              }

              if (!contextualSemesterQuery && result.formatted_content) {
                const semesterMatch = result.formatted_content.match(/(summer|fall|winter)\s*semester/i)
                if (semesterMatch) contextualSemesterQuery = semesterMatch[0].toLowerCase()
              }

              if (previousOptions && previousStepType) {
                const userMessage = messages[messages.length - 1]
                if (userMessage && userMessage.role === 'user' && userMessage.content) {
                  const userContent = userMessage.content.toLowerCase().trim()
                  if (previousStepType === 'course' && !contextualCourseQuery) {
                    const cleaned = userContent
                      .replace(/^(i would like to|i want to|show me|view|get|select|choose)\s*/i, '')
                      .replace(/\s*(course|materials?|page)$/i, '')
                      .trim()
                    if (cleaned) contextualCourseQuery = cleaned
                  } else if (previousStepType === 'faculty' && !contextualFacultyQuery) {
                    const cleaned = userContent
                      .replace(/^(i would like to|i want to|show me|view|get|select|choose)\s*/i, '')
                      .replace(/\s*(faculty|professor|teacher)$/i, '')
                      .trim()
                    if (cleaned) contextualFacultyQuery = cleaned
                  } else if (previousStepType === 'materials' && !contextualMaterialQuery) {
                    const extractedSelection = extractMaterialSelection(userContent)
                    if (extractedSelection) contextualMaterialQuery = extractedSelection
                  } else if (previousStepType === 'semester' && !contextualSemesterQuery) {
                    contextualSemesterQuery = userContent
                  }
                }
                break
              }
            }
          }
        }
      }
    }
  }

  let step = interactiveStep
  if (!step) {
    if (
      (contextualCourseQuery || courseQuery) &&
      (contextualFacultyQuery || facultyQuery) &&
      (contextualMaterialQuery || materialQuery)
    ) {
      step = 'semester'
    } else if ((contextualCourseQuery || courseQuery) && (contextualFacultyQuery || facultyQuery)) {
      step = 'semester'
    } else if (contextualCourseQuery || courseQuery) {
      step = 'semester'
    } else {
      if (contextualSemesterQuery && !semester) {
        step = 'semester'
      } else if (!semester) {
        step = 'semester'
      } else if (!course) {
        const shouldCompleteSemesterSelection = semester && previousStepType === 'semester'
        const semesterAutoResolved =
          contextualSemesterQuery &&
          semester &&
          messages &&
          messages.length > 0 &&
          messages[messages.length - 1]?.content?.toLowerCase().includes(contextualSemesterQuery.toLowerCase())
        const userJustSelectedSemester =
          messages &&
          messages.length > 0 &&
          previousStepType === 'semester' &&
          /^\s*\d+\s*$/.test(messages[messages.length - 1]?.content || '')

        if (shouldCompleteSemesterSelection || userJustSelectedSemester) {
          step = 'semester'
        } else if (semesterAutoResolved) {
          step = 'semester'
        } else {
          step = 'course'
        }
      } else if (!faculty) {
        step = 'faculty'
      } else {
        step = 'materials'
      }
    }
  }

  const PROXY_URL = process.env.VTOP_PROXY_URL || 'http://localhost:3001'
  const requestBody: VtopInteractiveRequestBody = {
    command: 'course-page-interactive',
    username,
    step,
    flags: {},
  }

  if (password.includes(':::')) {
    const [encryptedPassword, sessionKey] = password.split(':::')
    requestBody.encryptedPassword = encryptedPassword
    requestBody.sessionKey = sessionKey
  } else {
    requestBody.password = password
  }

  if (contextualSemesterQuery) requestBody.flags.semesterQuery = contextualSemesterQuery
  if (contextualCourseQuery) requestBody.flags.courseQuery = contextualCourseQuery
  if (contextualFacultyQuery || facultyQuery) requestBody.flags.facultyQuery = contextualFacultyQuery || facultyQuery
  if (contextualMaterialQuery || materialQuery) requestBody.flags.materialQuery = contextualMaterialQuery || materialQuery
  if (semester !== undefined) requestBody.flags.semester = semester
  if (course !== undefined) requestBody.flags.course = course
  if (faculty !== undefined) requestBody.flags.faculty = faculty
  if (fuzzyIndex !== undefined) requestBody.flags.fuzzyIndex = fuzzyIndex

  try {
    const response = await fetch(`${PROXY_URL}/vtop-interactive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = vtopErrorResponseSchema.parse(await response.json().catch(() => ({})))
      return {
        success: false,
        error: `VTOP interactive request failed: ${response.status}`,
        message: errorData.error || `Failed to execute ${step} step`,
        details: errorData,
      }
    }

    const result = vtopInteractiveResponseSchema.parse(await response.json())
    return {
      success: true,
      command: 'course-page',
      step,
      data: result.data || result.output,
      options: result.options,
      prompt: result.prompt,
      nextStep: result.nextStep,
      sessionData: result.sessionData,
      completed: result.completed,
      message: result.message || `Successfully completed ${step} step`,
      downloadInfo: result.downloadInfo,
      smartMatch: result.smartMatch,
      raw: result.raw || false,
      type: 'interactive-course-page',
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Network error',
      message: 'Unable to connect to VTOP proxy service for course materials.',
      suggestion: 'The VTOP proxy service may be offline. Please try again later.',
    }
  }
}

export function vtopTools() {
  const queryVTOP = tool({
    description:
      "Access VTOP (VIT's official portal) to get PERSONAL student data that requires login authentication. Use ONLY for individual student information like personal grades, attendance, timetable, marks, hostel info, library dues, exam schedules, digital assignments, and course materials. DO NOT use for general VIT information already available in knowledge base. This tool automatically handles credential authentication and interactive command prompts through intelligent defaults.",
    inputSchema: z.object({
      command: z
        .enum([
          'profile',
          'marks',
          'grades',
          'attendance',
          'timetable',
          'receipts',
          'hostel',
          'cgpa',
          'exams',
          'exam-schedule',
          'library-dues',
          'nightslip',
          'leave',
          'leave-status',
          'msg',
          'class-message',
          'da',
          'facility',
          'syllabus',
          'course-page',
        ])
        .describe('VTOP command to execute'),
      username: z.string().optional().describe('VTOP username/registration number'),
      password: z.string().optional().describe('VTOP password'),
      semester: z.number().optional().describe('Semester number (1-8) for commands like marks/grades'),
      semesterQuery: z.string().optional().describe('Text description of semester to search for'),
      course: z.number().optional().describe('Course selection number for course-page'),
      faculty: z.number().optional().describe('Faculty selection number for course-page'),
      classGroup: z.number().optional().describe('Class group number for calendar command'),
      fuzzyIndex: z.number().optional().describe('Fuzzy search index for course-page command'),
      courseQuery: z.string().optional().describe('Course search query for syllabus or course-page'),
      facultyQuery: z.string().optional().describe('Natural language faculty description'),
      materialQuery: z.string().optional().describe('Natural language material description'),
      interactiveStep: z
        .enum(['semester', 'course', 'faculty', 'materials', 'smart-search', 'download'])
        .optional()
        .describe('For course-page command: which step to execute'),
      debug: z.boolean().optional().describe('Enable debug mode'),
    }),
    execute: async (
      {
        command,
        username,
        password,
        semester,
        semesterQuery,
        course,
        faculty,
        classGroup,
        fuzzyIndex,
        courseQuery,
        facultyQuery,
        materialQuery,
        interactiveStep,
        debug,
      },
      context
    ) => {
      const MAX_RETRIES = 3
      let attempt = 0
      let lastError: any = null

      while (attempt < MAX_RETRIES) {
        try {
          let user = username
          let pass = password
          if (!user || !pass) {
            if (await hasVTOPCredentials()) {
              const savedCreds = await getFormattedVTOPCredentials()
              if (savedCreds) {
                user = savedCreds.username
                pass = savedCreds.encryptedPassword
              } else {
                return {
                  success: false,
                  error: 'VTOP credentials required',
                  requiresCredentials: true,
                  command,
                  message: 'Please provide your VTOP username and password to access VTOP data.',
                }
              }
            } else {
              return {
                success: false,
                error: 'VTOP credentials required',
                requiresCredentials: true,
                command,
                message: 'Please provide your VTOP username and password to access VTOP data.',
              }
            }
          }

          if (command === 'course-page') {
            return await handleIntelligentCoursePage({
              username: user!,
              password: pass!,
              semesterQuery,
              courseQuery,
              facultyQuery,
              materialQuery,
              interactiveStep,
              semester,
              course,
              faculty,
              fuzzyIndex,
              messages: context?.messages || [],
            })
          }

          const flags: VtopCommandFlags = {}
          if (semester !== undefined) flags.semester = semester
          if (semesterQuery) flags.semesterQuery = semesterQuery
          if (course !== undefined) flags.course = course
          if (faculty !== undefined) flags.faculty = faculty
          if (classGroup !== undefined) flags.classGroup = classGroup
          if (fuzzyIndex !== undefined) flags.fuzzyIndex = fuzzyIndex
          if (courseQuery) flags.courseQuery = courseQuery
          if (facultyQuery) flags.facultyQuery = facultyQuery
          if (materialQuery) flags.materialQuery = materialQuery
          if (debug) flags.debug = debug

          const DEFAULT_LATEST_SEMESTER = new Set([
            'timetable',
            'marks',
            'grades',
            'cgpa',
            'exam-schedule',
            'exams',
            'calendar',
            'attendance',
          ])
          if (DEFAULT_LATEST_SEMESTER.has(command) && !flags.semester && !flags.semesterQuery) {
            flags.semesterQuery = 'latest'
          }

          const PROXY_URL = process.env.VTOP_PROXY_URL || 'http://localhost:3001'
          const requestBody: VtopRequestBody = { command, username: user!, flags }
          if (pass!.includes(':::')) {
            const [encryptedPassword, sessionKey] = pass!.split(':::')
            requestBody.encryptedPassword = encryptedPassword
            requestBody.sessionKey = sessionKey
          } else {
            requestBody.password = pass!
          }

          const response = await fetch(`${PROXY_URL}/vtop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          })

          if (!response.ok) {
            const errorData = vtopErrorResponseSchema.parse(await response.json().catch(() => ({})))
            const errorMsg =
              typeof errorData === 'object' && 'error' in errorData && typeof errorData.error === 'string'
                ? errorData.error.toLowerCase()
                : ''
            if (
              errorMsg.includes('invalid username') ||
              errorMsg.includes('invalid loginid') ||
              errorMsg.includes('invalid password')
            ) {
              return {
                success: false,
                error: `VTOP request failed: ${response.status}`,
                message: errorData.error || `Failed to execute ${command} command`,
                details: errorData,
              }
            }
            lastError = {
              success: false,
              error: `VTOP request failed: ${response.status}`,
              message: errorData.error || `Failed to execute ${command} command`,
              details: errorData,
            }
            attempt++
            continue
          }

          const result = vtopProxyResponseSchema.parse(await response.json())
          if (result.success) {
            return {
              success: true,
              command,
              data: result.data || result.output,
              output: result.output || result.data,
              structured_data: result.structured_data || null,
              message: result.message || `Successfully retrieved ${command} data from VTOP.`,
              raw: result.raw || false,
              meta: result.meta || null,
            }
          }

          const errorMsg =
            typeof result === 'object' && 'error' in result && typeof result.error === 'string'
              ? result.error.toLowerCase()
              : ''
          if (
            errorMsg.includes('invalid username') ||
            errorMsg.includes('invalid loginid') ||
            errorMsg.includes('invalid password')
          ) {
            return {
              success: false,
              error: result.error || 'Unknown error',
              message: `Failed to retrieve ${command} data from VTOP. Reload.`,
              command,
            }
          }

          lastError = {
            success: false,
            error: result.error || 'Unknown error',
            message: `Failed to retrieve ${command} data from VTOP. Reload.`,
            command,
          }
          attempt++
        } catch (error: any) {
          lastError = {
            success: false,
            error: error.message || 'Network error',
            message: 'Unable to connect to VTOP proxy service. Please ensure the service is running.',
            suggestion: 'The VTOP proxy service may be offline. Please try again later.',
          }
          attempt++
        }
      }

      return (
        lastError || {
          success: false,
          error: 'Unknown error after retries',
          message: 'Failed to retrieve VTOP data after multiple attempts.',
        }
      )
    },
  })

  return { queryVTOP }
}

export type VtopTools = ReturnType<typeof vtopTools>
