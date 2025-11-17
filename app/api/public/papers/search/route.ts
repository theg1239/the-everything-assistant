import { NextRequest, NextResponse } from 'next/server'
import { scrapePapersService } from '@/lib/scrapers/papers-scraper'
import { scrapePapersCodeChef } from '@/lib/scrapers/papers-codechef'
import { scrapeVITPaperVault } from '@/lib/scrapers/vit-papervault'
import { scrapeExamCooker } from '@/lib/scrapers/examcooker'
import { getCourseCode } from '@/lib/question-generator'
import { getAllCourseMatches } from '@/lib/course-map'

export const runtime = 'nodejs'

// Scraping + aggregation search endpoint (GET only)
// Params: course|courseCode (required), exam|examType (optional), year (optional)
export async function GET(req: NextRequest) {
  const started = Date.now()
  try {
    const { searchParams } = new URL(req.url)
    const courseInput = searchParams.get('courseCode') || searchParams.get('course')
    const examType = searchParams.get('examType') || searchParams.get('exam') || undefined
    const year = searchParams.get('year') || undefined

    if (!courseInput) {
      return NextResponse.json(
        {
          success: false,
          error: 'course_code_required',
          message: 'Provide a course code or recognizable course name.',
        },
        { status: 400 }
      )
    }

    let resolvedCourseCode = courseInput.trim().toUpperCase()
    if (!/^[A-Z]{4}\d{3}[A-Z]?$/.test(resolvedCourseCode)) {
      const mapped = getCourseCode(courseInput)
      if (mapped) {
        resolvedCourseCode = mapped
      } else {
        const matches = getAllCourseMatches(courseInput)
        if (matches.length > 0) {
          resolvedCourseCode = matches[0].code
        }
      }
    }

    if (!/^[A-Z]{4}\d{3}[A-Z]?$/.test(resolvedCourseCode)) {
      return NextResponse.json(
        {
          success: false,
            error: 'unresolved_course_code',
            input: courseInput,
            message: `Could not resolve a valid course code for "${courseInput}"`,
            suggestions: [
              'Use the exact VIT course code (e.g., BCSE302L)',
              'Try a different spelling of the course name',
              'Provide at least 2 distinctive words from the course title',
            ],
        },
        { status: 400 }
      )
    }

    const results = await Promise.allSettled([
      scrapePapersService(resolvedCourseCode, examType, year),
      scrapePapersCodeChef(resolvedCourseCode, examType, year),
      scrapeVITPaperVault(resolvedCourseCode, examType, year),
      scrapeExamCooker(resolvedCourseCode, examType, year),
    ])

    const papers: any[] = []
    const sources: string[] = []
    const sourceErrors: Array<{ source: string; error: string }> = []

    const sourceNames = ['VIT Papers Archive', 'CodeChef', 'VIT Paper Vault', 'ExamCooker']

    results.forEach((r, idx) => {
      const name = sourceNames[idx] || `source_${idx}`
      if (r.status === 'fulfilled') {
        if (r.value.success) {
          papers.push(...r.value.papers)
          sources.push((r.value as any).source || name)
        } else {
          const errMsg = (r.value as any)?.error || 'unknown_error'
          sourceErrors.push({ source: name, error: errMsg })
        }
      } else {
        sourceErrors.push({ source: name, error: r.reason?.message || 'rejected' })
      }
    })

    // Deduplicate by URL (simple)
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
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'internal_error' },
      { status: 500 }
    )
  }
}
 
