import { findFullCourseName } from '../course-map'

const SOURCE = 'ExamCooker'
const API_ENDPOINT = 'https://examcooker.acmvit.in/api/papers'
const DEFAULT_LIMIT = 80
const REQUEST_TIMEOUT_MS = 12000

interface Paper {
  title: string
  url: string
  source: string
  metadata: string
  examType: string
  year: string
  slot?: string
}

const SLOT_TAG_REGEX = /^[A-G][1-2]$/i
const SLOT_REGEX = /\b([A-G][1-2])\b/i
const YEAR_RANGE_REGEX = /\b((?:20)?\d{2})\s*-\s*((?:20)?\d{2})\b/
const YEAR_REGEX = /\b(20\d{2})\b/
const COURSE_CODE_REGEX = /([A-Z]{2,4}\d{3}[A-Z]{0,3})/g

interface ApiPaper {
  _id: string
  id: string
  title: string | null
  name: string | null
  paperName: string | null
  subject: string | null
  courseName: string | null
  courseCode: string | null
  url: string | null
  paperUrl: string | null
  link: string | null
  paper_link: string | null
  downloadUrl: string | null
  finalUrl: string | null
  final_url: string | null
  file_url: string | null
  metadata: string | null
  description: string | null
  examType: string | null
  exam: string | null
  paperType: string | null
  slot: string | null
  year: string | null
  academicYear: string | null
  subjectCode: string | null
  tags?: string[]
  thumbnailUrl: string | null
  thumbNailUrl: string | null
  createdAt: string
  updatedAt: string
  paperDate?: string | null
  source: string | null
}

interface ApiResponse {
  success: boolean
  source: string
  papers: ApiPaper[]
  error?: string
}

interface ScraperResult {
  success: boolean
  papers: Paper[]
  error?: string
  source: string
  searchUrl?: string
}

export async function scrapeExamCooker(
  courseCode: string,
  examType?: string,
  year?: string
): Promise<ScraperResult> {
  const apiKey = (process.env.EXAMCOOKER_API_KEY || '').trim()
  if (!apiKey) {
    return {
      success: false,
      papers: [],
      error: 'EXAMCOOKER_API_KEY is not configured',
      source: SOURCE,
    }
  }

  const subjectQueries = buildSubjectQueries(courseCode)
  if (subjectQueries.length === 0) {
    subjectQueries.push(courseCode.trim())
  }

  const aggregated: Paper[] = []
  const attemptedUrls: string[] = []
  let lastError: string | undefined
  let hadSuccessfulFetch = false

  for (const subject of subjectQueries) {
    const { papers, error, searchUrl } = await queryExamCooker(subject, apiKey, examType, year)
    if (searchUrl) attemptedUrls.push(searchUrl)
    if (error) {
      lastError = error
      continue
    }
    hadSuccessfulFetch = true
    aggregated.push(...papers)
  }

  if (!hadSuccessfulFetch) {
    return {
      success: false,
      papers: [],
      error: lastError || 'Unable to reach ExamCooker API',
      source: SOURCE,
      searchUrl: attemptedUrls[attemptedUrls.length - 1],
    }
  }

  const filtered = filterByRequestedParams(aggregated, examType, year)
  const deduped = deduplicatePapers(filtered)

  return {
    success: true,
    papers: deduped,
    source: SOURCE,
    searchUrl: attemptedUrls[0],
  }
}

function buildSubjectQueries(courseCode: string): string[] {
  const queries = new Set<string>()
  const normalizedCode = courseCode.trim().toUpperCase()
  if (normalizedCode) {
    queries.add(normalizedCode)
    const spaced = normalizedCode.replace(/([A-Z])(\d)/g, '$1 $2').replace(/(\d)([A-Z])/g, '$1 $2')
    if (spaced !== normalizedCode) queries.add(spaced)
  }

  const courseName = findFullCourseName(normalizedCode)
  if (courseName && courseName.toUpperCase() !== normalizedCode) {
    courseName
      .split('/')
      .map(part => sanitizeSubject(part))
      .filter(Boolean)
      .forEach(part => queries.add(part))
  }

  return Array.from(queries).filter(Boolean)
}

