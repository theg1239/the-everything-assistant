import { tool } from 'ai'
import { searchTool, extractTool } from '@parallel-web/ai-sdk-tools'
import * as z from 'zod'
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
import { createFeedbackIssue } from './feedback'
import { getVTOPCredentialsForUser } from './vtop-credential-store'
import {
  VTOP_COMMANDS,
  VtopProxyUnavailableError,
  callVtopProxy,
  isPendingVtopStatus,
  vtopParamsFor,
  vtopProxyResultSchema,
  type VtopCredentialFields,
  type VtopProxyResult,
} from './vtop-proxy'
import { getUserMcpToken, refreshUserMcpToken, isExpired as isMcpExpired } from './mcp-tokens'
import { createMusicPlayerTool, type MusicPlayerToolState } from './music-player-tool'
import { memoizeAsync, publicAssetUrl } from './static-data'
// import {
//   indexPastPapers,
//   askIndexedPaperQuestion,
//   smartPaperSearchByQuestion,
//   getPaperIndexMeta,
// } from './agents/paper-agent'
// import { analyzeQuestionFrequencies } from './agents/question-frequency-agent'
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

const vtopApplicationSchema = z.object({
  leaveCode: z
    .string()
    .optional()
    .describe(
      'leave: type code or label - HT1 (HOME TOWN), EY1 (EMERGENCY LEAVE), LG1 (LOCAL GUARDIAN), WP (WITH PARENT LEAVE), WV (WINTER VACATION), SV (SUMMER VACATION), EP (OFFICIAL LEAVES)'
    ),
  visitingPlace: z.string().optional().describe('leave: place being visited'),
  reason: z.string().optional().describe('leave: reason'),
  details: z.string().optional().describe('nightslip: what the late stay is for'),
  fromDate: z.string().optional().describe('leave/nightslip: start date YYYY-MM-DD'),
  fromTime: z.string().optional().describe('leave/nightslip: start time HH:MM (24h)'),
  toDate: z.string().optional().describe('leave/nightslip: end date YYYY-MM-DD'),
  toTime: z.string().optional().describe('leave/nightslip: end time HH:MM (24h)'),
  costCentreId: z.string().optional().describe('nightslip: cost centre id (offered by a needs_input step)'),
  appliedTo: z.string().optional().describe('nightslip: approver id (offered by a needs_input step)'),
  roomTypeId: z.string().optional().describe('nightslip: room type id'),
  buildingId: z.string().optional().describe('nightslip: building id'),
  venue: z.string().optional().describe('nightslip: venue'),
  eventId: z.string().optional().describe('nightslip: late-hour event id'),
})

const vtopIdOrText = z.union([z.number().int().positive(), z.string()])

