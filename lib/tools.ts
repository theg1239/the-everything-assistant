import { tool } from 'ai'
import { z } from 'zod'
import { scrapePapersCodeChef } from './scrapers/papers-codechef'
import { scrapeVITPaperVault } from './scrapers/vit-papervault'
import { scrapeFacultyInfo } from './scrapers/faculty-scraper'
import { scrapePlacementInfo } from './scrapers/placement-scraper'
import { getMessMenu, formatMenuItems, getAvailableDateRange } from './scrapers/mess-menu-scraper'
import { getCourseCode } from './question-generator'
import { 
  findFullCourseName, 
  searchCoursesByName, 
  getAllCourseMatches, 
  recognizeCourseInText 
} from './course-map'

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

    const data = await response.json()
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

    const data = await response.json()
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

    const data = await response.json()
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

    const trending = trendingResponse.ok ? (await trendingResponse.json()).trending || [] : []
    const stats = statsResponse.ok ? (await statsResponse.json()).stats || {} : {}

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

async function searchRedditWithContext(query: string) {
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
        searchRedditKnowledge('VIT college life discussions recent trends'),
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
    // console.log('Determining step - semester:', semester, 'course:', course, 'faculty:', faculty)
    // console.log(
    //   'Contextual queries - semester:',
    //   contextualSemesterQuery,
    //   'course:',
    //   contextualCourseQuery
    // )

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
        // console.log('Have semesterQuery but no semester number, staying on semester step')
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

        // console.log('Semester selection debug:')
        // console.log('- previousStepType:', previousStepType)
        // console.log('- last message content:', messages?.[messages.length - 1]?.content)
        // console.log('- shouldCompleteSemesterSelection:', shouldCompleteSemesterSelection)
        // console.log('- userJustSelectedSemester:', userJustSelectedSemester)
        // console.log('- semesterAutoResolved:', semesterAutoResolved)

        if (shouldCompleteSemesterSelection || userJustSelectedSemester) {
          // console.log('Completing semester selection, staying on semester step')
          step = 'semester'
        } else if (semesterAutoResolved) {
          // console.log(
          //   'Semester was auto-resolved from query, staying on semester step to show selection'
          // )
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
    // console.log('Determined step:', step)
  }

  const PROXY_URL = process.env.VTOP_PROXY_URL || 'http://localhost:3001'

  let requestBody: any = {
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
    // console.log('Using contextual semester query:', contextualSemesterQuery)
  }
  if (contextualCourseQuery) {
    requestBody.flags.courseQuery = contextualCourseQuery
    // console.log('Using contextual course query:', contextualCourseQuery)
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
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: `VTOP interactive request failed: ${response.status}`,
        message: errorData.error || `Failed to execute ${step} step`,
        details: errorData,
      }
    }

    const result = await response.json()

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
        primary: matches[0]
      }
    }
    return {
      success: false,
      query: input,
      matches: [],
      primary: null
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
      totalFound: recognized.length + acronymMatches.length
    }
  }
}

