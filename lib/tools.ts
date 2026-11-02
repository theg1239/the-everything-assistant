import { tool } from 'ai'
import { searchTool, extractTool } from '@parallel-web/ai-sdk-tools'
import * as z from 'zod'
import { scrapePapersCodeChef } from './scrapers/papers-codechef'
import { scrapePapersService } from './scrapers/papers-scraper'
import { scrapeVITPaperVault } from './scrapers/vit-papervault'
import { scrapeExamCooker } from './scrapers/examcooker'
import { EXAM_TYPES } from './scrapers/exam-type'
import { scrapePlacementInfo } from './scrapers/placement-scraper'
import { getMessMenu, formatMenuItems, getAvailableDateRange } from './scrapers/mess-menu-scraper'
import {
  DEFAULT_COURSE_SEARCH_LIMIT,
  MAX_COURSE_SEARCH_LIMIT,
  getCourseByCode,
  isCourseCodeFormat,
  normalizeCourseCode,
  searchCourseCatalog,
} from './course-map'
import { getCourseData, School } from './ffcs-tool'
import { createKnowledgeTools } from './knowledge-tools'
import { createMemoryTool } from './memory/memory-tools'
import { createFeedbackIssue } from './feedback'
import { getVTOPCredentialsForUser } from './vtop-credential-store'
import {
  VtopProxyUnavailableError,
  callVtopProxy,
  vtopProxyResultSchema,
  type VtopCredentialFields,
  type VtopProxyResult,
} from './vtop-proxy'
import { buildVtopFlags, queryVTOPInputSchema, toQueryVTOPResult } from './vtop-tool'
import { getUserMcpToken, refreshUserMcpToken, isExpired as isMcpExpired } from './mcp-tokens'
import { createMusicPlayerTool, type MusicPlayerToolState } from './music-player-tool'
import { memoizeAsync, publicAssetUrl } from './static-data'
import type {
  FacultyCourseRecord,
  FacultyResultEntry,
  FacultySchoolRecord,
  JsonValue,
  SyllabusEntry,
} from '@/types/tools'

type ParsedPlacementData = {
  formatted_content: string
  summary: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

/** `message` of a thrown value (Error or error-like object), if it has one. */
const getErrorMessage = (error: unknown): string | undefined =>
  isRecord(error) ? readString(error.message) : undefined

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

/** Deep-search (Reddit) API requires a bearer secret when DEEP_SEARCH_API_SECRET is set. */
const redditApiHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(process.env.DEEP_SEARCH_API_SECRET
    ? { Authorization: `Bearer ${process.env.DEEP_SEARCH_API_SECRET}` }
    : {}),
})