const queryVTOPInputSchema = z.object({
  command: z
    .enum(VTOP_COMMANDS)
    .describe(
      "profile; marks/grades/attendance/timetable/exams (exam-schedule) - optional semester; today/tomorrow/dayafter (classes + whether attendance allows skipping); holiday; calendar (asks class group); cgpa; receipts; hostel; library-dues; msg (class-message, announcements); events (campus events, view only); leave (leave-status) and nightslip (status, or apply=true to submit); da (digital assignments: subject -> assignment, downloads the question paper); facility (sports/hostel facility registration); syllabus (download a course syllabus PDF); course-page (download course materials: semester -> course -> faculty -> materials); course-page-archive (same, legacy course page); course-allocation (faculty/slots offered for a curriculum course)"
    ),
  continuation: z
    .string()
    .optional()
    .describe(
      'Token from a previous queryVTOP result whose status was needs_selection / needs_input / needs_confirmation. Pass it back with `choice` (and the same command) to continue that workflow.'
    ),
  choice: z
    .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
    .optional()
    .describe(
      'Answer for the pending step: an option id from step.options, several ids for multi-select (e.g. "1,3-5" or "all"), free text to match by name/code (e.g. "CSE1001", "anuj kumar", "module 2"), a value for needs_input, or "confirm"/"cancel" for needs_confirmation.'
    ),
  semester: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Semester option number from a previous semester list. Omit for the latest semester.'),
  semesterQuery: z
    .string()
    .optional()
    .describe('Semester by name: "previous", "fall 2024", "winter semester 2024-25". Omit for latest.'),
  classGroup: z.number().int().positive().optional().describe('Class group option number (calendar/today/tomorrow/holiday).'),
  course: vtopIdOrText
    .optional()
    .describe(
      'Course: option number, or a course code/name/acronym such as "CSE1001", "data structures", "DSA" (course-page, course-page-archive, da, syllabus, course-allocation).'
    ),
  courseQuery: z.string().optional().describe('Alias of course as free text.'),
  faculty: vtopIdOrText.optional().describe('Faculty option number or name, e.g. "anuj kumar" (course-page).'),
  facultyQuery: z.string().optional().describe('Alias of faculty as free text.'),
  materials: z
    .string()
    .optional()
    .describe('Course-page materials: "all", indices like "1,3-5", or a description like "module 2" / "lab slides".'),
  materialQuery: z.string().optional().describe('Alias of materials as free text.'),
  assignment: vtopIdOrText.optional().describe('da: assignment option number or title (e.g. "DA1").'),
  facility: vtopIdOrText.optional().describe('facility: option number or facility name.'),
  category: z.string().optional().describe('course-allocation: curriculum category (e.g. "programme core").'),
  apply: z.boolean().optional().describe('leave/nightslip: submit a NEW application (fill `application`).'),
  application: vtopApplicationSchema.optional().describe('Fields for leave/nightslip applications.'),
  confirm: z
    .boolean()
    .optional()
    .describe(
      'Only true when the user has EXPLICITLY confirmed a write action (leave/nightslip apply, facility registration) in this conversation.'
    ),
  fresh: z.boolean().optional().describe('Bypass the short-lived cache (user asked to refresh).'),
  username: z.string().optional().describe('Internal. Leave unset: the linked VTOP account is used.'),
  password: z.string().optional().describe('Internal. Never ask for or pass a password; leave unset.'),
  encryptedPassword: z.string().optional().describe('Internal legacy field. Leave unset.'),
  sessionKey: z.string().optional().describe('Internal legacy field. Leave unset.'),
  interactiveStep: z.string().optional().describe('Deprecated, ignored.'),
  fuzzyIndex: z.number().optional().describe('Deprecated, ignored.'),
  debug: z.boolean().optional().describe('Deprecated, ignored.'),
})
type QueryVTOPInput = z.infer<typeof queryVTOPInputSchema>

const MATERIAL_SELECTION = /^\s*(all|0|\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*)\s*$/i
const LATEST_SEMESTER = /^(latest|current)( semester)?$/i

/**
 * Splits tool input into proxy `flags` (exact values) and `select` hints (natural language the
 * proxy matches against VTOP's option lists), keeping only params the command accepts.
 */
function buildVtopRequest(input: QueryVTOPInput) {
  const allowed = new Set(vtopParamsFor(input.command))
  const flags: Record<string, string | number | boolean> = {}
  const select: Record<string, string> = {}
  const ignored: string[] = []
  const put = (name: string, value: string | number | boolean | undefined) => {
    if (value === undefined || value === '') return
    if (!allowed.has(name)) ignored.push(name)
    else flags[name] = value
  }
  const hint = (name: string, value: string | undefined) => {
    const text = value?.trim()
    if (!text) return
    if (!allowed.has(name)) ignored.push(name)
    else select[name] = text
  }
  const idOrHint = (name: string, value: number | string | undefined) => {
    if (typeof value === 'number') put(name, value)
    else if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) put(name, Number(value))
    else hint(name, value)
  }

  put('semester', input.semester)
  if (input.semesterQuery && !LATEST_SEMESTER.test(input.semesterQuery.trim())) {
    hint('semester', input.semesterQuery)
  }
  put('classGroup', input.classGroup)
  idOrHint('course', input.course)
  hint('course', input.course === undefined ? input.courseQuery : undefined)
  idOrHint('faculty', input.faculty)
  hint('faculty', input.faculty === undefined ? input.facultyQuery : undefined)
  idOrHint('assignment', input.assignment)
  idOrHint('facility', input.facility)
  hint('category', input.category)
  const materials = input.materials ?? input.materialQuery
  if (materials !== undefined) {
    if (MATERIAL_SELECTION.test(materials)) put('materials', materials.replace(/\s+/g, ''))
    else hint('materials', materials)
  }
  if (input.apply) put('apply', true)
  for (const [name, value] of Object.entries(input.application ?? {})) put(name, value)
  if (input.confirm && allowed.has('confirm')) flags.confirm = true

  return { flags, select, ignored: [...new Set(ignored)] }
}

