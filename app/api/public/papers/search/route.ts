import { NextRequest, NextResponse } from 'next/server'
import { scrapePapersService } from '@/lib/scrapers/papers-scraper'
import { scrapePapersCodeChef } from '@/lib/scrapers/papers-codechef'
import { scrapeVITPaperVault } from '@/lib/scrapers/vit-papervault'
import { scrapeExamCooker } from '@/lib/scrapers/examcooker'
import { isCourseCodeFormat, normalizeCourseCode, searchCourseCatalog } from '@/lib/course-map'

export const runtime = 'nodejs'

type ScrapeOutcome =
  | Awaited<ReturnType<typeof scrapePapersService>>
  | Awaited<ReturnType<typeof scrapePapersCodeChef>>
  | Awaited<ReturnType<typeof scrapeVITPaperVault>>
  | Awaited<ReturnType<typeof scrapeExamCooker>>
type PapersOf<T> = T extends { papers: ReadonlyArray<infer P> } ? P : never
type ScrapedPaper = PapersOf<ScrapeOutcome>

function rejectionMessage(reason: unknown): string {
  if (typeof reason === 'object' && reason !== null && 'message' in reason) {
    const { message } = reason
    if (typeof message === 'string' && message) return message
  }
  return 'rejected'
}

/**
 * GET /api/public/papers/search?courseCode=BCSE302L[&examType=cat1][&year=2023]
 *
 * `courseCode` (aliases: course, q, query) is either an exact course code, or text that is
 * substring-matched (case-insensitive) against catalog codes and titles. A search with exactly one
 * catalog match uses that course; several matches return 400 `ambiguous_course` with
 * `candidates` so the caller can retry with an exact code. No nickname/acronym resolution.
 */
export async function GET(req: NextRequest) {
  const started = Date.now()
  try {
    const { searchParams } = new URL(req.url)
    const courseInput =
      searchParams.get('courseCode') ||
      searchParams.get('course') ||
      searchParams.get('q') ||
      searchParams.get('query')
    const examType = searchParams.get('examType') || searchParams.get('exam') || undefined
    const year = searchParams.get('year') || undefined

    if (!courseInput) {
      return NextResponse.json(
        {
          success: false,
          error: 'course_code_required',
          message: 'Provide a course code, or part of a course title to search the catalog.',
        },
        { status: 400 }
      )
    }

    let resolvedCourseCode = normalizeCourseCode(courseInput)
    if (!isCourseCodeFormat(resolvedCourseCode)) {
      const { total, results: candidates } = searchCourseCatalog(courseInput)
      const [onlyMatch] = candidates
      if (total === 1 && onlyMatch) {
        resolvedCourseCode = onlyMatch.code
      } else {
        return NextResponse.json(
          {
            success: false,
            error: total > 1 ? 'ambiguous_course' : 'unresolved_course_code',
            input: courseInput,
            message:
              total > 1
                ? `"${courseInput}" matches ${total} catalog courses; retry with one of the candidate course codes.`
                : `No catalog course code or title contains "${courseInput}".`,
            candidates,
            suggestions: [
              'Use the exact VIT course code (e.g., BCSE302L)',
              'Pick a course code from `candidates`',
            ],
          },
          { status: 400 }
        )
      }
    }

    const results = await Promise.allSettled([
      scrapePapersService(resolvedCourseCode, examType, year),
      scrapePapersCodeChef(resolvedCourseCode, examType, year),
      scrapeVITPaperVault(resolvedCourseCode, examType, year),
      scrapeExamCooker(resolvedCourseCode, examType, year),
    ])

    const papers: ScrapedPaper[] = []
    const sources: string[] = []
    const sourceErrors: Array<{ source: string; error: string }> = []

    const sourceNames = ['VIT Papers Archive', 'CodeChef', 'VIT Paper Vault', 'ExamCooker']

    results.forEach((r, idx) => {
      const name = sourceNames[idx] || `source_${idx}`
      if (r.status === 'fulfilled' && r.value) {
        if (r.value.success) {
          papers.push(...(r.value.papers || []))
          sources.push(('source' in r.value && r.value.source) || name)
        } else {
          const errMsg = ('error' in r.value && r.value.error) || 'unknown_error'
          sourceErrors.push({ source: name, error: errMsg })
        }
      } else if (r.status === 'rejected') {
        sourceErrors.push({ source: name, error: rejectionMessage(r.reason) })
      }
    })

    const seen = new Set<string>()
    const deduped = papers.filter(p => {
      if (!p.url) return false
      if (seen.has(p.url)) return false
      seen.add(p.url)
      return true
    })

    const elapsedMs = Date.now() - started

    if (deduped.length === 0) {
      return NextResponse.json({
        success: false,
        courseCode: resolvedCourseCode,
        examType: examType || null,
        year: year || null,
        papers: [],
        totalFound: 0,
        sources,
        sourceErrors,
        elapsedMs,
        message: `No papers found for ${resolvedCourseCode}${examType ? ' (' + examType + ')' : ''}${year ? ' ' + year : ''}.`,
        suggestions: [
          'Try removing examType or year filters',
          'Verify the course code format',
          'Try again later (sources may be temporarily unavailable)',
        ],
      })
    }

    return NextResponse.json({
      success: true,
      courseCode: resolvedCourseCode,
      examType: examType || null,
      year: year || null,
      totalFound: deduped.length,
      papers: deduped,
      sources: Array.from(new Set(sources)),
      sourceErrors: sourceErrors.length ? sourceErrors : undefined,
      elapsedMs,
      message: `Found ${deduped.length} paper(s) for ${resolvedCourseCode}${examType ? ' (' + examType + ')' : ''}${year ? ' ' + year : ''}.`,
    })
  } catch (error) {
    console.error('[public/papers/search] failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'internal_error',
        message: 'Unable to complete the search safely. Please try again later.',
      },
      { status: 500 }
    )
  }
}
 
