import { tool } from 'ai'
import { z } from 'zod'
import { scrapePapersCodeChef } from './scrapers/papers-codechef'
import { scrapeVITPaperVault } from './scrapers/vit-papervault'
import { scrapeFacultyInfo } from './scrapers/faculty-scraper'
import { scrapePlacementInfo } from './scrapers/placement-scraper'
import { getMessMenu, formatMenuItems, getAvailableDateRange } from './scrapers/mess-menu-scraper'
import { getCourseCode } from './question-generator'

// Helper function to organize menu items by meal type
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
      // Clean and split menu items
      const cleanedItems = item.menu
        .split(',')
        .map(menuItem => menuItem.trim())
        .filter(menuItem => menuItem.length > 0 && !menuItem.match(/^[B,J\s]*$/))
        .map(menuItem => menuItem.charAt(0).toUpperCase() + menuItem.slice(1).toLowerCase())

      mealTypes[mealType].push(...cleanedItems)
    }
  })

  // Remove empty meal types
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
  } = params

  let step = interactiveStep
  if (!step) {
    if (courseQuery && facultyQuery && materialQuery) {
      step = 'semester'
    } else if (courseQuery && facultyQuery) {
      step = 'semester'
    } else if (courseQuery) {
      step = 'semester'
    } else {
      if (!semester) {
        step = 'semester'
      } else if (!course) {
        step = 'course'
      } else if (!faculty) {
        step = 'faculty'
      } else {
        step = 'materials'
      }
    }
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

  if (semesterQuery) requestBody.flags.semesterQuery = semesterQuery
  if (courseQuery) requestBody.flags.courseQuery = courseQuery
  if (facultyQuery) requestBody.flags.facultyQuery = facultyQuery
  if (materialQuery) requestBody.flags.materialQuery = materialQuery

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
            if (mappedCode) resolvedCourseCode = mappedCode
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

    getFacultyInfo: tool({
      description: 'get current faculty information from VIT official websites',
      parameters: z.object({
        department: z
          .string()
          .optional()
          .describe('department like computer science, mechanical, electronics'),
        facultyName: z.string().optional().describe('specific faculty member name'),
      }),
      execute: async ({ department, facultyName }) => scrapeFacultyInfo(department, facultyName),
    }),

    getPlacementInfo: tool({
      description:
        'get latest placement statistics and company information from VIT Placements Tracker',
      parameters: z.object({
        year: z.string().optional().describe('academic year like 2024-25, 2023-24'),
        companyFilter: z
          .string()
          .optional()
          .describe('filter results by company name (case-insensitive substring match)'),
      }),
      execute: async ({ year, companyFilter }) => scrapePlacementInfo(year, companyFilter),
    }),

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
        // Handle relative dates like 'today', 'tomorrow'
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
          // Transform the menu structure for UI display
          const organizedTodayMenu = organizeMenuByMealType(result.data.todayMenu.menu)

          // For week menu, we only want to show today's organized menu, not the entire week
          // The UI component expects a single menu structure, not an array of daily menus

          // Format the response with properly formatted menu items
          const formattedMenu = formatMenuItems(result.data.todayMenu.menu)

          return {
            ...result,
            formattedMenu,
            data: {
              ...result.data,
              todayMenu: organizedTodayMenu,
              // Remove weekMenu since it causes rendering issues and is not needed for the current UI
              weekMenu: undefined,
              formattedMenu,
            },
          }
        } else if (!result.success && result.error) {
          // If there's an error, try to get available date range to help user
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
      execute: async ({
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
      }) => {
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
  }
}
