import { tool } from 'ai'
import { z } from 'zod'
import { scrapePapersCodeChef } from './scrapers/papers-codechef'
import { scrapePapersService } from './scrapers/papers-scraper'
import { scrapeVITPaperVault } from './scrapers/vit-papervault'
import { scrapeExamCooker } from './scrapers/examcooker'
import { scrapePlacementInfo } from './scrapers/placement-scraper'
import { getMessMenu, formatMenuItems, getAvailableDateRange } from './scrapers/mess-menu-scraper'
import { getCourseCode } from './question-generator'
import {
  findFullCourseName,
  searchCoursesByName,
  getAllCourseMatches,
  recognizeCourseInText,
} from './course-map'
import { getCourseData, School } from './ffcs-tool'
import { createKnowledgeTools } from './knowledge-tools'
import { createMemoryTool } from './memory/memory-tools'
import { hasVTOPCredentials, getFormattedVTOPCredentials } from './server-vtop-credentials'
// import {
//   indexPastPapers,
//   askIndexedPaperQuestion,
//   smartPaperSearchByQuestion,
//   getPaperIndexMeta,
// } from './agents/paper-agent'
import { analyzeQuestionFrequencies } from './agents/question-frequency-agent'
import type {
  FacultyCourseRecord,
  FacultyResultEntry,
  FacultySchoolRecord,
  JsonValue,
  SyllabusEntry,
  VtopCommandFlags,
  VtopInteractiveRequestBody,
  VtopRequestBody,
} from '@/types/tools'

type ParsedPlacementData = {
  formatted_content: string
  summary: string
}

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)])
)

const redditAskResponseSchema = z.object({
  success: z.boolean(),
  response: z.string().optional(),
  sources: z.array(jsonValueSchema).optional(),
  confidence: z.number().optional(),
  totalResults: z.number().optional(),
  searchResults: z.number().optional(),
  searchAttempts: z.number().optional(),
  refinedQueries: z.array(z.string()).optional(),
  serviceUsed: z.string().optional(),
  error: z.string().optional(),
})

const redditRawResponseSchema = z.object({
  results: z.array(jsonValueSchema).optional(),
})

const redditTrendingResponseSchema = z.object({
  trending: z.array(z.string()).optional(),
})

const redditStatsResponseSchema = z.object({
  stats: z.record(z.number()).optional(),
})

const deriveSchoolAcronym = (name: string): string => {
  const match = name.match(/\(([^)]+)\)/)
  if (match && match[1]) {
    return match[1].toLowerCase()
  }
  return name.toLowerCase()
}

const facultyCourseSchema = z.object({
  code: z.string().optional(),
  title: z.string().optional(),
  slot: z.string().optional(),
  venue: z.string().optional(),
  type: z.string().optional(),
})

const facultyMemberSchema = z
  .object({
    name: z.string().optional(),
    department: z.string().optional(),
    designation: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    slot: z.string().optional(),
    room: z.string().optional(),
    profile_url: z.string().optional(),
    profileUrl: z.string().optional(),
    image_url: z.string().optional(),
    image: z.string().optional(),
    courses: z.array(facultyCourseSchema).optional(),
  })
  .catchall(jsonValueSchema)

const facultyDepartmentSchema = z.object({
  name: z.string().optional(),
  department: z.string().optional(),
  url: z.string().optional(),
  faculty: z.array(facultyMemberSchema).optional(),
})

const facultySchoolSchema = z.object({
  school: z.string().optional(),
  departments: z.array(facultyDepartmentSchema).optional(),
})

const facultyDataSchema: z.ZodType<FacultySchoolRecord[]> = z.array(facultySchoolSchema)

const syllabusEntrySchema: z.ZodType<SyllabusEntry> = z.union([
  z.string(),
  z.object({
    code: z.string().optional(),
    title: z.string().optional(),
    file: z.string().optional(),
    filename: z.string().optional(),
  }),
])

const syllabusListSchema = z.array(syllabusEntrySchema)

type FacultyData = z.infer<typeof facultyDataSchema>

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

const SCHOOL_VALUES: School[] = ['smec', 'score', 'scope', 'sbst', 'sce', 'scheme', 'select', 'sense']

const toSchool = (value: string): School | null => {
  const normalized = value.toLowerCase() as School
  return SCHOOL_VALUES.includes(normalized) ? normalized : null
}

async function searchRedditKnowledge(query: string, limit: number = 10) {
  try {
    const apiUrl = process.env.REDDIT_API_URL || 'http://localhost:3002'
    const response = await fetch(`${apiUrl}/api/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      throw new Error(`Reddit knowledge base service unavailable: ${response.status}`)
    }

    const data = redditAskResponseSchema.parse(await response.json())
    if (data.success) {
      return {
        success: true,
        response: data.response,
        sources: data.sources || [],
        confidence: data.confidence || 0,
        totalResults: data.searchResults || 0,
        searchAttempts: data.searchAttempts || 1,
        refinedQueries: data.refinedQueries || [],
        serviceUsed: data.serviceUsed || 'agentic',
      }
    } else {
      return {
        success: false,
        message: data.error || 'Unknown error occurred',
        totalResults: 0,
        searchAttempts: 0,
        refinedQueries: [],
        serviceUsed: 'unknown',
      }
    }
  } catch (error) {
    console.error('Error accessing Reddit knowledge base:', error)
    return {
      success: false,
      message: 'Reddit knowledge base service is currently unavailable. Please try again later.',
      totalResults: 0,
      searchAttempts: 0,
      refinedQueries: [],
      serviceUsed: 'unknown',
    }
  }
}

async function searchRedditRaw(query: string, limit: number = 10) {
  try {
    const apiUrl = process.env.REDDIT_API_URL || 'http://localhost:3002'
    const response = await fetch(`${apiUrl}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit }),
    })

    if (!response.ok) {
      throw new Error(`Reddit knowledge base service unavailable: ${response.status}`)
    }

    const data = redditRawResponseSchema.parse(await response.json())
    return data.results || []
  } catch (error) {
    console.error('Error accessing Reddit knowledge base:', error)
    return []
  }
}