const redditAskResponseSchema = z.object({
  success: z.boolean(),
  response: z.string().optional(),
  sources: z.array(jsonValueSchema).optional(),
  confidence: z.number().optional(),
  totalResults: z.number().optional(),
  searchResults: z.number().optional(),
  searchAttempts: z.union([z.number(), z.array(z.unknown())]).optional(),
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
  stats: z.record(z.string(), z.number().optional()).optional(),
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

/** Per-call tool tracing; off unless CHAT_DEBUG=true (these run on the chat hot path). */
const debugLog = (...args: unknown[]) => {
  if (process.env.CHAT_DEBUG === 'true') console.debug(...args)
}

/** `public/faculty.json` (~520 KB), fetched and validated once per instance. */
const loadFacultyData = memoizeAsync(async (): Promise<FacultyData> => {
  const res = await fetch(publicAssetUrl('/faculty.json'))
  if (!res.ok) throw new Error('Could not load faculty.json')
  return facultyDataSchema.parse(await res.json())
})

class SyllabiLoadError extends Error {
  constructor(readonly status: number) {
    super(`Could not load syllabi.json (${status})`)
  }
}

/** `public/syllabi.json`, fetched and filtered to well-formed entries once per instance. */
const loadSyllabusEntries = memoizeAsync(async (): Promise<SyllabusEntry[]> => {
  const res = await fetch(publicAssetUrl('/syllabi.json'))
  if (!res.ok) throw new SyllabiLoadError(res.status)
  const data: unknown = await res.json()
  // Keep only entries that are a filename or a `{ code, title, file }` record.
  return Array.isArray(data)
    ? data.flatMap(entry => {
        const parsedEntry = syllabusEntrySchema.safeParse(entry)
        return parsedEntry.success ? [parsedEntry.data] : []
      })
    : []
})

type McpClientConfig = {
  endpoint?: string
  accessToken?: string
  clientName?: string
}

type VITToolsOptions = {
  channel?: 'web' | 'whatsapp' | 'discord' | 'hub' | string
  mcp?: McpClientConfig
  sessionUser?: { name?: string | null; email?: string | null; isGuest?: boolean }
  musicPlayerState?: MusicPlayerToolState | null
}

const mcpFailure = (error: string, errorKind = 'mcp_error'): VtopProxyResult => ({
  success: false,
  status: 'error',
  error,
  errorKind,
  message: error,
})

/**
 * Calls one VTOP proxy MCP tool (a command name or `vtop-continue`) and validates the
 * structured result. Returns null when MCP isn't configured for this caller.
 */
async function callVtopViaMcp(options: {
  toolName: string
  args: Record<string, JsonValue>
  mcp: McpClientConfig
}): Promise<VtopProxyResult | null> {
  const { toolName, args, mcp } = options

  if (!mcp?.endpoint || !mcp?.accessToken) return null

  const endpoint = mcp.endpoint.replace(/\/$/, '')
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${mcp.accessToken}`,
    Accept: 'application/json, text/event-stream',
  }

  const initRes = await fetch(endpoint, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `init-${Date.now()}`,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: mcp.clientName || 'vit-whatsapp-bot', version: '1.0.0' },
      },
    }),
  })

  if (!initRes.ok) {
    console.error('MCP initialize failed', { status: initRes.status })
    throw new Error(`MCP initialize failed (${initRes.status})`)
  }

  const sessionId =
    initRes.headers.get('Mcp-Session-Id') || initRes.headers.get('mcp-session-id') || undefined
  const callHeaders = { ...baseHeaders, ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) }

  const callRes = await fetch(endpoint, {
    method: 'POST',
    headers: callHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `call-${Date.now()}`,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  })

  const rpc: unknown = await callRes.json().catch(() => null)

  if (sessionId) {
    fetch(endpoint, { method: 'DELETE', headers: callHeaders }).catch(() => {})
  }

  const rpcRecord = isRecord(rpc) ? rpc : {}
  if (!callRes.ok || isRecord(rpcRecord.error)) {
    const rpcError = isRecord(rpcRecord.error) ? rpcRecord.error : {}
    const message = readString(rpcError.message) || `MCP call failed: ${callRes.status}`
    console.error('MCP call failed', { status: callRes.status, message })
    return mcpFailure(message, callRes.status === 401 ? 'unauthorized' : 'mcp_error')
  }

  const result = isRecord(rpcRecord.result) ? rpcRecord.result : null
  const structured = result?.structuredContent
  const parsed = vtopProxyResultSchema.safeParse(structured)
  if (parsed.success) return parsed.data

  // Older servers only return JSON text content.
  const content = Array.isArray(result?.content) ? result.content : []
  const first: unknown = content[0]
  const text = isRecord(first) ? readString(first.text) : undefined
  if (text) {
    try {
      const fromText = vtopProxyResultSchema.safeParse(JSON.parse(text))
      if (fromText.success) return fromText.data
    } catch {
      return mcpFailure(text)
    }
  }
  return mcpFailure('Invalid MCP response shape', 'protocol_error')
}

const VTOP_CREDENTIALS_REQUIRED = (command: string) => ({
  success: false,
  status: 'error',
  error: 'VTOP credentials required',
  requiresCredentials: true,
  command,
  message: 'Please link your VTOP account to access VTOP data.',
})

const SCHOOL_VALUES: School[] = [
  'smec',
  'score',
  'scope',
  'sbst',
  'sce',
  'scheme',
  'select',
  'sense',
]

const toSchool = (value: string): School | null => {
  const normalized = value.toLowerCase()
  return SCHOOL_VALUES.find(school => school === normalized) ?? null
}

async function searchRedditKnowledge(query: string, limit: number = 10) {
  try {
    const apiUrl = process.env.REDDIT_API_URL || 'http://localhost:3002'
    const response = await fetch(`${apiUrl}/api/ask`, {
      method: 'POST',
      headers: redditApiHeaders(),
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      throw new Error(`Reddit knowledge base service unavailable: ${response.status}`)
    }

    const data = redditAskResponseSchema.parse(await response.json())
    if (data.success) {
      const attempts = Array.isArray(data.searchAttempts)
        ? data.searchAttempts.length
        : data.searchAttempts || 1

      return {
        success: true,
        response: data.response,
        sources: data.sources || [],
        confidence: data.confidence || 0,
        totalResults: data.searchResults || 0,
        searchAttempts: attempts,
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
      headers: redditApiHeaders(),
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
      headers: redditApiHeaders(),
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
      fetch(`${apiUrl}/api/trending`, { headers: redditApiHeaders() }),
      fetch(`${apiUrl}/api/stats`, { headers: redditApiHeaders() }),
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

/** Shared shape of the Reddit search helpers' results (fields vary by path). */
type RedditSearchResult = {
  success: boolean
  response?: string
  sources?: JsonValue[]
  trending?: string[]
  confidence?: number
  totalResults?: number
  isBroadQuery?: boolean
  searchAttempts?: number
  refinedQueries?: string[]
  serviceUsed?: string
  message?: string
  error?: string
}

/**
 * Reddit knowledge-base search, optionally combined with the trending-topics feed. Whether to
 * include trending topics is an explicit caller decision (`includeTrending`), never inferred
 * from the query text.
 */
export async function searchRedditWithContext(
  query: string,
  { includeTrending = false }: { includeTrending?: boolean } = {}
): Promise<RedditSearchResult> {
  try {
    if (!includeTrending) return await searchRedditKnowledge(query)

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
  } catch (error) {
    console.error('Error in contextual Reddit search:', error)
    return {
      success: false,
      error: getErrorMessage(error) || 'Failed to search Reddit',
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
    const mealItems = mealType ? mealTypes[mealType] : undefined
    if (mealItems) {
      const cleanedItems = item.menu
        .split(',')
        .map(menuItem => menuItem.trim())
        .filter(menuItem => menuItem.length > 0 && !menuItem.match(/^[B,J\s]*$/))
        .map(menuItem => menuItem.charAt(0).toUpperCase() + menuItem.slice(1).toLowerCase())

      mealItems.push(...cleanedItems)
    }
  })

  Object.keys(mealTypes).forEach(key => {
    if (mealTypes[key]?.length === 0) {
      delete mealTypes[key]
    }
  })

  return mealTypes
}

/** Case-insensitive substring test; an empty needle matches nothing. */
const containsText = (haystack: string | undefined, needle: string): boolean =>
  needle.length > 0 && (haystack ?? '').toLowerCase().includes(needle)

/**
 * Joins a faculty.json name to the FFCS dataset's FACULTY column (two data sources that format
 * the same name differently: "Dr. Anuj Kumar" vs "ANUJ KUMAR"). Data normalisation, not query
 * interpretation.
 */
const facultyJoinKey = (name: string | undefined) =>
  (name ?? '')
    .replace(/^Dr\.?\s*|\s+/g, '')
    .toLowerCase()
    .trim()

type FfcsCourse = Awaited<ReturnType<typeof getCourseData>>['allCourses'][number]

/** FFCS rows taught by `facultyName`, optionally restricted to a code/title substring. */
function coursesTaughtBy(
  facultyName: string,
  allCourses: FfcsCourse[],
  courseFilter: string | null
): FacultyCourseRecord[] {
  const key = facultyJoinKey(facultyName)
  if (!key) return []
  return allCourses
    .filter(course => {
      const courseKey = facultyJoinKey(course.FACULTY)
      const sameFaculty = courseKey.length > 0 && (courseKey.includes(key) || key.includes(courseKey))
      return (
        sameFaculty &&
        (!courseFilter ||
          containsText(course.TITLE, courseFilter) ||
          containsText(course.CODE, courseFilter))
      )
    })
    .map(course => ({
      code: course.CODE,
      title: course.TITLE,
      slot: course.SLOT,
      type: course.TYPE,
      venue: course.VENUE,
    }))
}

const SYLLABUS_BASE_URL = 'https://storage.googleapis.com/examcooker/syllabi/'
const SYLLABUS_MATCH_LIMIT = 10

type SyllabusCandidate = {
  filename: string
  code: string | null
  title: string | null
  url: string
}

/**
 * One syllabus index entry as `{ filename, code, title, url }`. Bare entries are filenames in
 * the index's `<CODE>_<Title_Words>.pdf` format, which is parsed for code and title.
 */
function syllabusCandidate(entry: SyllabusEntry): SyllabusCandidate[] {
  const fields: Exclude<SyllabusEntry, string> = typeof entry === 'string' ? { file: entry } : entry
  const filename = fields.file || fields.filename || (fields.code ? `${fields.code}.pdf` : '')
  if (!filename) return []
  const base = (filename.split('/').pop() || filename).replace(/\.[^.]+$/, '')
  const [codePart = '', titlePart = ''] = base.split(/_(.+)/)
  const parsedTitle = titlePart
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase())
  return [
    {
      filename,
      code: fields.code || codePart || null,
      title: fields.title || parsedTitle || null,
      url: `${SYLLABUS_BASE_URL}${filename}`,
    },
  ]
}

export function createVITTools(userId: string, options: VITToolsOptions = {}) {
  const toolOptions = options
  const mcpConfig = options.mcp
  const channel = options.channel
  const sessionUser = options.sessionUser

  const webTools =
    process.env.PARALLEL_API_KEY && process.env.PARALLEL_API_KEY.trim().length > 0
      ? {
          webSearch: searchTool,
          webExtract: extractTool,
        }
      : {}

  const findPastPapersInputSchema = z.object({
    courseCode: z
      .string()
      .describe(
        'Exact VIT course code, e.g. BCSE302L. If the user named the course some other way, call searchCourseCatalog first and use a code from its results.'
      ),
    examType: z
      .enum(EXAM_TYPES)
      .optional()
      .describe('Exam type filter. Omit for all exam types.'),
    year: z
      .string()
      .regex(/^\d{4}$/, 'year must be four digits, e.g. 2023')
      .optional()
      .describe('Calendar year filter, e.g. "2023". Omit for all years.'),
  })

  const feedbackSubmissionSchema = z.object({
    title: z
      .string()
      .min(3, 'include a short title for the feedback or bug report')
      .describe('short title for the feedback or bug report'),
    body: z
      .string()
      .min(10, 'include a clear description of the feedback or issue')
      .describe('detailed feedback, bug reproduction steps, or feature request'),
  })

  const kbContributionInputSchema = z.object({
    title: z.string().optional().describe('optional concise title for the knowledge-base update'),
    body: z
      .string()
      .min(20, 'include the proposed knowledge chunk or correction')
      .describe('the new knowledge content, correction, or source link'),
  })

  return {
    ...webTools,
    ...createKnowledgeTools(),
    ...createMemoryTool(userId),
    ...createMusicPlayerTool(options.musicPlayerState),
    // Disabled. To re-enable, import `generateImage` from 'ai', `imageModel` from './ai'
    // and `enforceUserRateLimit` from './user-rate-limiter'.
    // generateImage: tool({
    //   description:
    //     'Generate an image based on a text prompt using OpenAI GPT Image 2. Use this when users ask you to create, generate, draw, or make an image, picture, illustration, artwork, or visual content. The generated image will be returned as base64 data.',
    //   inputSchema: z.object({
    //     prompt: z
    //       .string()
    //       .min(3, 'Provide a description of the image you want to generate')
    //       .describe('A detailed description of the image to generate. Be specific about style, colors, composition, and subject matter for best results.'),
    //     aspectRatio: z
    //       .enum(['1:1', '16:9', '9:16', '4:3', '3:4'])
    //       .optional()
    //       .describe('Aspect ratio of the generated image. Defaults to 1:1 (square).'),
    //   }),
    //   execute: async ({ prompt, aspectRatio }) => {
    //     try {
    //       const startTime = Date.now()

    //       await enforceUserRateLimit(userId)
    //       const result = await generateImage({
    //         model: imageModel(),
    //         prompt,
    //         aspectRatio,
    //       })

    //       const duration = Date.now() - startTime
    //       console.log(`[generateImage] API call completed in ${duration}ms`)

    //       if (!result.image || !result.image.base64) {
    //         console.log('[generateImage] No image returned from API')
    //         return {
    //           success: false,
    //           error: 'No image was generated',
    //           message: 'The image generation model did not return an image. Please try again with a different prompt.',
    //         }
    //       }

    //       console.log('[generateImage] Image generated successfully')
    //       console.log('[generateImage] Image count:', result.images?.length || 1)
    //       console.log('[generateImage] Primary image MIME type:', result.image.mediaType || 'image/png')

    //       return {
    //         success: true,
    //         image: {
    //           base64: result.image.base64,
    //           mimeType: result.image.mediaType || 'image/png',
    //         },
    //         images: result.images?.map(img => ({
    //           base64: img.base64,
    //           mimeType: img.mediaType || 'image/png',
    //         })) || [{ base64: result.image.base64, mimeType: result.image.mediaType || 'image/png' }],
    //         prompt,
    //         aspectRatio: aspectRatio || '1:1',
    //         message: `Successfully generated image for: "${prompt}"`,
    //       }
    //     } catch (error) {
    //       const errorMessage = getErrorMessage(error) || 'Unknown error occurred'
    //       console.error('[generateImage] Error occurred:', errorMessage)
    //       console.error('[generateImage] Full error:', error)

    //       if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
    //         console.log('[generateImage] Rate limit error detected')
    //         return {
    //           success: false,
    //           error: 'Rate limit exceeded',
    //           message: 'Image generation rate limit reached. Please try again in a few moments.',
    //         }
    //       }

    //       if (errorMessage.includes('safety') || errorMessage.includes('blocked') || errorMessage.includes('policy')) {
    //         console.log('[generateImage] Content policy violation detected')
    //         return {
    //           success: false,
    //           error: 'Content policy violation',
    //           message: 'The prompt was blocked due to content safety policies. Please try a different prompt.',
    //         }
    //       }

    //       console.error('[generateImage] Unhandled error type')
    //       return {
    //         success: false,
    //         error: errorMessage,
    //         message: 'Failed to generate image. Please try again with a different prompt.',
    //       }
    //     }
    //   },
    // }),
    submitFeedback: tool({
      description:
        'file product feedback, feature requests, or bug reports directly from chat; creates a GitHub issue for maintainers.',
      inputSchema: feedbackSubmissionSchema,
      execute: async ({ title, body }) => {
        const result = await createFeedbackIssue(
          {
            type: 'feedback',
            title,
            body,
          },
          { id: userId, isGuest: sessionUser?.isGuest }
        )

        if (!result.success) {
          return { success: false, error: result.error, details: result.details }
        }

        return {
          success: true,
          issueUrl: result.issueUrl,
          message: 'feedback submitted to GitHub issues',
        }
      },
    }),
    contributeKnowledge: tool({
      description:
        'capture knowledge-base contributions or corrections from the user and open a GitHub issue so maintainers can review.',
      inputSchema: kbContributionInputSchema,
      execute: async ({ title, body }) => {
        const result = await createFeedbackIssue(
          {
            type: 'contribution',
            contribution: { title: title || 'knowledge update', body },
          },
          { id: userId, isGuest: sessionUser?.isGuest }
        )

        if (!result.success) {
          return { success: false, error: result.error, details: result.details }
        }

        return {
          success: true,
          issueUrl: result.issueUrl,
          message: 'knowledge contribution logged for review',
        }
      },
    }),
    findPastPapers: tool({
      description:
        'Find past exam papers for one VIT course from the paper archives. Takes an exact course code. Returns `{ success, courseCode, papers: [{ title, url, examType, year, ... }], totalFound, sources }`; on failure `success: false` with `errorKind`: "invalid_course_code" (not a course code: search the catalog first) or "no_papers" (none found for the filters).',
      inputSchema: findPastPapersInputSchema,
      execute: async ({
        courseCode,
        examType,
        year,
      }: z.infer<typeof findPastPapersInputSchema>) => {
        try {
          const resolvedCourseCode = normalizeCourseCode(courseCode)
          if (!isCourseCodeFormat(resolvedCourseCode)) {
            return {
              success: false,
              errorKind: 'invalid_course_code',
              courseCode,
              papers: [],
              message: `"${courseCode}" is not a course code. Use searchCourseCatalog to find the exact code.`,
            }
          }

          const results = await Promise.allSettled([
            scrapePapersService(resolvedCourseCode, examType, year),
            scrapePapersCodeChef(resolvedCourseCode, examType, year),
            // scrapeVITPaperVault(resolvedCourseCode, examType, year),
            scrapeExamCooker(resolvedCourseCode, examType, year),
          ])

          const succeeded = results.flatMap(r =>
            r.status === 'fulfilled' && r.value?.success ? [r.value] : []
          )
          const papers = succeeded.flatMap(result => result.papers || [])
          const sources = succeeded.map(result => result.source)

          if (papers.length === 0) {
            return {
              success: false,
              errorKind: 'no_papers',
              courseCode: resolvedCourseCode,
              papers: [],
              message: `No papers found for course code "${resolvedCourseCode}"${
                examType ? ` (${examType})` : ''
              }${year ? ` from ${year}` : ''}.`,
              suggestions: [
                'Verify the course code with searchCourseCatalog',
                'Try without the exam type or year filter',
                'Check with course faculty for official study materials',
                'Visit VIT library for physical copies of past papers',
                'Contact senior students or study groups for materials',
              ],
            }
          }

          return {
            success: true,
            courseCode: resolvedCourseCode,
            examType,
            year,
            papers,
            totalFound: papers.length,
            message: `found ${papers.length} papers for ${resolvedCourseCode}${
              examType ? ` (${examType})` : ''
            }${year ? ` from ${year}` : ''}`,
            sources,
          }
        } catch (err) {
          const errorMessage =
            getErrorMessage(err) || 'unable to scrape papers at the moment. please try again later.'
          return {
            success: false,
            error: errorMessage,
            message: 'unable to scrape papers at the moment. please try again later.',
          }
        }
      },
    }),
    searchCourseCatalog: tool({
      description:
        'Search the VIT course catalog (course code -> official title). Case-insensitive substring match of `query` against course codes and titles, in catalog order; no nicknames or acronyms are expanded. Use it to turn the user\'s description of a course into exact course codes: try a distinctive part of the official title (e.g. "data structures") or a code prefix (e.g. "BCSE3"). Returns `{ query, total, candidates: [{ code, name }] }`. Pick the code that fits the user\'s request; if several plausibly fit, list them and ask which one. `total: 0` means nothing contains the query: try a different title fragment.',
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .min(1, 'Provide part of a course title or code.')
          .describe('Substring of the official course title or code, e.g. "database", "BMAT2".'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_COURSE_SEARCH_LIMIT)
          .optional()
          .describe(`Maximum candidates to return (default ${DEFAULT_COURSE_SEARCH_LIMIT}).`),
      }),
      execute: async ({ query, limit }) => {
        const { total, results } = searchCourseCatalog(query, limit)
        return { success: true, query, total, candidates: results }
      },
    }),

    lookupCourseCode: tool({
      description:
        'Exact lookup of one VIT course code in the course catalog. Returns `{ found: true, code, name }`, or `{ found: false, code }` when the catalog does not list the code (the code may still be valid; the catalog is not exhaustive).',
      inputSchema: z.object({
        code: z.string().trim().min(1).describe('Exact course code, e.g. BCSE302L.'),
      }),
      execute: async ({ code }) => {
        const course = getCourseByCode(code)
        return course
          ? { success: true, found: true, code: course.code, name: course.name }
          : { success: true, found: false, code: normalizeCourseCode(code) }
      },
    }),

    getCourseInfo: tool({
      description:
        'Look up course offerings (faculty, slot, type) in one school\'s FFCS dataset. `courseQuery` is a case-insensitive substring of the course code or title; `slot` is an exact slot. Returns `{ success, results: [{ code, title, faculty, slot, type }] }` (empty `results` when nothing matches).',
      inputSchema: z.object({
        school: z
          .enum(['smec', 'score', 'scope', 'sbst', 'sce', 'scheme', 'select', 'sense'])
          .describe(
            'The school to search within. Examples: smec (mechanical), score (information tech), scope (computer science), sbst (biosciences and technology), sce (civil), scheme (chemical engineering), select (electrical engineering), sense (electronics and communication engineering'
          ),
        courseQuery: z
          .string()
          .trim()
          .min(1)
          .describe('Substring of the course code or official title, e.g. "BCSE302" or "database".'),
        slot: z
          .string()
          .optional()
          .describe('An optional exact slot to filter by (e.g., "A1", "L1+L2").'),
      }),
      execute: async ({ school, courseQuery, slot }) => {
        try {
          const { allCourses } = await getCourseData(school)
          const needle = courseQuery.toLowerCase()

          let filteredCourses = allCourses.filter(
            course => containsText(course.CODE, needle) || containsText(course.TITLE, needle)
          )

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
      description:
        'Look up VIT faculty from the faculty directory. Filters (combine as needed; at least one is expected, never list the whole directory): `school` (exact school acronym), `department` (case-insensitive substring of the school or department name as listed, e.g. "computer science"), `facultyName` (case-insensitive substring of the name as listed, e.g. "anuj kumar"), `courseQuery` (substring of a course code/title the faculty teaches in FFCS). Returns `{ success, total, faculty: [{ name, department, school, email, profileUrl, courses? }] }`; when several people match, show them and let the user pick. No spelling correction is applied: if nothing matches, try a shorter or different substring.',
      inputSchema: z.object({
        department: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Substring of the school or department name as listed, e.g. "mechanical".'),
        facultyName: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Substring of the faculty member\'s name as listed in the directory.'),
        includeCourses: z
          .boolean()
          .optional()
          .describe('If true, also return courses the faculty teaches.'),
        school: z
          .enum(['smec', 'score', 'scope', 'sbst', 'sce', 'scheme', 'select', 'sense'])
          .optional()
          .describe(
            'Only faculty of this school (smec mechanical, score information technology, scope computer science, sbst biosciences, sce civil, scheme chemical, select electrical, sense electronics).'
          ),
        courseQuery: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Substring of a course code or title; keeps only faculty teaching a matching course.'),
      }),
      execute: async ({ department, facultyName, includeCourses = false, school, courseQuery }) => {
        try {
          const schools = await loadFacultyData()

          const results: FacultyResultEntry[] = []
          const deptFilter = department ? department.toLowerCase() : null
          const facultyFilter = facultyName ? facultyName.toLowerCase() : null
          const courseFilter = courseQuery ? courseQuery.toLowerCase() : null
          // Unfiltered course lookups visit every school; warm each school's (memoized) course
          // data in parallel instead of fetching them one by one inside the loop below.
          if ((courseFilter || includeCourses) && !facultyFilter && !deptFilter) {
            const schoolKeys = new Set<School>()
            for (const entry of schools) {
              const key = entry.school ? toSchool(deriveSchoolAcronym(entry.school)) : null
              if (key) schoolKeys.add(key)
            }
            await Promise.allSettled([...schoolKeys].map(key => getCourseData(key)))
          }
          for (const schoolEntry of schools) {
            const schoolName = schoolEntry.school
            if (!schoolName) continue
            const schoolKey = toSchool(deriveSchoolAcronym(schoolName))
            if (school && schoolKey !== school) continue
            // A department filter that names the school keeps all of its departments.
            const wholeSchool = deptFilter !== null && containsText(schoolName, deptFilter)
            for (const dept of schoolEntry.departments || []) {
              const departmentName = dept.department || dept.name || ''
              if (
                deptFilter !== null &&
                !wholeSchool &&
                !containsText(departmentName || schoolName, deptFilter)
              ) {
                continue
              }
              for (const faculty of dept.faculty || []) {
                const facultyNameValue = faculty.name
                if (!facultyNameValue) continue
                if (facultyFilter && !containsText(facultyNameValue, facultyFilter)) continue

                const facultyEntry: FacultyResultEntry = {
                  name: facultyNameValue,
                  department: faculty.department || departmentName || schoolName,
                  school: schoolName,
                  email: faculty.email || undefined,
                  profileUrl: faculty.profile_url || faculty.profileUrl || undefined,
                  ...faculty,
                  image: faculty.image_url || faculty.image || undefined,
                }
                if (courseFilter || includeCourses) {
                  let courses: FacultyCourseRecord[] = []
                  if (schoolKey) {
                    try {
                      const { allCourses } = await getCourseData(schoolKey)
                      courses = coursesTaughtBy(facultyNameValue, allCourses, courseFilter)
                    } catch {
                      courses = []
                    }
                  }
                  if (courseFilter && courses.length === 0) continue
                  if (includeCourses) facultyEntry.courses = courses
                }
                results.push(facultyEntry)
              }
            }
          }

          const [singleFaculty] = results
          if (results.length === 1 && singleFaculty && !courseQuery && !includeCourses) {
            const faculty = singleFaculty
            const schoolAsEnum = faculty.school
              ? toSchool(deriveSchoolAcronym(faculty.school))
              : null

            if (schoolAsEnum && faculty.name) {
              try {
                const { allCourses } = await getCourseData(schoolAsEnum)
                const courses = coursesTaughtBy(faculty.name, allCourses, null)
                faculty.courses = courses

                return {
                  success: true,
                  total: 1,
                  faculty: [faculty],
                  message:
                    `Found faculty member ${faculty.name} in ${faculty.department || faculty.school}.` +
                    `\n\nCourses taught (${courses.length}):` +
                    `\n${courses
                      .map(c => `- ${c.code ?? 'N/A'}: ${c.title ?? 'Unknown'}`)
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
              : 'No faculty found for these filters. Try a shorter or different substring of the name or department.',
          }
        } catch (error) {
          return {
            success: false,
            error: getErrorMessage(error) || 'Failed to search faculty.json',
            message: getErrorMessage(error),
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
          const parsed: ParsedPlacementData = await parsePlacementData(raw, '', undefined)
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
        'Find the syllabus PDF for a VIT course in the syllabus index. Pass an exact course code, or a substring of the course title/filename. An exact code match, or a single substring match, returns `{ success: true, filename, code, title, url }`; several substring matches return `{ success: true, ambiguous: true, matches: [{ filename, code, title, url }] }` for you to choose from (ask the user if the request does not decide it); none returns `success: false`.',
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .min(1, 'Provide a course code or part of the course title.')
          .describe('Exact course code (e.g. ACXC101N) or a substring of the course title (e.g. "art of advertising").'),
      }),
      execute: async ({ query }) => {
        try {
          let entries: SyllabusEntry[]
          try {
            entries = await loadSyllabusEntries()
          } catch (loadError) {
            if (!(loadError instanceof SyllabiLoadError)) throw loadError
            console.error('[getSyllabus] could not load syllabi.json', loadError.status)
            return {
              success: false,
              error: loadError.message,
            }
          }

          const candidates = entries.flatMap(syllabusCandidate)
          const needle = query.toLowerCase()
          const exact = candidates.filter(candidate => candidate.code?.toLowerCase() === needle)
          const matches = exact.length
            ? exact
            : candidates.filter(
                candidate =>
                  containsText(candidate.code ?? undefined, needle) ||
                  containsText(candidate.title ?? undefined, needle) ||
                  containsText(candidate.filename, needle)
              )

          const [only] = matches
          if (matches.length === 1 && only) {
            return { success: true, ...only, message: `Found syllabus for ${only.code || only.title || query}` }
          }
          if (matches.length > 1) {
            return {
              success: true,
              ambiguous: true,
              query,
              total: matches.length,
              matches: matches.slice(0, SYLLABUS_MATCH_LIMIT),
              message: `${matches.length} syllabi match "${query}". Choose one.`,
            }
          }

          debugLog('[getSyllabus] no match for query:', query)
          return {
            success: false,
            query,
            message: `No syllabus code, title or filename contains "${query}". Use the exact course code (searchCourseCatalog can find it) or a different part of the title.`,
          }
        } catch (error) {
          console.error('[getSyllabus] error', error)
          return {
            success: false,
            error: getErrorMessage(error) || String(error),
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
          .enum(['mens', 'ladies'])
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
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
          .optional()
          .describe(
            'Menu date as YYYY-MM-DD (work it out from the current date in your instructions, e.g. for "tomorrow"). Omit for today.'
          ),
        mealType: z
          .enum(['breakfast', 'lunch', 'snacks', 'dinner'])
          .optional()
          .describe('specific meal type to filter. If not provided, returns all meals for the day'),
      }),
      execute: async ({ hostelType, messType, date, mealType }) => {
        const result = await getMessMenu(hostelType, messType, date, mealType)

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
        "Access the student's PERSONAL VTOP (VIT portal) data and actions through their linked VTOP account: grades, marks, attendance, timetable, today/tomorrow's classes and skip budget, exams, calendar/holidays, CGPA, hostel, receipts, library dues, class messages, events, leave and night-slip status or applications, digital assignments, facility registration, syllabus PDFs, course materials (course-page) and course allocation. Not for general VIT information.\n" +
        'Multi-step commands (course-page, da, syllabus, facility, calendar, ...): call with just the command (and semester if known). The result has `status`: "completed" (data in `data`/`structured_data`, downloads in `files` with signed expiring links: share them as links), or "needs_selection" / "needs_input" / "needs_confirmation" with `step: { id, kind, label, prompt, multiple, options: [{ id, label, description }] }` (every option VTOP offered), `continuation`, `progress` (choices made so far; `auto: true` when VTOP offered a single option) and `nextAction`. To continue, call queryVTOP again with the same command, `continuation`, and `choice` = the option id(s) you pick from step.options for what the user asked; ask the user only when their request does not determine the option.\n' +
        'Write actions (leave/nightslip apply=true, facility registration) always stop at needs_confirmation: answer choice true only after the user explicitly agrees in this conversation.\n' +
        'Errors: `success: false` with `errorKind` (e.g. "invalid_input" with `field` and `validIds` for a choice that is not an offered id, "token_invalid" when the continuation expired (start the command again), "invalid_credentials"/"login_failed" when the linked account was rejected, "busy"/"vtop_unavailable"/"timeout" with `retryable: true`) and `requiresCredentials: true` when the account must be (re)linked: the app then shows a secure dialog, so never ask for credentials in chat.',
      inputSchema: queryVTOPInputSchema,
      execute: async input => {
        const { command } = input
        const continuation = input.continuation
        const choice = input.choice
        if (continuation !== undefined && choice === undefined) {
          return {
            success: false,
            status: 'error',
            command,
            errorKind: 'invalid_input',
            field: 'choice',
            error: 'choice is required with continuation',
            message: 'Pass `choice` (an id from step.options, a value, or true/false) together with `continuation`.',
          }
        }
        const isWrite = Boolean(input.apply || continuation)
        const { flags, ignored } = buildVtopFlags(input)
        const isBotChannel = channel === 'whatsapp' || channel === 'discord'

        // ---- MCP (WhatsApp / Discord / connector clients): credentials live in the OAuth token.
        // Only bot channels / named MCP clients use MCP; skip the token lookup otherwise.
        const usesMcp = Boolean(mcpConfig?.endpoint && (isBotChannel || mcpConfig.clientName))
        let mcpAccessToken = mcpConfig?.accessToken
        if (!mcpAccessToken && usesMcp) {
          const stored = await getUserMcpToken(userId)
          if (stored) {
            const refreshed = isMcpExpired(stored) ? await refreshUserMcpToken(userId, undefined, stored) : null
            mcpAccessToken = refreshed?.accessToken || stored.accessToken
          }
        }
        if (isBotChannel && mcpConfig?.endpoint && !mcpAccessToken) {
          return {
            success: false,
            requiresMcpLink: true,
            command,
            message:
              'Missing or expired VTOP MCP token. Please run !linkvtop in WhatsApp to re-authorize, then retry.',
          }
        }
        if (usesMcp && mcpConfig && mcpAccessToken) {
          const args: Record<string, JsonValue> =
            continuation !== undefined && choice !== undefined
              ? { continuation, choice }
              : { flags, ...(input.fresh ? { fresh: true } : {}) }
          try {
            const mcpResult = await callVtopViaMcp({
              toolName: continuation !== undefined ? 'vtop-continue' : command,
              args,
              mcp: { ...mcpConfig, accessToken: mcpAccessToken },
            })
            if (mcpResult) {
              if (isBotChannel && mcpResult.errorKind === 'unauthorized') {
                return {
                  success: false,
                  requiresMcpLink: true,
                  command,
                  message: 'Your VTOP session token expired. Send !linkvtop again to refresh access.',
                }
              }
              if (mcpResult.success || isBotChannel) return toQueryVTOPResult(command, mcpResult, ignored)
            }
          } catch (error) {
            if (isBotChannel) {
              return {
                success: false,
                command,
                error: getErrorMessage(error) || 'MCP request failed',
                message: 'Unable to reach the VTOP service right now. Please try again shortly.',
              }
            }
          }
        }

        // ---- Direct proxy call with the user's server-side stored credentials.
        let credentials: VtopCredentialFields | null = null
        if (input.username && input.password) {
          credentials = { username: input.username, password: input.password }
        } else if (input.username && input.encryptedPassword) {
          credentials = {
            username: input.username,
            encryptedPassword: input.encryptedPassword,
            ...(input.sessionKey ? { sessionKey: input.sessionKey } : {}),
          }
        } else {
          try {
            const stored = await getVTOPCredentialsForUser(userId)
            if (stored) credentials = { username: stored.username, password: stored.password }
          } catch (error) {
            console.error('[queryVTOP] reading stored VTOP credentials failed:', getErrorMessage(error))
          }
        }
        if (!credentials) return VTOP_CREDENTIALS_REQUIRED(command)

        const attempts = isWrite ? 1 : 2
        let last: ReturnType<typeof toQueryVTOPResult> | null = null
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            const result =
              continuation !== undefined && choice !== undefined
                ? await callVtopProxy('/vtop/continue', { ...credentials, continuation, choice })
                : await callVtopProxy('/vtop', {
                    ...credentials,
                    command,
                    flags,
                    ...(input.fresh ? { fresh: true } : {}),
                  })
            last = toQueryVTOPResult(command, result, ignored)
            // The proxy already retries VTOP hiccups; only retry here when it was too busy.
            if (result.success || result.errorKind !== 'busy') return last
          } catch (error) {
            if (!(error instanceof VtopProxyUnavailableError) || attempt === attempts) {
              return {
                success: false,
                command,
                error: getErrorMessage(error) || 'Network error',
                message: 'Unable to connect to the VTOP proxy service. Please try again shortly.',
                retryable: true,
              }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
        return last ?? VTOP_CREDENTIALS_REQUIRED(command)
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
        } catch (error) {
          return {
            success: false,
            error: getErrorMessage(error) || 'Failed to search Reddit knowledge base',
            message:
              'Unable to access the Reddit knowledge base. The service may be temporarily unavailable.',
            suggestion: 'Please try again later or check if the Reddit scraper service is running.',
          }
        }
      },
    }),

    searchRedditWithContext: tool({
      description:
        'Search the VIT Reddit knowledge base, optionally together with the current trending-topics feed. Set `includeTrending: true` when the user wants what is currently popular or happening (trending topics are then returned in `trending`). Returns `{ success, response, sources, trending, confidence, totalResults }`.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('The search query for finding relevant information from Reddit discussions.'),
        includeTrending: z
          .boolean()
          .optional()
          .describe('Also fetch the trending-topics feed (default false).'),
      }),
      execute: async ({ query, includeTrending }) => {
        try {
          const results = await searchRedditWithContext(query, { includeTrending })

          return {
            success: results.success,
            response: results.response,
            sources: results.sources || [],
            trending: results.trending || [],
            confidence: results.confidence || 0,
            totalResults: results.totalResults || 0,
            isBroadQuery: results.isBroadQuery || false,
            message: results.success
              ? `Found ${results.totalResults} relevant discussions${results.trending?.length ? ` and ${results.trending.length} trending topics` : ''}`
              : results.message,
            note: results.success
              ? 'Response includes trending topics and recent discussions. Higher confidence indicates more relevant source material.'
              : 'Unable to find relevant information in the Reddit knowledge base.',
          }
        } catch (error) {
          return {
            success: false,
            error: getErrorMessage(error) || 'Failed to search Reddit',
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
        } catch (error) {
          return {
            success: false,
            error: getErrorMessage(error) || 'Failed to get Reddit overview',
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

        const key = block.trim().toLowerCase()
        const blockInfo = Object.entries(info).find(([blockKey]) => blockKey === key)?.[1]
        if (blockInfo) {
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