function sanitizeSubject(value: string): string {
  return value
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseTitle(rawTitle: string): ParsedTitle {
  const cleanTitle = rawTitle
    .replace(/\.pdf$/i, '')
    .replace(/select$/i, '')
    .trim()
  const examType = extractExamType(cleanTitle)
  const slot = extractSlot(cleanTitle)
  const { academicYear, year } = extractYearInfo(cleanTitle)
  const courseCode = extractCourseCode(cleanTitle)
  const courseName = extractCourseName(cleanTitle, courseCode)

  return {
    cleanTitle,
    examType,
    slot,
    year,
    academicYear,
    courseCode,
    courseName,
  }
}

function extractExamType(title: string): string | undefined {
  const patterns: { regex: RegExp; normalize: (value: string) => string }[] = [
    { regex: /\bcat[-\s]?1\b/i, normalize: () => 'CAT-1' },
    { regex: /\bcat[-\s]?2\b/i, normalize: () => 'CAT-2' },
    { regex: /\bfat\b/i, normalize: () => 'FAT' },
    { regex: /\bmid(?:term)?\b/i, normalize: () => 'MID' },
    { regex: /\bquiz\b/i, normalize: () => 'Quiz' },
    { regex: /\bcia\b/i, normalize: () => 'CIA' },
  ]

  for (const { regex, normalize } of patterns) {
    if (regex.test(title)) {
      return normalize(title.match(regex)?.[0] || '')
    }
  }
  return undefined
}

function extractSlot(title: string): string | undefined {
  const match = title.match(SLOT_REGEX)
  return match ? match[1].toUpperCase() : undefined
}

function extractYearInfo(title: string): { academicYear?: string; year?: string } {
  const rangeMatch = title.match(YEAR_RANGE_REGEX)
  if (rangeMatch) {
    const start = normalizeYear(rangeMatch[1])
    const end = normalizeYear(rangeMatch[2])
    if (start && end) {
      return {
        academicYear: `${start}-${end}`,
        year: start,
      }
    }
  }

  const singleMatch = title.match(YEAR_REGEX)
  if (singleMatch) {
    const normalized = normalizeYear(singleMatch[1])
    return { year: normalized, academicYear: normalized }
  }

  return {}
}

function extractCourseCode(title: string): string | undefined {
  let courseCode: string | undefined
  let match: RegExpExecArray | null
  while ((match = COURSE_CODE_REGEX.exec(title.toUpperCase())) !== null) {
    courseCode = match[1].toUpperCase()
  }
  COURSE_CODE_REGEX.lastIndex = 0
  return courseCode
}

function extractCourseName(title: string, courseCode?: string): string | undefined {
  let working = title
  if (courseCode) {
    const idx = working.toUpperCase().lastIndexOf(courseCode)
    if (idx > -1) {
      working = working.slice(0, idx)
    }
  }

  working = working.replace(/[-–—]\s*$/, '').trim()

  const tokens = working.split(/\s+/)
  const resultTokens: string[] = []
  let started = false

  for (const token of tokens) {
    if (!started) {
      if (isMetadataToken(token)) {
        continue
      }
      started = true
    }
    resultTokens.push(token)
  }

  const name = resultTokens.join(' ').trim()
  return name || undefined
}

function isMetadataToken(token: string): boolean {
  const normalized = token.replace(/[^a-z0-9-]/gi, '').toLowerCase()
  if (!normalized) return true
  if (/^cat-?\d$/.test(normalized)) return true
  if (/^(fat|quiz|mid|cia)$/.test(normalized)) return true
  if (/^(qp|paper|select)$/.test(normalized)) return true
  if (/^[a-g]\d$/i.test(normalized)) return true
  if (/^\d{2}-\d{2}$/.test(normalized)) return true
  if (/^20\d{2}$/.test(normalized)) return true
  return false
}

function normalizeYear(value?: string): string | undefined {
  if (!value) return undefined
  const digits = value.replace(/\D/g, '')
  if (digits.length === 4) return digits
  if (digits.length === 2) {
    const parsed = parseInt(digits, 10)
    if (!Number.isNaN(parsed)) {
      return (2000 + parsed).toString()
    }
  }
  return undefined
}

function sanitizeTags(tags?: string[] | null): string[] {
  if (!Array.isArray(tags)) return []
  return tags.map(tag => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean)
}

function resolveSlot(
  parsedSlot?: string,
  explicitSlot?: string | null,
  tags: string[] = []
): string | undefined {
  const candidates = [parsedSlot, explicitSlot, ...tags]
  for (const candidate of candidates) {
    if (!candidate) continue
    const trimmed = candidate.trim()
    if (SLOT_TAG_REGEX.test(trimmed)) return trimmed.toUpperCase()
    const match = trimmed.match(SLOT_REGEX)
    if (match) return match[1].toUpperCase()
  }
  return undefined
}

function findYearInList(values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    const year = extractYear(value || undefined)
    if (year) return year
  }
  return undefined
}

function buildMetadataParts(parts: Array<string | undefined | null>): string[] {
  return parts.map(part => (part ? part.toString().trim() : '')).filter(Boolean)
}

async function queryExamCooker(
  subject: string,
  apiKey: string,
  examType?: string,
  year?: string
): Promise<{ papers: Paper[]; error?: string; searchUrl: string }> {
  const params = new URLSearchParams({ subject })
  params.set('limit', DEFAULT_LIMIT.toString())
  params.set('page', '1')

  const searchUrl = `${API_ENDPOINT}?${params.toString()}`

  try {
    const response = await fetchWithTimeout(
      searchUrl,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'the-everything-assistant/1.0',
          'x-api-key': apiKey,
        },
      },
      REQUEST_TIMEOUT_MS
    )

    if (!response.ok) {
      return {
        papers: [],
        error: `ExamCooker responded with ${response.status}`,
        searchUrl,
      }
    }

    const data = (await response.json()) as ApiResponse
    if (!data.success || !Array.isArray(data.papers)) {
      return {
        papers: [],
        error: data.error || 'ExamCooker returned unexpected payload',
        searchUrl,
      }
    }

    const mapped = data.papers
      .map(p => mapPaper(p, examType, year))
      .filter((p): p is Paper => Boolean(p))

    return {
      papers: mapped,
      searchUrl,
    }
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? 'ExamCooker request timed out' : error?.message
    return {
      papers: [],
      error: message || 'ExamCooker request failed',
      searchUrl,
    }
  }
}