async function getTrendingRedditTopics() {
  try {
    const apiUrl = process.env.REDDIT_API_URL || 'http://localhost:3002'
    const response = await fetch(`${apiUrl}/api/trending`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Reddit trending service unavailable: ${response.status}`)
    }

    const data = redditTrendingResponseSchema.parse(await response.json())
    return data.trending || []
  } catch (error) {
    console.error('Error accessing Reddit trending:', error)
    return []
  }
}

async function getRedditOverview() {
  try {
    const apiUrl = process.env.REDDIT_API_URL || 'http://localhost:3002'
    const [trendingResponse, statsResponse] = await Promise.all([
      fetch(`${apiUrl}/api/trending`),
      fetch(`${apiUrl}/api/stats`),
    ])

    const trending = trendingResponse.ok
      ? redditTrendingResponseSchema.parse(await trendingResponse.json()).trending || []
      : []
    const stats = statsResponse.ok
      ? redditStatsResponseSchema.parse(await statsResponse.json()).stats || {}
      : {}

    return {
      success: true,
      trending,
      stats,
      summary: `Currently tracking ${stats.totalPosts || 0} posts and ${stats.totalComments || 0} comments from VIT community discussions.`,
    }
  } catch (error) {
    console.error('Error getting Reddit overview:', error)
    return {
      success: false,
      error: 'Unable to fetch Reddit overview',
    }
  }
}

export async function searchRedditWithContext(query: string) {
  try {
    const broadQueryKeywords = [
      "what's happening",
      'what is happening',
      'currently',
      'current',
      'trending',
      'recent',
      'latest',
      'now',
      'today',
      'active',
      'popular',
      'hot topics',
      'hot',
      'discussions',
      'activity',
      'updates',
      'news',
      'look up reddit',
      'check reddit',
      'reddit overview',
      'happening on reddit',
      'reddit activity',
      'tell me about',
      'overview',
      'summary',
      'whats going on',
      "what's going on",
    ]

    const isBroadQuery =
      broadQueryKeywords.some(keyword => query.toLowerCase().includes(keyword.toLowerCase())) ||
      (query.toLowerCase().includes('reddit') &&
        (query.toLowerCase().includes('current') ||
          query.toLowerCase().includes('happening') ||
          query.toLowerCase().includes('trending') ||
          query.toLowerCase().includes('latest') ||
          query.toLowerCase().includes('now') ||
          query.toLowerCase().includes('today')))

    if (isBroadQuery) {
      const [trendingTopics, searchResults] = await Promise.all([
        getTrendingRedditTopics(),
        searchRedditKnowledge(query),
      ])

      return {
        success: true,
        response:
          searchResults.response ||
          'Here are the current trending topics and recent discussions from Reddit.',
        sources: searchResults.sources,
        trending: trendingTopics,
        confidence: searchResults.confidence,
        totalResults: searchResults.totalResults,
        isBroadQuery: true,
        message: `Found recent VIT discussions and ${trendingTopics.length} trending topics`,
      }
    } else {
      return await searchRedditKnowledge(query)
    }
  } catch (error: any) {
    console.error('Error in contextual Reddit search:', error)
    return {
      success: false,
      error: error?.message || 'Failed to search Reddit',
      message: 'Unable to access Reddit knowledge base',
    }
  }
}

function organizeMenuByMealType(menuItems: Array<{ type: number; menu: string }>) {
  const mealTypes: { [key: string]: string[] } = {
    breakfast: [],
    lunch: [],
    snacks: [],
    dinner: [],
  }

  const typeToMeal: { [key: number]: string } = {
    1: 'breakfast',
    2: 'lunch',
    3: 'snacks',
    4: 'dinner',
  }

  menuItems.forEach(item => {
    const mealType = typeToMeal[item.type]
    if (mealType) {
      const cleanedItems = item.menu
        .split(',')
        .map(menuItem => menuItem.trim())
        .filter(menuItem => menuItem.length > 0 && !menuItem.match(/^[B,J\s]*$/))
        .map(menuItem => menuItem.charAt(0).toUpperCase() + menuItem.slice(1).toLowerCase())

      mealTypes[mealType].push(...cleanedItems)
    }
  })

  Object.keys(mealTypes).forEach(key => {
    if (mealTypes[key].length === 0) {
      delete mealTypes[key]
    }
  })

  return mealTypes
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
  let previousOptions = null
  let previousStepType = null

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
                    previousOptions = extractOptionsFromContent(
                      result.formatted_content,
                      result.step
                    )
                  }
                }
              } else if (result.data.options && Array.isArray(result.data.options)) {
                previousOptions = result.data.options
              }

              if (!contextualSemesterQuery && result.formatted_content) {
                const semesterMatch = result.formatted_content.match(
                  /(summer|fall|winter)\s*semester/i
                )
                if (semesterMatch) {
                  contextualSemesterQuery = semesterMatch[0].toLowerCase()
                }
              }
              if (previousOptions && previousStepType) {
                const userMessage = messages[messages.length - 1]
                if (userMessage && userMessage.role === 'user' && userMessage.content) {
                  const userContent = userMessage.content.toLowerCase().trim()

                  if (previousStepType === 'course' && !contextualCourseQuery) {
                    const cleanedContent = userContent
                      .replace(
                        /^(i would like to|i want to|show me|view|get|select|choose)\s*/i,
                        ''
                      )
                      .replace(/\s*(course|materials?|page)$/i, '')
                      .trim()

                    if (cleanedContent) {
                      contextualCourseQuery = cleanedContent
                    }
                  } else if (previousStepType === 'faculty' && !contextualFacultyQuery) {
                    const cleanedContent = userContent
                      .replace(
                        /^(i would like to|i want to|show me|view|get|select|choose)\s*/i,
                        ''
                      )
                      .replace(/\s*(faculty|professor|teacher)$/i, '')
                      .trim()
                    if (cleanedContent) {
                      contextualFacultyQuery = cleanedContent
                    }
                  } else if (previousStepType === 'materials' && !contextualMaterialQuery) {
                    const extractedSelection = extractMaterialSelection(userContent)
                    if (extractedSelection) {
                      contextualMaterialQuery = extractedSelection
                    }
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

  function extractMaterialSelection(userContent: string): string | null {
    if (
      userContent.includes('all') ||
      userContent.includes('everything') ||
      userContent.includes('bulk download') ||
      userContent.includes('download all')
    ) {
      return 'all'
    } else if (userContent.match(/\d+[-,\s]*\d*/)) {
      const numberPattern = userContent.match(/(\d+[-,\s]*\d*)/g)
      if (numberPattern) {
        return numberPattern.join(',')
      }
    } else if (userContent.includes('first') && userContent.match(/\d+/)) {
      const num = userContent.match(/\d+/)?.[0]
      if (num) {
        return `1-${num}`
      }
    }
    return null
  }

  function extractOptionsFromContent(content: string, stepType: string): any[] | null {
    if (!content || typeof content !== 'string') return null

    const lines = content.split('\n')
    const options = []

    for (const line of lines) {
      const match = line.match(/^\s*(\d+)\s*[│|]\s*(.+)/)
      if (match) {
        const [, number, description] = match
        options.push({
          number: parseInt(number),
          description: description.trim(),
        })
      }
    }
    return options.length > 0 ? options : null
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
          messages[messages.length - 1]?.content
            ?.toLowerCase()
            .includes(contextualSemesterQuery.toLowerCase())

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
  if (contextualSemesterQuery) {
    requestBody.flags.semesterQuery = contextualSemesterQuery
  }
  if (contextualCourseQuery) {
    requestBody.flags.courseQuery = contextualCourseQuery
  }
  if (contextualFacultyQuery || facultyQuery) {
    requestBody.flags.facultyQuery = contextualFacultyQuery || facultyQuery
    if (contextualFacultyQuery)
      console.log('Using contextual faculty query:', contextualFacultyQuery)
  }
  if (contextualMaterialQuery || materialQuery) {
    requestBody.flags.materialQuery = contextualMaterialQuery || materialQuery
    if (contextualMaterialQuery)
      console.log('Using contextual material query:', contextualMaterialQuery)
  }

  if (semester !== undefined) requestBody.flags.semester = semester
  if (course !== undefined) requestBody.flags.course = course
  if (faculty !== undefined) requestBody.flags.faculty = faculty
  if (fuzzyIndex !== undefined) requestBody.flags.fuzzyIndex = fuzzyIndex

  try {
    const response = await fetch(`${PROXY_URL}/vtop-interactive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
      step: step,
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

const DEPARTMENT_ACRONYMS: Record<string, string[]> = {
  cse: [
    'computer science and engineering',
    'computer science',
    'school of computer science and engineering',
    'scope',
  ],
  scope: [
    'computer science and engineering',
    'computer science',
    'school of computer science and engineering',
    'cse',
  ],
  smec: ['mechanical engineering', 'school of mechanical engineering', 'mechanical'],
  mech: ['mechanical engineering', 'school of mechanical engineering', 'mechanical', 'smec'],
  ece: [
    'electronics and communication engineering',
    'electronics',
    'school of electronics engineering',
  ],
  ssl: ['school of social sciences and languages', 'social sciences', 'languages'],
  sas: ['school of advanced sciences', 'advanced sciences', 'sas'],
  score: [
    'information technology',
    'it',
    'school of information technology and engineering',
    'score',
  ],
  civil: ['civil engineering', 'school of civil engineering', 'civil', 'sce'],
  sce: ['civil engineering', 'school of civil engineering', 'civil', 'sce'],
}

function matchesDepartment(deptName: string, filter: string): boolean {
  const normDept = normalizeString(deptName)
  const normFilter = normalizeString(filter)

  if (normDept.includes(normFilter) || normFilter.includes(normDept)) return true

  if (DEPARTMENT_ACRONYMS[normFilter]) {
    if (DEPARTMENT_ACRONYMS[normFilter].some(full => normDept.includes(normalizeString(full)))) {
      return true
    }
  }

  if (DEPARTMENT_ACRONYMS[normDept]) {
    if (DEPARTMENT_ACRONYMS[normDept].some(full => normFilter.includes(normalizeString(full)))) {
      return true
    }
  }

  for (const [acronym, names] of Object.entries(DEPARTMENT_ACRONYMS)) {
    if (
      names.some(
        n =>
          normDept.includes(normalizeString(n)) &&
          (normFilter === acronym || normFilter.includes(acronym) || acronym.includes(normFilter))
      )
    ) {
      return true
    }
    if (
      names.some(
        n =>
          normFilter.includes(normalizeString(n)) &&
          (normDept === acronym || normDept.includes(acronym) || acronym.includes(normDept))
      )
    ) {
      return true
    }
  }

  const deptTokens = normDept.split(' ')
  const filterTokens = normFilter.split(' ')
  if (filterTokens.every(f => deptTokens.some(d => d.startsWith(f) || d === f))) return true
  if (deptTokens.every(d => filterTokens.some(f => f.startsWith(d) || f === d))) return true

  return false
}

export const courseUtils = {
  findFullCourseName,
  searchCoursesByName,
  getAllCourseMatches,
  recognizeCourseInText,

  getCourseInfo: (input: string) => {
    const matches = getAllCourseMatches(input)
    if (matches.length > 0) {
      return {
        success: true,
        query: input,
        matches: matches.map(m => ({ code: m.code, name: m.name, matchType: m.matchType })),
        primary: matches[0],
      }
    }
    return {
      success: false,
      query: input,
      matches: [],
      primary: null,
    }
  },

  recognizeCoursesInText: (text: string) => {
    const recognized = recognizeCourseInText(text)
    const acronymMatches = []

    const words = text.toUpperCase().split(/\s+/)
    for (const word of words) {
      const matches = getAllCourseMatches(word)
      if (matches.length > 0) {
        acronymMatches.push({ original: word, matches })
      }
    }

    return {
      directRecognitions: recognized,
      acronymMatches,
      totalFound: recognized.length + acronymMatches.length,
    }
  },
}

export function createVITTools(userId: string) {
  const findPastPapersInputSchema = z.object({
    courseCode: z
      .string()
      .optional()
      .describe("course code like BCSE302L or course name like 'database systems'"),
    examType: z.string().optional().describe('exam type: cat1, cat2, fat, quiz'),
    year: z.string().optional().describe('academic year like 2023, 2022'),
  })

  return {
    ...createKnowledgeTools(),
    ...createMemoryTool(userId),
    findPastPapers: tool({
      description:
        "find past examination papers for VIT courses from real repositories. You can use course names or codes. You don' need the user to specify the year, when no year is specified, the tool will search for all available years.",
      inputSchema: findPastPapersInputSchema,
      execute: async ({
        courseCode,
        examType,
        year,
      }: z.infer<typeof findPastPapersInputSchema>) => {
        try {
          if (!courseCode) {
            return {
              success: false,
              error: 'Course code required',
              requiresCourseCode: true,
              message: 'I could not find the course code for the course, can you provide it?',
              suggestion:
                'You can use course codes like BCSE302L or course names like "database systems".',
            }
          }

          let resolvedCourseCode = courseCode.trim().toUpperCase()

          if (!/^[A-Z]{4}\d{3}[A-Z]?$/.test(resolvedCourseCode)) {
            const mappedCode = getCourseCode(courseCode)
            if (mappedCode) {
              resolvedCourseCode = mappedCode
            } else {
              const courseMatches = getAllCourseMatches(courseCode)
              if (courseMatches.length > 0) {
                resolvedCourseCode = courseMatches[0].code
              } else {
                return {
                  success: false,
                  courseCode,
                  papers: [],
                  message: `Could not find a valid course code for "${courseCode}". Please provide a valid VIT course code.`,
                  suggestions: [
                    'Use the exact VIT course code',
                    'Check your course timetable or VTOP for the exact course code',
                    'Contact course faculty for the correct course code',
                  ],
                }
              }
            }
          }

          const results = await Promise.allSettled([
            scrapePapersService(resolvedCourseCode, examType, year),
            scrapePapersCodeChef(resolvedCourseCode, examType, year),
            scrapeVITPaperVault(resolvedCourseCode, examType, year),
            scrapeExamCooker(resolvedCourseCode, examType, year),
          ])

          const papers: any[] = []
          const sources: any[] = []

          results.forEach(r => {
            if (r.status === 'fulfilled' && r.value?.success) {
              papers.push(...(r.value.papers || []))
              sources.push(r.value.source)
            }
          })

          if (papers.length === 0) {
            return {
              success: false,
              courseCode: resolvedCourseCode,
              originalQuery: courseCode,
              papers: [],
              message: `No papers found for course code "${resolvedCourseCode}"${
                resolvedCourseCode !== courseCode ? ` (searched for: "${courseCode}")` : ''
              }${examType ? ` (${examType})` : ''}${year ? ` from ${year}` : ''}.`,
              suggestions: [
                resolvedCourseCode !== courseCode
                  ? `Double-check that "${resolvedCourseCode}" is the correct course code for "${courseCode}"`
                  : 'Verify the course code format (e.g., MECH2001, BMEE302L)',
                'Try different exam types: CAT1, CAT2, FAT, or Quiz',
                'Check with course faculty for official study materials',
                'Visit VIT library for physical copies of past papers',
                'Contact senior students or study groups for materials',
              ],
            }
          }

          return {
            success: true,
            courseCode,
            examType,
            year,
            papers,
            totalFound: papers.length,
            message: `found ${papers.length} papers for ${courseCode}${
              examType ? ` (${examType})` : ''
            }${year ? ` from ${year}` : ''}`,
            sources,
          }
        } catch (err: any) {
          const errorMessage =
            typeof err === 'object' && err?.message
              ? err.message
              : 'unable to scrape papers at the moment. please try again later.'
          return {
            success: false,
            error: errorMessage,
            message: 'unable to scrape papers at the moment. please try again later.',
          }
        }
      },
    }),
    resolveCourseCode: tool({
      description:
        'Resolve a VIT course name, acronym, or partial description to canonical course codes using the local course map. Use this before any course-specific tools (past papers, VTOP course materials, FFCS lookups) when the user did not provide the exact course code.',
      inputSchema: z.object({
        query: z
          .string()
          .min(1, 'Provide a course name, acronym, or code to resolve.')
          .describe(
            'Course name, acronym, or partial code. Examples: "database systems", "DSA", "BCSE302L", "machine learning lab".'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('Maximum number of candidate codes to return (default 5).'),
      }),
      execute: async ({ query, limit }) => {
        const cleanedQuery = query.trim()
        if (!cleanedQuery) {
          return {
            success: false,
            message: 'Please provide a course name, acronym, or partial code to resolve.',
          }
        }

        const limitValue = Math.max(1, Math.min(limit ?? 5, 10))
        let matches = getAllCourseMatches(cleanedQuery)

        if (matches.length === 0) {
          const fallback = searchCoursesByName(cleanedQuery)
          matches = fallback.map(match => ({
            code: match.code,
            name: match.name,
            matchType: 'name_similarity',
          }))
        }

        const recognizedCourses = recognizeCourseInText(cleanedQuery)
        const limitedMatches = matches.slice(0, limitValue)
        const normalizedName = findFullCourseName(
          limitedMatches[0]?.code || cleanedQuery.toUpperCase()
        )

        if (limitedMatches.length === 0) {
          return {
            success: false,
            query: cleanedQuery,
            message: `No VIT course matches found for "${cleanedQuery}".`,
            suggestions: [
              'Check the spelling or include more of the course title (e.g., "database systems lab").',
              'Include any known acronym such as DSA, DBMS, ML, etc.',
              'Mention part of the official course code if available (e.g., BCSE, BMAT).',
            ],
            recognizedCourses,
          }
        }

        return {
          success: true,
          query: cleanedQuery,
          matches: limitedMatches,
          totalMatches: matches.length,
          normalizedName,
          recognizedCourses,
          primary: limitedMatches[0],
          limitUsed: limitValue,
          message:
            limitedMatches.length === 1
              ? `Resolved "${cleanedQuery}" to ${limitedMatches[0].code} (${limitedMatches[0].name}).`
              : `Found ${limitedMatches.length} candidate course codes for "${cleanedQuery}".`,
        }
      },
    }),










    getCourseInfo: tool({
      description:
        'Get information about courses from the FFCS dataset (supports all schools: SMEC, SCORE, SCOPE, SBST, SCE, SCHEME, SELECT, SENSE). Returns faculty names, slots, venue, etc.',
      inputSchema: z.object({
        school: z
          .enum(['smec', 'score', 'scope', 'sbst', 'sce', 'scheme', 'select', 'sense'])
          .describe(
            'The school to search within. Examples: smec (mechanical), score (information tech), scope (computer science), sbst (biosciences and technology), sce (civil), scheme (chemical engineering), select (electrical engineering), sense (electronics and communication engineering'
          ),
        courseQuery: z
          .string()
          .describe('The course code or title to search for. Can be a partial match.'),
        slot: z
          .string()
          .optional()
          .describe('An optional specific slot to filter by (e.g., "A1", "L1+L2").'),
      }),
      execute: async ({ school, courseQuery, slot }) => {
        try {
          const { allCourses } = await getCourseData(school)

          let matchCodes: string[] = []
          const matches = getAllCourseMatches(courseQuery)
          if (matches.length > 0) {
            matchCodes = matches.map(m => m.code.toUpperCase())
          }

          let filteredCourses = allCourses.filter(course => {
            if (matchCodes.length) {
              return matchCodes.includes(course.CODE.toUpperCase())
            }
            return (
              course.CODE.toLowerCase().includes(courseQuery.toLowerCase()) ||
              course.TITLE.toLowerCase().includes(courseQuery.toLowerCase())
            )
          })

          if (slot) {
            filteredCourses = filteredCourses.filter(course => course.SLOT === slot)
          }

          if (filteredCourses.length === 0) {
            return {
              success: true,
              message:
                `No courses found matching "${courseQuery}"` +
                (slot ? ` in slot ${slot}` : '') +
                ` for ${school.toUpperCase()} school.`,
              results: [],
            }
          }

          const results = filteredCourses.map(course => ({
            code: course.CODE,
            title: course.TITLE,
            faculty: course.FACULTY,
            slot: course.SLOT,
            type: course.TYPE,
          }))

          return {
            success: true,
            message: `Found ${results.length} matching course(s).`,
            results,
          }
        } catch (error) {
          console.error('Error in getCourseInfo tool:', error)
          return {
            success: false,
            message: 'An error occurred while fetching course information.',
          }
        }
      },
    }),

    getFacultyInfo: tool({
      description: `Get current faculty information from a local JSON file (public/faculty.json). NEVER return all faculty members at once—ALWAYS require at least a department or faculty name filter. If no filter is provided, ask the user to specify a department or faculty name. Returns school, department, and faculty info. Do NOT provide a full list of all faculty.

For best results, try both department acronyms (e.g., 'CSE', 'SMEC', 'SCORE', 'CIVIL') and full or partial department names (e.g., 'computer science', 'school of mechanical engineering', 'information technology', 'civil engineering'). The search is robust to acronyms, full names, and partial matches in either direction.`,
      inputSchema: z.object({
        department: z
          .string()
          .optional()
          .describe('Department name or acronym to filter faculty (e.g., CSE, Mechanical).'),
        facultyName: z.string().optional().describe('Specific faculty member name'),
        includeCourses: z
          .boolean()
          .optional()
          .describe('If true, also return courses the faculty teaches.'),
        school: z
          .enum(['smec', 'score', 'scope', 'sbst', 'sce', 'scheme', 'select', 'sense'])
          .optional()
          .describe(
            'Limit course lookup to a specific school; defaults to all, while using the parameter, use the acronym (like smec, score, scope, sbst, sce, scheme, select, sense)'
          ),
        courseQuery: z
          .string()
          .optional()
          .describe('Course code or title to filter faculty who teach a specific course.'),
      }),
      execute: async ({ department, facultyName, includeCourses = false, school, courseQuery }) => {
        try {
          const res = await fetch(
            typeof window === 'undefined'
              ? `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/faculty.json`
              : '/faculty.json'
          )
          if (!res.ok) throw new Error('Could not load faculty.json')
          const schools = facultyDataSchema.parse(await res.json())

          let results = []
          const deptFilter = department ? department.toLowerCase() : null
          const facultyFilter = facultyName ? facultyName.toLowerCase() : null
          const courseFilter = courseQuery ? courseQuery.toLowerCase() : null
          for (let i = 0; i < schools.length; ++i) {
            const school = schools[i]
            const schoolName = school.school
            if (!schoolName) continue
            const departments = school.departments || []
            let schoolMatches = false
            if (deptFilter && matchesDepartment(schoolName, deptFilter)) {
              schoolMatches = true
            }
            for (let j = 0; j < departments.length; ++j) {
              const dept = departments[j]
              if (schoolMatches) {
                const facultyArr = dept.faculty || []
                for (let k = 0; k < facultyArr.length; ++k) {
                  const faculty = facultyArr[k]
                  const facultyNameValue = faculty.name
                  if (!facultyNameValue) continue
                  if (facultyFilter) {
                    const name = normalizeString(facultyNameValue)
                    const filter = normalizeString(facultyFilter)
                    const nameTokens = name.split(' ')
                    const filterTokens = filter.split(' ')
                    let allTokensMatch = true
                    for (const fToken of filterTokens) {
                      let tokenMatched = false
                      for (const nToken of nameTokens) {
                        if (fToken.length < 4) {
                          if (nToken === fToken) {
                            tokenMatched = true
                            break
                          }
                        } else {
                          const dist = getLevenshteinDistance(nToken, fToken)
                          if (nToken.includes(fToken) || dist <= 1) {
                            tokenMatched = true
                            break
                          }
                        }
                      }
                      if (!tokenMatched) {
                        allTokensMatch = false
                        break
                      }
                    }
                    if (!allTokensMatch) continue
                  }

                  let facultyEntry: FacultyResultEntry = {
                    name: facultyNameValue,
                    department: faculty.department || dept.department || dept.name || schoolName,
                    school: schoolName,
                    email: faculty.email || undefined,
                    profileUrl: faculty.profile_url || faculty.profileUrl || undefined,
                    ...faculty,
                    image: faculty.image_url || faculty.image || undefined,
                  }
                  let teachesCourse = true
                  if (courseFilter) {
                    const normalizedSchool = toSchool(deriveSchoolAcronym(schoolName))
                    if (!normalizedSchool) {
                      teachesCourse = false
                      continue
                    }
                    try {
                      const { allCourses } = await getCourseData(normalizedSchool)
                      const normalizeName = (value?: string) =>
                        (value ?? '')
                          .replace(/^Dr\.?\s*|\s+/g, '')
                          .toLowerCase()
                          .trim()
                      const facultyNameNormalized = normalizeName(facultyNameValue)
                      const facultyCourses = allCourses.filter(course => {
                        const courseFacultyNormalized = normalizeName(course.FACULTY)
                        const courseTitle = course.TITLE.toLowerCase()
                        const courseCode = course.CODE.toLowerCase()
                        return (
                          facultyNameNormalized.length > 0 &&
                          (courseFacultyNormalized.includes(facultyNameNormalized) ||
                            facultyNameNormalized.includes(courseFacultyNormalized)) &&
                          (courseTitle.includes(courseFilter) || courseCode.includes(courseFilter))
                        )
                      })
                      if (facultyCourses.length === 0) {
                        teachesCourse = false
                      } else if (includeCourses) {
                        facultyEntry.courses = facultyCourses.map(course => ({
                          code: course.CODE,
                          title: course.TITLE,
                          slot: course.SLOT,
                          type: course.TYPE,
                          venue: course.VENUE,
                        }))
                      }
                    } catch {
                      teachesCourse = false
                    }
                  } else if (includeCourses) {
                    const normalizedSchool = toSchool(deriveSchoolAcronym(schoolName))
                    if (!normalizedSchool) {
                      facultyEntry.courses = []
                      continue
                    }
                    try {
                      const { allCourses } = await getCourseData(normalizedSchool)
                      const normalizeName = (value?: string) =>
                        (value ?? '')
                          .replace(/^Dr\.?\s*|\s+/g, '')
                          .toLowerCase()
                          .trim()
                      const facultyNameNormalized = normalizeName(facultyNameValue)
                      const facultyCourses = allCourses.filter(course => {
                        const courseFacultyNormalized = normalizeName(course.FACULTY)
                        return (
                          facultyNameNormalized.length > 0 &&
                          (courseFacultyNormalized.includes(facultyNameNormalized) ||
                            facultyNameNormalized.includes(courseFacultyNormalized))
                        )
                      })
                      facultyEntry.courses = facultyCourses.map(course => ({
                        code: course.CODE,
                        title: course.TITLE,
                        slot: course.SLOT,
                        type: course.TYPE,
                        venue: course.VENUE,
                      }))
                    } catch {
                      facultyEntry.courses = []
                    }
                  }
                  if (teachesCourse) {
                    results.push(facultyEntry)
                  }
                }
                continue
              }
              const departmentName = dept.department || dept.name || ''
              if (deptFilter && !matchesDepartment(departmentName || schoolName, deptFilter)) {
                continue
              }
              const facultyArr = dept.faculty || []
              for (let k = 0; k < facultyArr.length; ++k) {
                const faculty = facultyArr[k]
                const facultyNameValue = faculty.name
                if (!facultyNameValue) continue
                if (facultyFilter) {
                  const name = normalizeString(facultyNameValue)
                  const filter = normalizeString(facultyFilter)
                  const nameTokens = name.split(' ')
                  const filterTokens = filter.split(' ')
                  let allTokensMatch = true
                  for (const fToken of filterTokens) {
                    let tokenMatched = false
                    for (const nToken of nameTokens) {
                      if (fToken.length < 4) {
                        if (nToken === fToken) {
                          tokenMatched = true
                          break
                        }
                      } else {
                        const dist = getLevenshteinDistance(nToken, fToken)
                        if (nToken.includes(fToken) || dist <= 1) {
                          tokenMatched = true
                          break
                        }
                      }
                    }
                    if (!tokenMatched) {
                      allTokensMatch = false
                      break
                    }
                  }
                  if (!allTokensMatch) continue
                }

                let facultyEntry: FacultyResultEntry = {
                  name: facultyNameValue,
                  department: faculty.department || departmentName || schoolName,
                  school: schoolName,
                  email: faculty.email || undefined,
                  profileUrl: faculty.profile_url || faculty.profileUrl || undefined,
                  ...faculty,
                  image: faculty.image_url || faculty.image || undefined,
                }
                let teachesCourse = true
                if (courseFilter) {
                  const normalizedSchool = toSchool(deriveSchoolAcronym(schoolName))
                  if (!normalizedSchool) {
                    teachesCourse = false
                    continue
                  }
                  try {
                    const { allCourses } = await getCourseData(normalizedSchool)
                    const normalizeName = (value?: string) =>
                      (value ?? '')
                        .replace(/^Dr\.?\s*|\s+/g, '')
                        .toLowerCase()
                        .trim()
                    const facultyNameNormalized = normalizeName(facultyNameValue)
                    const facultyCourses = allCourses.filter(course => {
                      const courseFacultyNormalized = normalizeName(course.FACULTY)
                      const courseTitle = course.TITLE.toLowerCase()
                      const courseCode = course.CODE.toLowerCase()
                      return (
                        facultyNameNormalized.length > 0 &&
                        (courseFacultyNormalized.includes(facultyNameNormalized) ||
                          facultyNameNormalized.includes(courseFacultyNormalized)) &&
                        (courseTitle.includes(courseFilter) || courseCode.includes(courseFilter))
                      )
                    })
                    if (facultyCourses.length === 0) {
                      teachesCourse = false
                    } else if (includeCourses) {
                      facultyEntry.courses = facultyCourses.map(course => ({
                        code: course.CODE,
                        title: course.TITLE,
                        slot: course.SLOT,
                        type: course.TYPE,
                        venue: course.VENUE,
                      }))
                    }
                  } catch {
                    teachesCourse = false
                  }
                } else if (includeCourses) {
                  const normalizedSchool = toSchool(deriveSchoolAcronym(schoolName))
                  if (!normalizedSchool) {
                    facultyEntry.courses = []
                    continue
                  }
                  try {
                    const { allCourses } = await getCourseData(normalizedSchool)
                    const normalizeName = (value?: string) =>
                      (value ?? '')
                        .replace(/^Dr\.?\s*|\s+/g, '')
                        .toLowerCase()
                        .trim()
                    const facultyNameNormalized = normalizeName(facultyNameValue)
                    const facultyCourses = allCourses.filter(course => {
                      const courseFacultyNormalized = normalizeName(course.FACULTY)
                      return (
                        facultyNameNormalized.length > 0 &&
                        (courseFacultyNormalized.includes(facultyNameNormalized) ||
                          facultyNameNormalized.includes(courseFacultyNormalized))
                      )
                    })
                    facultyEntry.courses = facultyCourses.map(course => ({
                      code: course.CODE,
                      title: course.TITLE,
                      slot: course.SLOT,
                      type: course.TYPE,
                      venue: course.VENUE,
                    }))
                  } catch {
                    facultyEntry.courses = []
                  }
                }
                if (teachesCourse) {
                  results.push(facultyEntry)
                }
              }
            }
          }

          if (results.length === 1 && !courseQuery && !includeCourses) {
            const faculty = results[0]
            const schoolAsEnum = faculty.school
              ? toSchool(deriveSchoolAcronym(faculty.school))
              : null

            if (schoolAsEnum && faculty.name) {
              try {
                const { allCourses } = await getCourseData(schoolAsEnum)
                const normalizeName = (name?: string) =>
                  (name ?? '')
                    .replace(/^Dr\.?\s*|\s+/g, '')
                    .toLowerCase()
                    .trim()
                const facultyNameNormalized = normalizeName(faculty.name)
                const facultyCourses = allCourses.filter(course => {
                  const courseFacultyNormalized = normalizeName(course.FACULTY)
                  return (
                    courseFacultyNormalized.includes(facultyNameNormalized) ||
                    facultyNameNormalized.includes(courseFacultyNormalized)
                  )
                })

                faculty.courses = facultyCourses.map(course => ({
                  code: course.CODE,
                  title: course.TITLE,
                  slot: course.SLOT,
                  type: course.TYPE,
                  venue: course.VENUE,
                }))

                return {
                  success: true,
                  total: 1,
                  faculty: [faculty],
                  message:
                    `Found faculty member ${faculty.name} in ${faculty.department || faculty.school}.` +
                    `\n\nCourses taught (${faculty.courses.length}):` +
                    `\n${faculty.courses
                      .map((c: FacultyCourseRecord) => `- ${c.code ?? 'N/A'}: ${c.title ?? 'Unknown'}`)
                      .join('\n')}`,
                }
              } catch (error) {
                console.error('Error fetching courses for faculty:', error)
              }
            }
          }

          return {
            success: true,
            total: results.length,
            faculty: results,
            message: results.length
              ? `Found ${results.length} faculty${department ? ' in ' + department : ''}${facultyName ? ' matching ' + facultyName : ''}${courseQuery ? ' teaching ' + courseQuery : ''}.`
              : 'No faculty found. Please check the spelling or try a different department, name, or course.',
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message || 'Failed to search faculty.json',
            message: error.message,
          }
        }
      },
    }),

    getPlacementInfo: tool({
      description:
        'Get latest placement statistics and company information. Use this for any questions about placements, highest packages, company offers, salary stats, or recruitment.',
      inputSchema: z.object({
        year: z.string().optional().describe('Academic year, e.g., 2024-25'),
        companyFilter: z
          .string()
          .optional()
          .describe('Filter results by a specific company. Can be a partial name.'),
        combineWitch: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Whether to include WITCH (e.g., TCS, Cognizant) offers in the results. Defaults to false.'
          ),
        campus: z
          .enum(['Vellore', 'Chennai', 'Amaravati', 'Bhopal'])
          .optional()
          .describe('Filter results by campus. Can be Vellore, Chennai or Amaravati.'),
      }),
      execute: async ({ year, companyFilter, combineWitch, campus }) => {
        const raw = await scrapePlacementInfo(year, companyFilter, combineWitch, campus)
        try {
          const { parsePlacementData } = await import('../lib/scrapers/placement-scraper')
          const parsed = (await parsePlacementData(
            raw,
            '',
            undefined
          )) as unknown as ParsedPlacementData
          return {
            ...raw,
            campus,
            formatted_content: parsed.formatted_content,
            summary: parsed.summary,
            message: parsed.summary || parsed.formatted_content,
          }
        } catch (err) {
          return {
            ...raw,
            campus,
          }
        }
      },
    }),

    getSyllabus: tool({
      description:
        'Fetch the syllabus PDF for a given course. The tool looks up available syllabus filenames from public/syllabi.json and constructs a Google Storage URL like https://storage.googleapis.com/examcooker/syllabi/<FILENAME>. Use course code or partial course name to search.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Course code (e.g., ACXC101N) or course name (e.g., "Art of Advertising")'),
      }),
      execute: async ({ query }) => {
        try {
          console.debug('[getSyllabus] query:', query)
          if (!query || query.trim().length === 0) {
            return {
              success: false,
              error: 'Query required',
              message: 'Please provide a course code or course name to lookup the syllabus.',
            }
          }

          const base =
            typeof window === 'undefined'
              ? process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
              : ''
          const res = await fetch(`${base}/syllabi.json`)
          if (!res.ok) {
            console.error('[getSyllabus] could not load syllabi.json', res.status)
            return {
              success: false,
              error: `Could not load syllabi.json (${res.status})`,
            }
          }

          const data: any = await res.json()
          console.debug(
            '[getSyllabus] loaded items:',
            Array.isArray(data) ? data.length : 'unknown'
          )

          const qRaw = query.trim()
          const q = qRaw.toLowerCase()
          const tokens = q
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()\[\]]/g, ' ')
            .split(/\s+/)
            .filter(Boolean)

          const normalizeFilename = (fn: string) => {
            if (!fn || typeof fn !== 'string') return { code: null, title: null }
            const base = fn.split('/').pop() || fn
            const withoutExt = base.replace(/\.[^.]+$/, '')
            const parts = withoutExt.split(/_(.+)/)
            const codePart = parts[0] || ''
            const titlePart = parts[1] || ''
            const title = titlePart
              .replace(/[_-]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .replace(/\b\w/g, c => c.toUpperCase())
            return { code: codePart, title: title || null }
          }

          const scoreCandidate = (cand: any) => {
            let code = ''
            let title = ''
            let filename = ''
            if (typeof cand === 'string') {
              filename = cand
              code = cand.split('_')[0] || ''
            } else if (cand && typeof cand === 'object') {
              code = (cand.code || '').toString()
              title = (cand.title || '').toString()
              filename = (cand.file || cand.filename || '').toString()
            }
            const hay = (code + ' ' + title + ' ' + filename).toLowerCase()
            let score = 0
            if (code.toLowerCase() === q) score += 100
            if (filename.toLowerCase() === q) score += 80
            for (const t of tokens) {
              if (hay.includes(t)) score += 10
              const re = new RegExp('\\b' + t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b')
              if (re.test(hay)) score += 5
            }
            return score
          }

          if (Array.isArray(data) && data.length > 0) {
            if (typeof data[0] === 'string') {
              const exact = data.find((fn: string) => fn.split('_')[0].toLowerCase() === q)
              if (exact) {
                console.debug('[getSyllabus] exact code match:', exact)
                const norm = normalizeFilename(exact)
                return {
                  success: true,
                  filename: exact,
                  code: norm.code,
                  title: norm.title,
                  url: `https://storage.googleapis.com/examcooker/syllabi/${exact}`,
                  message: `Found syllabus file for query: ${query}`,
                }
              }

              const scored = data
                .map((fn: string) => ({ fn, score: scoreCandidate(fn) }))
                .sort((a: any, b: any) => b.score - a.score)
              console.debug('[getSyllabus] top candidates (string):', scored.slice(0, 5))
              if (scored.length > 0 && scored[0].score > 0) {
                const topScore = scored[0].score
                const topMatches = scored
                  .filter((s: any) => s.score > 0 && s.score >= Math.max(1, topScore - 5))
                  .slice(0, 8)
                if (topMatches.length > 1) {
                  const matches = topMatches.map((s: any) => {
                    const norm = normalizeFilename(s.fn)
                    return {
                      filename: s.fn,
                      code: norm.code,
                      title: norm.title,
                      url: `https://storage.googleapis.com/examcooker/syllabi/${s.fn}`,
                      score: s.score,
                    }
                  })
                  return {
                    success: true,
                    ambiguous: true,
                    query,
                    matches,
                    message: `Multiple syllabus files may match "${query}". Please pick one.`,
                  }
                }

                const matched = scored[0].fn
                const norm = normalizeFilename(matched)
                return {
                  success: true,
                  filename: matched,
                  code: norm.code,
                  title: norm.title,
                  url: `https://storage.googleapis.com/examcooker/syllabi/${matched}`,
                  message: `Found syllabus file matching query: ${query}`,
                }
              }
            } else {
              const scored = data
                .map((item: any) => ({ item, score: scoreCandidate(item) }))
                .sort((a: any, b: any) => b.score - a.score)
              console.debug(
                '[getSyllabus] top candidates (objects):',
                scored.slice(0, 6).map((s: any) => ({
                  code: s.item.code,
                  title: s.item.title,
                  filename: s.item.file || s.item.filename,
                  score: s.score,
                }))
              )
              if (scored.length > 0 && scored[0].score > 0) {
                const topScore = scored[0].score
                const topMatches = scored
                  .filter((s: any) => s.score > 0 && s.score >= Math.max(1, topScore - 5))
                  .slice(0, 8)
                if (topMatches.length > 1) {
                  const matches = topMatches.map((s: any) => {
                    const best = s.item
                    const filename = best.file || best.filename || `${best.code || 'syllabus'}.pdf`
                    const norm = normalizeFilename(filename)
                    return {
                      filename,
                      code: best.code || norm.code,
                      title: best.title || norm.title,
                      url: `https://storage.googleapis.com/examcooker/syllabi/${filename}`,
                      score: s.score,
                    }
                  })
                  return {
                    success: true,
                    ambiguous: true,
                    query,
                    matches,
                    message: `Multiple syllabi may match "${query}". Please pick one.`,
                  }
                }

                const best = scored[0].item
                const filename = best.file || best.filename || `${best.code || 'syllabus'}.pdf`
                let codeOut = best.code || null
                let titleOut = best.title || null
                if (!codeOut || !titleOut) {
                  const norm = normalizeFilename(filename)
                  codeOut = codeOut || norm.code
                  titleOut = titleOut || norm.title
                }
                return {
                  success: true,
                  filename,
                  code: codeOut,
                  title: titleOut,
                  url: `https://storage.googleapis.com/examcooker/syllabi/${filename}`,
                  message: `Found syllabus for ${codeOut || titleOut}`,
                }
              }
            }
          }

          try {
            const lowered = Array.isArray(data)
              ? data.map((d: any) =>
                  typeof d === 'string' ? d.toLowerCase() : JSON.stringify(d).toLowerCase()
                )
              : []
            let bestIndex = -1
            for (let i = 0; i < lowered.length; i++) {
              if (lowered[i].includes(q)) {
                bestIndex = i
                break
              }
            }
            if (bestIndex >= 0) {
              const matchesFound: any[] = []
              for (let i = 0; i < lowered.length; i++) {
                if (lowered[i].includes(q)) {
                  const orig = data[i]
                  const filename =
                    typeof orig === 'string' ? orig : orig.file || orig.filename || null
                  const norm =
                    typeof filename === 'string'
                      ? normalizeFilename(filename)
                      : { code: null, title: null }
                  matchesFound.push({
                    filename,
                    code: norm.code,
                    title: norm.title,
                    url: filename
                      ? `https://storage.googleapis.com/examcooker/syllabi/${filename}`
                      : null,
                  })
                }
              }
              if (matchesFound.length > 1) {
                return {
                  success: true,
                  ambiguous: true,
                  query,
                  matches: matchesFound,
                  message: `Multiple syllabus files match "${query}". Please pick one.`,
                }
              }
              const m = matchesFound[0]
              return {
                success: true,
                filename: m.filename,
                code: m.code,
                title: m.title,
                url: m.url,
                message: `Found syllabus matching query: ${query}`,
              }
            }
          } catch (e) {}

          console.debug('[getSyllabus] no match for query:', query)
          return {
            success: false,
            query,
            message: `No syllabus found matching "${query}". Try using the exact course code (e.g., ACXC101N) or a more distinctive part of the course title.`,
            suggestions: [
              'Use the exact course code like ACXC101N',
              'Try a shorter distinctive phrase from the course title (e.g., include a module name or code)',
            ],
          }
        } catch (error: any) {
          console.error('[getSyllabus] error', error)
          return {
            success: false,
            error: error?.message || String(error),
            message: 'Failed to lookup syllabi.json',
          }
        }
      },
    }),

    getMessMenu: tool({
      description:
        "get mess menu for VIT hostels (both men's and ladies' hostels). Use this when users ask about mess menu, today's food, what's for lunch/dinner/breakfast/snacks, tomorrow's menu, etc. Covers special mess, veg mess, and non-veg mess for both hostels. IMPORTANT: Do NOT ask for hostelType and messType if you are already aware of the user's preference through memory, populate them from memory.",
      inputSchema: z.object({
        hostelType: z
          .preprocess(
            val => {
              if (typeof val === 'string') {
                const cleaned = val.toLowerCase().replace(/[’']/g, '')
                if (cleaned === 'mens' || cleaned === 'ladies') return cleaned
              }
              return val
            },
            z.enum(['mens', 'ladies'])
          )
          .describe(
            "REQUIRED: type of hostel: mens (men's hostel) or ladies (ladies' hostel). Must be specified by user."
          ),
        messType: z
          .enum(['special', 'veg', 'nonveg'])
          .describe(
            'REQUIRED: type of mess: special (premium food), veg (vegetarian), or non-veg (non-vegetarian). Must be specified by user.'
          ),
        date: z
          .string()
          .optional()
          .describe(
            "date in YYYY-MM-DD format. If not provided, uses today's date. Can also accept 'today', 'tomorrow', etc."
          ),
        mealType: z
          .enum(['breakfast', 'lunch', 'snacks', 'dinner'])
          .optional()
          .describe('specific meal type to filter. If not provided, returns all meals for the day'),
      }),
      execute: async ({ hostelType, messType, date, mealType }) => {
        let processedDate = date
        if (date) {
          const today = new Date()
          if (date.toLowerCase() === 'today') {
            processedDate = today.toISOString().split('T')[0]
          } else if (date.toLowerCase() === 'tomorrow') {
            const tomorrow = new Date(today)
            tomorrow.setDate(today.getDate() + 1)
            processedDate = tomorrow.toISOString().split('T')[0]
          } else if (date.toLowerCase() === 'yesterday') {
            const yesterday = new Date(today)
            yesterday.setDate(today.getDate() - 1)
            processedDate = yesterday.toISOString().split('T')[0]
          }
        }

        const result = await getMessMenu(hostelType, messType, processedDate, mealType)

        if (result.success && result.data?.todayMenu) {
          const organizedTodayMenu = organizeMenuByMealType(result.data.todayMenu.menu)

          const formattedMenu = formatMenuItems(result.data.todayMenu.menu)

          return {
            ...result,
            formattedMenu,
            data: {
              ...result.data,
              todayMenu: organizedTodayMenu,
              weekMenu: undefined,
              formattedMenu,
            },
          }
        } else if (!result.success && result.error) {
          const dateRange = await getAvailableDateRange(hostelType, messType)
          if (dateRange) {
            return {
              ...result,
              message: `${result.message} Available menu dates: ${dateRange.start} to ${dateRange.end}`,
              availableDateRange: dateRange,
            }
          }
        }

        return result
      },
    }),

    queryVTOP: tool({
      description:
        "Access VTOP (VIT's official portal) to get PERSONAL student data that requires login authentication. Use ONLY for individual student information like personal grades, attendance, timetable, marks, hostel info, library dues, exam schedules, digital assignments, and course materials. DO NOT use for general VIT information already available in knowledge base (like admission requirements, grading system explanation, campus facilities, exam patterns, etc.). This tool automatically handles credential authentication and interactive command prompts through intelligent defaults. For course materials, it supports smart natural language queries like 'anuj kumar's fluid mechanics notes' or 'week 5 assignments'. Use this tool ONLY when users request their PERSONAL VTOP data - credentials will be prompted securely.",
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
          .describe(
            "VTOP command to execute - marks (semester marks), grades (semester grades), attendance (attendance %), timetable (class schedule), receipts (fee receipts), hostel (hostel info), cgpa (CGPA details), exams/exam-schedule (the user's exam timetable), library-dues (library fines), nightslip (nightslip status), leave/leave-status (leave applications), msg/class-message (class announcements), da (digital assignments), facility (facility booking), syllabus (course syllabus), course-page (intelligent course materials with smart matching)"
          ),
        username: z
          .string()
          .optional()
          .describe(
            'VTOP username/registration number. Will be prompted securely if not provided.'
          ),
        password: z
          .string()
          .optional()
          .describe('VTOP password. Will be prompted securely if not provided.'),
        semester: z
          .number()
          .optional()
          .describe(
            'Semester number (1-8) for commands like marks, grades, calendar. Not needed for timetable, attendance (always use latest, specify latest always). If not specified, user will be prompted to select from available semesters.'
          ),
        semesterQuery: z
          .string()
          .optional()
          .describe(
            "Text description of semester to search for (e.g., 'summer semester', 'fall 2024', 'current semester', 'latest'). Used for intelligent semester matching."
          ),
        course: z
          .number()
          .optional()
          .describe(
            'Course selection number for course-page command. Defaults to first course (1) if not specified.'
          ),
        faculty: z
          .number()
          .optional()
          .describe(
            'Faculty selection number for course-page command. Defaults to first faculty (1) if not specified.'
          ),
        classGroup: z
          .number()
          .optional()
          .describe(
            'Class group number for calendar command. Defaults to first group (1) if not specified.'
          ),
        fuzzyIndex: z.number().optional().describe('Fuzzy search index for course-page command'),
        courseQuery: z
          .string()
          .optional()
          .describe(
            "Course search query for syllabus command, or natural language course description for smart course-page matching - e.g., 'fluid mechanics', 'data structures', 'computer networks'"
          ),
        facultyQuery: z
          .string()
          .optional()
          .describe(
            "Natural language faculty description for smart course-page matching - e.g., 'anuj kumar', 'dr. smith', 'professor with morning classes'"
          ),
        materialQuery: z
          .string()
          .optional()
          .describe(
            "Natural language material description for smart course-page selection - e.g., 'lecture notes from week 5', 'all assignments', 'mid-term study materials'"
          ),
        interactiveStep: z
          .enum(['semester', 'course', 'faculty', 'materials', 'smart-search', 'download'])
          .optional()
          .describe(
            'For course-page command: specify which step of the interactive workflow to execute. Auto-determined based on provided parameters if not specified.'
          ),
        debug: z.boolean().optional().describe('Enable debug mode for troubleshooting'),
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
                username: user,
                password: pass,
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
            const requestBody: VtopRequestBody = {
              command,
              username: user,
              flags,
            }
            if (pass.includes(':::')) {
              const [encryptedPassword, sessionKey] = pass.split(':::')
              requestBody.encryptedPassword = encryptedPassword
              requestBody.sessionKey = sessionKey
            } else {
              requestBody.password = pass
            }

            const response = await fetch(`${PROXY_URL}/vtop`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
            })

            if (!response.ok) {
              const errorData = vtopErrorResponseSchema.parse(
                await response.json().catch(() => ({}))
              )
              const errorMsg =
                typeof errorData === 'object' &&
                'error' in errorData &&
                typeof errorData.error === 'string'
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
            } else {
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
              continue
            }
          } catch (error: any) {
            lastError = {
              success: false,
              error: error.message || 'Network error',
              message:
                'Unable to connect to VTOP proxy service. Please ensure the service is running.',
              suggestion: 'The VTOP proxy service may be offline. Please try again later.',
            }
            attempt++
            continue
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
    }),

    searchRedditKnowledge: tool({
      description:
        'Search the Reddit knowledge base for student and academic information from various educational subreddits. This provides AI-powered responses based on community-validated information from students about studying, courses, exams, college life, and academic advice.',
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            'The search query for finding relevant information from Reddit discussions about academics, studying, college life, etc.'
          ),
      }),
      execute: async ({ query }) => {
        try {
          const results = await searchRedditKnowledge(query)

          return {
            success: results.success,
            response: results.response,
            sources: results.sources || [],
            confidence: results.confidence || 0,
            totalResults: results.totalResults || 0,
            searchAttempts: results.searchAttempts || 1,
            refinedQueries: results.refinedQueries || [],
            serviceUsed: results.serviceUsed || 'agentic',
            message: results.success
              ? `Found ${results.totalResults} relevant discussions using ${results.searchAttempts} search attempt${results.searchAttempts > 1 ? 's' : ''}`
              : results.message,
            note: results.success
              ? 'Response based on Reddit discussions. Might be inaccurate.'
              : 'Unable to find relevant information in the Reddit knowledge base.',
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message || 'Failed to search Reddit knowledge base',
            message:
              'Unable to access the Reddit knowledge base. The service may be temporarily unavailable.',
            suggestion: 'Please try again later or check if the Reddit scraper service is running.',
          }
        }
      },
    }),

    searchRedditWithContext: tool({
      description:
        'Search Reddit with enhanced capabilities to handle trending topics and broader queries about current events, popular discussions, and more. This combines trending topic retrieval with the knowledge base search for comprehensive results.',
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            'The search query for finding relevant information from Reddit discussions, or broad queries about current trends and popular topics.'
          ),
      }),
      execute: async ({ query }) => {
        try {
          const results = await searchRedditWithContext(query)

          return {
            success: results.success,
            response: results.response,
            sources: results.sources || [],
            trending: (results as any).trending || [],
            confidence: results.confidence || 0,
            totalResults: results.totalResults || 0,
            isBroadQuery: (results as any).isBroadQuery || false,
            message: results.success
              ? `Found ${results.totalResults} relevant discussions${(results as any).trending?.length ? ` and ${(results as any).trending.length} trending topics` : ''}`
              : results.message,
            note: results.success
              ? 'Response includes trending topics and recent discussions. Higher confidence indicates more relevant source material.'
              : 'Unable to find relevant information in the Reddit knowledge base.',
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message || 'Failed to search Reddit',
            message: 'Unable to access Reddit. The service may be temporarily unavailable.',
            suggestion: 'Please try again later or check if the Reddit scraper service is running.',
          }
        }
      },
    }),

    getRedditOverview: tool({
      description:
        'Get an overview of Reddit activity and trending topics. This provides insights into popular discussions, recent trends, and overall Reddit activity related to VIT and other educational topics.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const overview = await getRedditOverview()

          return {
            success: overview.success,
            trending: overview.trending || [],
            stats: overview.stats || {},
            summary: overview.summary || '',
            message: overview.success
              ? 'Successfully retrieved Reddit overview data'
              : overview.error,
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message || 'Failed to get Reddit overview',
            message:
              'Unable to access Reddit overview. The service may be temporarily unavailable.',
            suggestion: 'Please try again later or check if the Reddit scraper service is running.',
          }
        }
      },
    }),

    getCampusInfo: tool({
      description: `Get information about VIT-Vellore campus blocks (SJT, TT, SMV, MB, etc.).  
  Use it to answer: “where is TT?”, “what is GDN used for?”, “which departments sit in Gandhi Block?”.  
  The tool returns a concise description, typical usage, and a quick location cue.`,
      inputSchema: z.object({
        block: z.string().describe('Block / building code: e.g. SJT, TT, SMV, MB'),
      }),
      execute: async ({ block }) => {
        const maps = (q: string) =>
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            `${q} VIT Vellore`
          )}`

        const info = {
          sjt: {
            name: 'SJT (Silver Jubilee Tower)',
            description:
              "13-storey landmark built for VIT's silver jubilee, filled with high-end computing labs and project spaces.",
            usage:
              'Senior-year Computer Science (SCSE/SITE) lectures, research labs, Exam Cell and the busy SJT food court.',
            location:
              'Along Jimmy Carter Road, just east of Technology Tower, near to the SJT Foodys and a little food court, also has Dominos',
            note: 'Top floors give an unbeatable panoramic view of the campus.',
            mapsUrl: maps('SJT'),
          },

          tt: {
            name: 'TT (Technology Tower)',
            description:
              'Seven-floor tower with smart lecture theatres and roof terrace viewing deck.',
            usage:
              'Base for the School of Electrical Engineering (SELECT) and the new Computer Science + Electrical Eng. major; power-systems, nanotech and photonics labs.',
            location:
              'West of SJT on Jimmy Carter Road, overlooking VIT Lake (upper floors offer the best skyline shots).',
            note: 'Popular sunset spot; ground floor café opens till late.',
            mapsUrl: maps('Technology Tower'),
          },

          prp: {
            name: 'PRP (Pearl Research Park)',
            description: 'G+7 research & teaching complex geared towards industry collaboration.',
            usage:
              'First-year CSE classrooms, start-up incubator suites and multidisciplinary R-&-D centres.',
            location: 'South-east of SJT, between Jimmy Carter Road and Gandhi Block.',
            note: 'Most CSE freshers have their initial semesters here before moving to SJT.',
            mapsUrl: maps('Pearl Research Park'),
          },

          gdn: {
            name: 'GDN (G. D. Naidu Block)',
            description: 'Oldest block on campus, packed with heavy engineering workshops.',
            usage:
              'Mechanical & Manufacturing Engg. labs (machine, welding, foundry, metrology) plus core first-year workshops.',
            location:
              'Right beside the All Mart shopping complex; Main Canteen faces its front; a short walk south of Main Building.',
            note: 'Expect the buzz of lathes and the smell of cutting oil all day.',
            mapsUrl: maps('G D Naidu Block'),
          },

          smv: {
            name: 'SMV (Sir M. Visvesvaraya Block)',
            description: 'Iconic hexagon (“Hexagon”) building with airy corridors and wet-labs.',
            usage:
              'Chemical, Biotechnology & Food-Tech classrooms and labs, along with a few postgraduate offices.',
            location: "Opposite the Woody's entrance and a minute's walk from Foodys junction.",
            note: 'Every side looks the same—easy to get disoriented at first!',
            mapsUrl: maps('SMV Block'),
          },

          cdmm: {
            name: 'CDMM (Centre for Disaster Mitigation & Management)',
            description:
              'Specialised research block for geo-hazard modelling and structural resilience. Disaster and Waste Management course occurs here',
            usage: 'Structural, geotechnical, remote-sensing & GIS labs plus consultancy offices.',
            location: 'Adjacent to Main Building and sharing the northern driveway with GDN.',
            note: 'Houses the campus shake-table used for earthquake simulations.',
            mapsUrl: maps('CDMM'),
          },

          cbmr: {
            name: 'CBMR (Centre for Biomaterials & Biomedical Research)',
            description:
              'Life-sciences block featuring GMP-grade tissue-culture and 3-D bioprinting suites. Some faculties have their offices here.',
            usage: 'Biomedical & molecular research labs and SBST conference spaces.',
            location: 'In the bio-cluster lane at the rear of SMV.',
            note: 'Favoured by biotech start-ups for joint prototype work.',
            mapsUrl: maps('CBMR'),
          },

          mb: {
            name: 'MB (Main Building / Dr. M. G. R Block)',
            description:
              '3-storey administrative hub with administrative offices, a basement, the Channa Reddy auditorium. ',
            usage:
              'Chancellor, Registrar, Admissions, Finance and first year mechanical engineering classes.',
            location: 'Immediately through the main gate, facing the fountain round-about.',
            note: 'All official paperwork starts here—carry your ID.',
            mapsUrl: maps('Main Building VIT'),
          },

          gandhi: {
            name: 'Gandhi Block',
            description:
              'Energy-efficient studio complex with deep balconies, open classrooms and radiant cooling.',
            usage:
              'Home of V-SPARC (Architecture) and VSIGN (Design); architecture studios, model workshops and a 450-seat auditorium.',
            location:
              "It's the farthest block, right next to PRP, at the south-west corner of campus.",
            note: 'It is a very pretty block honestly, but it is the farthest in the campus from the main gate.',
            mapsUrl: maps('Gandhi Block'),
          },

          alm: {
            name: 'ALM (A. L. Mudaliar Block)',
            description:
              'Science & health-services block that doubles as the campus Health Centre.',
            usage:
              'Physics, Chemistry, Microbiology labs and the 24*7 outpatient clinic & pharmacy.',
            location: 'South-west of MB, near the visitor parking and athletics ground.',
            note: 'Emergency ambulance bay operates round-the-clock.',
            mapsUrl: maps('ALM Block'),
          },
        } as const

        const key = block.trim().toLowerCase() as keyof typeof info
        if (key in info) {
          const blockInfo = info[key]
          return {
            success: true,
            ...blockInfo,
            message: `${blockInfo.description} ${blockInfo.usage} ${blockInfo.location}`,
            mapsUrl: blockInfo.mapsUrl,
          }
        }
        return {
          success: false,
          message: `No information found for “${block}”. Try one of: ${Object.keys(info)
            .map(k => k.toUpperCase())
            .join(', ')}.`,
        }
      },
    }),

  }
}

function getLevenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1 // substitution
        )
      }
    }
  }
  return matrix[a.length][b.length]
}

function normalizeString(str?: string): string {
  return (str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