export function createVITTools() {
  return {
    findPastPapers: tool({
      description:
        'find past examination papers for VIT courses from real repositories. You can use course names or codes.',
      parameters: z.object({
        courseCode: z
          .string()
          .describe("course code like BCSE302L or course name like 'database systems'"),
        examType: z.string().optional().describe('exam type: cat1, cat2, fat, quiz'),
        year: z.string().optional().describe('academic year like 2023, 2022'),
      }),
      execute: async ({ courseCode, examType, year }) => {
        try {
          let resolvedCourseCode = courseCode.trim().toUpperCase()

          if (!/^[A-Z]{4}\d{3}[A-Z]?$/.test(resolvedCourseCode)) {
            const mappedCode = getCourseCode(courseCode)
            if (mappedCode) {
              resolvedCourseCode = mappedCode
            } else {
              const courseMatches = getAllCourseMatches(courseCode)
              if (courseMatches.length > 0) {
                resolvedCourseCode = courseMatches[0].code
              }
            }
          }

          const results = await Promise.allSettled([
            scrapePapersCodeChef(resolvedCourseCode, examType, year),
            scrapeVITPaperVault(resolvedCourseCode, examType, year),
          ])

          const papers: any[] = []
          const sources: any[] = []

          results.forEach(r => {
            if (r.status === 'fulfilled' && r.value.success) {
              papers.push(...r.value.papers)
              sources.push(r.value.source)
            }
          })

          if (papers.length === 0) {
            return {
              success: false,
              courseCode,
              papers: [],
              message: `no papers found for ${courseCode}${
                examType ? ` (${examType})` : ''
              }${year ? ` from ${year}` : ''}. try checking the course code or contact faculty for materials.`,
              suggestions: [
                'verify the course code format (e.g., CSE1001, MAT1001)',
                'check with course faculty for official materials',
                'visit VIT library for physical copies',
                'contact senior students or study groups',
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

    // getFacultyInfo: tool({
    //   description: 'get current faculty information from VIT official websites',
    //   parameters: z.object({
    //     department: z
    //       .string()
    //       .optional()
    //       .describe('department like computer science, mechanical, electronics'),
    //     facultyName: z.string().optional().describe('specific faculty member name'),
    //   }),
    //   execute: async ({ department, facultyName }) => scrapeFacultyInfo(department, facultyName),
    // }),

    // getPlacementInfo: tool({
    //   description:
    //     'get latest placement statistics and company information from VIT Placements Tracker',
    //   parameters: z.object({
    //     year: z.string().optional().describe('academic year like 2024-25, 2023-24'),
    //     companyFilter: z
    //       .string()
    //       .optional()
    //       .describe('filter results by company name (case-insensitive substring match)'),
    //   }),
    //   execute: async ({ year, companyFilter }) => scrapePlacementInfo(year, companyFilter),
    // }),

    getMessMenu: tool({
      description:
        "get mess menu for VIT hostels (both men's and ladies' hostels). Use this when users ask about mess menu, today's food, what's for lunch/dinner/breakfast/snacks, tomorrow's menu, etc. Covers special mess, veg mess, and non-veg mess for both hostels. IMPORTANT: Always ask the user to specify hostelType and messType if not provided.",
      parameters: z.object({
        hostelType: z
          .enum(['mens', 'ladies'])
          .describe(
            "REQUIRED: type of hostel: mens (men's hostel) or ladies (ladies' hostel). Must be specified by user."
          ),
        messType: z
          .enum(['special', 'veg', 'nonveg'])
          .describe(
            'REQUIRED: type of mess: special (premium food), veg (vegetarian), or nonveg (non-vegetarian). Must be specified by user.'
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
        "Access VTOP (VIT's official portal) to get student information like grades, attendance, timetable, profile, marks, hostel info, library dues, exam schedules, and more. This tool automatically handles credential authentication and interactive command prompts through intelligent defaults. For course materials, it supports smart natural language queries like 'anuj kumar's fluid mechanics notes' or 'week 5 assignments'. Use this tool whenever users request VTOP data - credentials will be prompted securely.",
      parameters: z.object({
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
            'calendar',
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
            'VTOP command to execute - profile (student info), marks (semester marks), grades (semester grades), attendance (attendance %), timetable (class schedule), receipts (fee receipts), hostel (hostel info), cgpa (CGPA details), exams/exam-schedule (exam timetable), library-dues (library fines), calendar (academic calendar), nightslip (nightslip status), leave/leave-status (leave applications), msg/class-message (class announcements), da (digital assignments), facility (facility booking), syllabus (course syllabus), course-page (intelligent course materials with smart matching)'
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
            'Semester number (1-8) for commands like marks, grades, attendance, timetable, exams, calendar. If not specified, user will be prompted to select from available semesters.'
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
        try {
          if (!username || !password) {
            return {
              success: false,
              error: 'VTOP credentials required',
              requiresCredentials: true,
              command,
              message: 'Please provide your VTOP username and password to access VTOP data.',
            }
          }

          if (command === 'course-page') {
            return await handleIntelligentCoursePage({
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
              messages: context?.messages || [],
            })
          }

          const flags: Record<string, any> = {}

          if (semester !== undefined) flags.semester = semester
          if (semesterQuery) flags.semesterQuery = semesterQuery
          if (course !== undefined) flags.course = course
          if (faculty !== undefined) flags.faculty = faculty
          if (classGroup !== undefined) flags.classGroup = classGroup
          if (fuzzyIndex !== undefined) flags.fuzzyIndex = fuzzyIndex
          if (courseQuery) flags.course = courseQuery
          if (debug) flags.debug = debug

          const PROXY_URL = process.env.VTOP_PROXY_URL || 'http://localhost:3001'

          let requestBody: any = {
            command,
            username,
            flags,
          }

          if (password.includes(':::')) {
            const [encryptedPassword, sessionKey] = password.split(':::')
            requestBody.encryptedPassword = encryptedPassword
            requestBody.sessionKey = sessionKey
          } else {
            requestBody.password = password
          }

          const response = await fetch(`${PROXY_URL}/vtop`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            return {
              success: false,
              error: `VTOP request failed: ${response.status}`,
              message: errorData.error || `Failed to execute ${command} command`,
              details: errorData,
            }
          }

          const result = await response.json()

          if (result.success) {
            return {
              success: true,
              command,
              data: result.data || result.output,
              message: `Successfully retrieved ${command} data from VTOP`,
              raw: result.raw || false,
            }
          } else {
            return {
              success: false,
              error: result.error || 'Unknown error',
              message: `Failed to retrieve ${command} data from VTOP`,
              command,
            }
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message || 'Network error',
            message:
              'Unable to connect to VTOP proxy service. Please ensure the service is running.',
            suggestion: 'The VTOP proxy service may be offline. Please try again later.',
          }
        }
      },
    }),

    searchRedditKnowledge: tool({
      description:
        'Search the Reddit knowledge base for student and academic information from various educational subreddits. This provides AI-powered responses based on community-validated information from students about studying, courses, exams, college life, and academic advice.',
      parameters: z.object({
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
      parameters: z.object({
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
      parameters: z.object({}),
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


  }
}