function mapPaper(paper: ApiPaper, examType?: string, year?: string): Paper | null {
  const rawTitle =
    paper.title ||
    paper.paperName ||
    paper.name ||
    paper.courseName ||
    paper.subject ||
    paper.courseCode ||
    'Untitled Paper'

  const url =
    paper.finalUrl ||
    paper.final_url ||
    paper.downloadUrl ||
    paper.paperUrl ||
    paper.url ||
    paper.link ||
    paper.paper_link ||
    paper.file_url

  if (!url) {
    return null
  }

  const parsed = parseTitle(rawTitle)
  const normalizedExam =
    normalizeExamType(
      paper.examType || paper.exam || paper.paperType || parsed.examType || examType,
      rawTitle
    ) || 'unknown'

  const tags = sanitizeTags(paper.tags)
  const resolvedSlot = resolveSlot(parsed.slot, paper.slot, tags)
  const resolvedYear =
    parsed.year ||
    extractYear(paper.year) ||
    extractYear(paper.academicYear) ||
    findYearInList([paper.metadata, ...tags]) ||
    (year ? extractYear(year) : undefined) ||
    extractYear(rawTitle) ||
    parsed.academicYear ||
    'unknown'

  const metadataParts = buildMetadataParts([
    paper.metadata,
    parsed.courseName,
    parsed.courseCode || paper.courseCode,
    parsed.academicYear || paper.academicYear,
    resolvedSlot ? `Slot ${resolvedSlot}` : undefined,
  ])

  return {
    title: parsed.cleanTitle || rawTitle.trim(),
    url,
    source: SOURCE,
    metadata: metadataParts.join(' · '),
    examType: normalizedExam,
    year: resolvedYear,
    slot: resolvedSlot,
  }
}

function normalizeExamType(value?: string | null, fallbackText?: string): string | undefined {
  const normalized = value?.trim()
  if (normalized) {
    return normalizeExamValue(normalized)
  }

  if (fallbackText) {
    return detectExamInText(fallbackText)
  }

  return undefined
}

function normalizeExamValue(value: string): string {
  const normalized = value.trim().toUpperCase()
  if (/CAT[-\s]?1/.test(normalized)) return 'CAT-1'
  if (/CAT[-\s]?2/.test(normalized)) return 'CAT-2'
  if (/FAT/.test(normalized) || /FINAL/.test(normalized)) return 'FAT'
  if (/QUIZ/.test(normalized)) return 'Quiz'
  if (/MID/.test(normalized)) return 'MID'
  if (/CIA/.test(normalized)) return 'CIA'
  return normalized
}

function detectExamInText(text: string): string | undefined {
  if (/cat[-\s]?1/i.test(text)) return 'CAT-1'
  if (/cat[-\s]?2/i.test(text)) return 'CAT-2'
  if (/fat/i.test(text) || /final/i.test(text)) return 'FAT'
  if (/quiz/i.test(text)) return 'Quiz'
  if (/mid(?:term)?/i.test(text)) return 'MID'
  if (/cia/i.test(text)) return 'CIA'
  return undefined
}

function extractYear(source?: string | null): string | undefined {
  if (!source) return undefined
  const rangeMatch = source.match(/(20\d{2})\s*[-/]\s*(20\d{2})/)
  if (rangeMatch) {
    return rangeMatch[1]
  }
  const singleMatch = source.match(/(20\d{2})/)
  if (singleMatch) {
    return singleMatch[1]
  }
  const shortRangeMatch = source.match(/(\d{2})\s*[-/]\s*(\d{2})/)
  if (shortRangeMatch) {
    return `20${shortRangeMatch[1]}`
  }
  return undefined
}

function filterByRequestedParams(papers: Paper[], examType?: string, year?: string): Paper[] {
  let filtered = papers

  if (examType) {
    const desired = examType.trim().toLowerCase()
    filtered = filtered.filter(paper => {
      const matchFields = [paper.examType, paper.metadata, paper.title]
      return matchFields.some(field => field && field.toLowerCase().includes(desired))
    })
  }

  if (year) {
    const desiredYear = year.trim()
    filtered = filtered.filter(paper => {
      const fields = [paper.year, paper.metadata, paper.title]
      return fields.some(field => field && field.includes(desiredYear))
    })
  }

  return filtered
}

function deduplicatePapers(papers: Paper[]): Paper[] {
  const seen = new Set<string>()
  const unique: Paper[] = []

  for (const paper of papers) {
    const key = paper.url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(paper)
  }

  return unique
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}
interface ParsedTitle {
  cleanTitle: string
  examType?: string
  slot?: string
  year?: string
  academicYear?: string
  courseCode?: string
  courseName?: string
}