const VTOP_NEXT_ACTION: Record<string, string> = {
  needs_selection:
    'If the user already named the option, call queryVTOP again with the same command, this continuation and choice (option id or name); otherwise show step.options and ask. Multi-select steps accept "1,3-5" or "all".',
  needs_input:
    'Ask the user for this value (offer step.options when present), then call queryVTOP with the same command, this continuation and choice = the value.',
  needs_confirmation:
    'Show the summary and ask the user to confirm. ONLY after they explicitly confirm, call queryVTOP with the same command, this continuation and choice "confirm". Never confirm on their behalf.',
}

/** Proxy result -> queryVTOP tool output (keeps the legacy fields existing renderers read). */
function toQueryVTOPResult(command: string, result: VtopProxyResult, ignored: string[] = []) {
  const status = result.status ?? (result.success ? 'completed' : 'error')
  const pending = isPendingVtopStatus(status)
  const files = result.files ?? []
  return {
    success: result.success,
    command: result.command || command,
    status,
    message: result.message || result.error || `VTOP ${command} ${status}`,
    data: pending ? result.step?.prompt ?? result.message ?? '' : result.data ?? result.output ?? '',
    structured_data: pending ? null : result.structured_data ?? null,
    raw: false,
    meta: result.meta ?? null,
    ...(result.step ? { step: result.step } : {}),
    ...(result.continuation ? { continuation: result.continuation } : {}),
    ...(result.progress?.length ? { progress: result.progress } : {}),
    ...(files.length
      ? {
          files,
          downloadInfo: {
            filesDownloaded: files.length,
            totalFiles: files.length,
            servedFiles: files.map(file => ({
              name: file.name,
              size: file.size,
              downloadUrl: file.url,
              expiry: file.expiresAt,
            })),
          },
        }
      : {}),
    ...(result.bundle ? { bundle: result.bundle } : {}),
    ...(result.links?.length ? { links: result.links } : {}),
    ...(pending ? { type: 'vtop-workflow', nextAction: VTOP_NEXT_ACTION[status] } : {}),
    ...(result.success
      ? {}
      : {
          error: result.error || 'VTOP request failed',
          errorKind: result.errorKind,
          retryable: result.retryable ?? false,
          requiresCredentials: result.requiresCredentials ?? false,
        }),
    ...(ignored.length ? { ignoredFlags: ignored } : {}),
  }
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

export async function searchRedditWithContext(query: string): Promise<RedditSearchResult> {
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
      .optional()
      .describe("course code like BCSE302L or course name like 'database systems'"),
    examType: z.string().optional().describe('exam type: cat1, cat2, fat, quiz'),
    year: z.string().optional().describe('academic year like 2023, 2022'),
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
              const [firstCourseMatch] = getAllCourseMatches(courseCode)
              if (firstCourseMatch) {
                resolvedCourseCode = firstCourseMatch.code
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
        const [primaryMatch] = limitedMatches
        const normalizedName = findFullCourseName(primaryMatch?.code || cleanedQuery.toUpperCase())

        if (!primaryMatch) {
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
          primary: primaryMatch,
          limitUsed: limitValue,
          message:
            limitedMatches.length === 1
              ? `Resolved "${cleanedQuery}" to ${primaryMatch.code} (${primaryMatch.name}).`
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
          for (const school of schools) {
            const schoolName = school.school
            if (!schoolName) continue
            const departments = school.departments || []
            let schoolMatches = false
            if (deptFilter && matchesDepartment(schoolName, deptFilter)) {
              schoolMatches = true
            }
            for (const dept of departments) {
              if (schoolMatches) {
                const facultyArr = dept.faculty || []
                for (const faculty of facultyArr) {
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

                  const facultyEntry: FacultyResultEntry = {
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
              for (const faculty of facultyArr) {
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

                const facultyEntry: FacultyResultEntry = {
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

          const [singleFaculty] = results
          if (results.length === 1 && singleFaculty && !courseQuery && !includeCourses) {
            const faculty = singleFaculty
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

                const courses: FacultyCourseRecord[] = facultyCourses.map(course => ({
                  code: course.CODE,
                  title: course.TITLE,
                  slot: course.SLOT,
                  type: course.TYPE,
                  venue: course.VENUE,
                }))
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
              : 'No faculty found. Please check the spelling or try a different department, name, or course.',
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
        'Fetch the syllabus PDF for a given course. The tool looks up available syllabus filenames from public/syllabi.json and constructs a Google Storage URL like https://storage.googleapis.com/examcooker/syllabi/<FILENAME>. Use course code or partial course name to search.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Course code (e.g., ACXC101N) or course name (e.g., "Art of Advertising")'),
      }),
      execute: async ({ query }) => {
        try {
          if (!query || query.trim().length === 0) {
            return {
              success: false,
              error: 'Query required',
              message: 'Please provide a course code or course name to lookup the syllabus.',
            }
          }

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

          const scoreCandidate = (cand: SyllabusEntry) => {
            let code = ''
            let title = ''
            let filename = ''
            if (typeof cand === 'string') {
              filename = cand
              code = cand.split('_')[0] || ''
            } else {
              code = cand.code || ''
              title = cand.title || ''
              filename = cand.file || cand.filename || ''
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

          if (entries.length > 0) {
            if (typeof entries[0] === 'string') {
              const fileNames = entries.filter(entry => typeof entry === 'string')
              const exact = fileNames.find(fn => (fn.split('_')[0] ?? '').toLowerCase() === q)
              if (exact) {
                debugLog('[getSyllabus] exact code match:', exact)
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

              const scored = fileNames
                .map(fn => ({ fn, score: scoreCandidate(fn) }))
                .sort((a, b) => b.score - a.score)
              debugLog('[getSyllabus] top candidates (string):', scored.slice(0, 5))
              const [top] = scored
              if (top && top.score > 0) {
                const topScore = top.score
                const topMatches = scored
                  .filter(s => s.score > 0 && s.score >= Math.max(1, topScore - 5))
                  .slice(0, 8)
                if (topMatches.length > 1) {
                  const matches = topMatches.map(s => {
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

                const matched = top.fn
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
              // Mirrors the object-shaped entry fields; a bare filename has none of them.
              const fieldsOf = (item: SyllabusEntry) => (typeof item === 'string' ? {} : item)
              const scored = entries
                .map(item => ({ item: fieldsOf(item), score: scoreCandidate(item) }))
                .sort((a, b) => b.score - a.score)
              debugLog(
                '[getSyllabus] top candidates (objects):',
                scored.slice(0, 6).map(s => ({
                  code: s.item.code,
                  title: s.item.title,
                  filename: s.item.file || s.item.filename,
                  score: s.score,
                }))
              )
              const [top] = scored
              if (top && top.score > 0) {
                const topScore = top.score
                const topMatches = scored
                  .filter(s => s.score > 0 && s.score >= Math.max(1, topScore - 5))
                  .slice(0, 8)
                if (topMatches.length > 1) {
                  const matches = topMatches.map(s => {
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

                const best = top.item
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
            const lowered = entries.map(d =>
              typeof d === 'string' ? d.toLowerCase() : JSON.stringify(d).toLowerCase()
            )
            const matchesFound: Array<{
              filename: string | null
              code: string | null
              title: string | null
              url: string | null
            }> = []
            lowered.forEach((text, i) => {
              const orig = entries[i]
              if (orig === undefined || !text.includes(q)) return
              const filename = typeof orig === 'string' ? orig : orig.file || orig.filename || null
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
            })
            if (matchesFound.length > 1) {
              return {
                success: true,
                ambiguous: true,
                query,
                matches: matchesFound,
                message: `Multiple syllabus files match "${query}". Please pick one.`,
              }
            }
            const [m] = matchesFound
            if (m) {
              return {
                success: true,
                filename: m.filename,
                code: m.code,
                title: m.title,
                url: m.url,
                message: `Found syllabus matching query: ${query}`,
              }
            }
          } catch {}

          debugLog('[getSyllabus] no match for query:', query)
          return {
            success: false,
            query,
            message: `No syllabus found matching "${query}". Try using the exact course code (e.g., ACXC101N) or a more distinctive part of the course title.`,
            suggestions: [
              'Use the exact course code like ACXC101N',
              'Try a shorter distinctive phrase from the course title (e.g., include a module name or code)',
            ],
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
        "Access the student's PERSONAL VTOP (VIT portal) data and actions through their linked VTOP account: grades, marks, attendance, timetable, today/tomorrow's classes and skip budget, exams, calendar/holidays, CGPA, hostel, receipts, library dues, class messages, events, leave and night-slip status or applications, digital assignments, facility registration, syllabus PDFs, course materials (course-page) and course allocation. Not for general VIT information. Multi-step commands return status needs_selection / needs_input / needs_confirmation with `step` (options) and a `continuation` token: pass what the user already said up front (e.g. course='CSE1001', faculty='anuj kumar', materials='module 2') so steps resolve automatically, otherwise continue with `continuation` + `choice`. Write actions (leave/nightslip apply=true, facility registration) always stop for confirmation - only confirm after the user explicitly agrees. Downloaded files come back in `files` with signed, expiring links: share them as links.",
      inputSchema: queryVTOPInputSchema,
      execute: async input => {
        const { command } = input
        const isWrite = Boolean(input.apply || input.confirm || input.continuation)
        const { flags, select, ignored } = buildVtopRequest(input)
        const isBotChannel = channel === 'whatsapp' || channel === 'discord'

        // ---- MCP (WhatsApp / Discord / connector clients): credentials live in the OAuth token.
        // Only bot channels / named MCP clients use MCP; skip the token lookup otherwise.
        const usesMcp = Boolean(mcpConfig?.endpoint && (isBotChannel || mcpConfig.clientName))
        let mcpAccessToken = mcpConfig?.accessToken
        if (!mcpAccessToken && usesMcp) {
          const stored = await getUserMcpToken(userId)
          if (stored) {
            const refreshed = isMcpExpired(stored) ? await refreshUserMcpToken(userId) : null
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
          const args: Record<string, JsonValue> = input.continuation
            ? {
                continuation: input.continuation,
                choice: input.choice ?? '',
                ...(input.confirm ? { confirm: true } : {}),
              }
            : {
                flags,
                select,
                ...(input.confirm ? { confirm: true } : {}),
                ...(input.fresh ? { fresh: true } : {}),
              }
          try {
            const mcpResult = await callVtopViaMcp({
              toolName: input.continuation ? 'vtop-continue' : command,
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
            const result = input.continuation
              ? await callVtopProxy('/vtop/continue', {
                  ...credentials,
                  continuation: input.continuation,
                  choice: input.choice ?? '',
                  ...(input.confirm ? { confirm: true } : {}),
                })
              : await callVtopProxy('/vtop', {
                  ...credentials,
                  command,
                  flags,
                  select,
                  ...(input.confirm ? { confirm: true } : {}),
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

function getLevenshteinDistance(a: string, b: string): number {
  // Two-row dynamic programme: `prev` is row i-1, `curr` is row i of the edit matrix.
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      const diagonal = prev[j - 1] ?? 0
      curr[j] =
        a[i - 1] === b[j - 1]
          ? diagonal
          : Math.min(
              (prev[j] ?? 0) + 1, // deletion
              (curr[j - 1] ?? 0) + 1, // insertion
              diagonal + 1 // substitution
            )
    }
    prev = curr
  }
  return prev[b.length] ?? 0
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
