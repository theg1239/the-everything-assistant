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
}

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
  const title =
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

  const normalizedExam = normalizeExamType(paper.examType || paper.exam || paper.paperType || examType, title)
  const normalizedYear = normalizeYear(paper.year || paper.academicYear || year, title)

  const tags = Array.isArray(paper.tags) ? paper.tags : []
  const metadataParts = [
    paper.metadata?.trim(),
    paper.slot ? `Slot ${paper.slot.toUpperCase()}` : undefined,
    paper.academicYear?.trim(),
    paper.courseCode?.trim(),
    tags.slice(0, 3).join(', ') || undefined,
  ].filter(Boolean)

  return {
    title: title.trim(),
    url,
    source: SOURCE,
    metadata: metadataParts.join(' · ') || '',
    examType: normalizedExam || 'unknown',
    year: normalizedYear || 'unknown',
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

function normalizeYear(value?: string | null, fallbackText?: string): string | undefined {
  const fromValue = extractYear(value)
  if (fromValue) return fromValue
  const fromFallback = extractYear(fallbackText)
  if (fromFallback) return fromFallback
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}
