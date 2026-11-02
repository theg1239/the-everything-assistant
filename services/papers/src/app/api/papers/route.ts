import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { searchPapers, type SearchFilters } from '../../../actions/searchPapers'

/** Empty/missing values become undefined; unparsable numbers fall back to the default. */
const optionalParam = z
  .string()
  .nullable()
  .transform(value => value || undefined)

const positiveIntParam = (fallback: number | undefined) =>
  z.coerce.number().int().positive().optional().catch(fallback)

const PapersQuerySchema = z.object({
  query: optionalParam,
  courseCode: optionalParam,
  subject: optionalParam,
  year: positiveIntParam(undefined),
  slot: optionalParam,
  semester: optionalParam,
  examType: optionalParam,
  exam: optionalParam,
  page: positiveIntParam(1),
  limit: positiveIntParam(50),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const params = PapersQuerySchema.parse({
      query: searchParams.get('query'),
      courseCode: searchParams.get('courseCode'),
      subject: searchParams.get('subject'),
      year: searchParams.get('year') ?? undefined,
      slot: searchParams.get('slot'),
      semester: searchParams.get('semester'),
      examType: searchParams.get('examType'),
      exam: searchParams.get('exam'),
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    })

    const filters: SearchFilters = {
      query: params.query,
      courseCode: params.courseCode ?? params.subject,
      year: params.year,
      slot: params.slot,
      semester: params.semester,
      examType: params.examType ?? params.exam,
    }

    const result = await searchPapers(filters, {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      sortBy: 'createdAt',
    })

    const response = {
      success: true,
      papers: result.papers.map(paper => ({
        _id: paper.id,
        title: paper.title,
        name: paper.title,
        paperName: paper.title,
        url: paper.fileUrl,
        downloadUrl: paper.fileUrl,
        finalUrl: paper.fileUrl,
        metadata: `${paper.slot || ''} ${paper.semester || ''}`.trim(),
        description: paper.ocrText ? paper.ocrText.substring(0, 200) + '...' : '',
        examType: paper.examType,
        exam: paper.examType,
        year: paper.year?.toString(),
        academicYear: paper.year?.toString(),
        slot: paper.slot,
        semester: paper.semester,
        subject: paper.courseCode,
        courseCode: paper.courseCode,
        thumbnailUrl: paper.thumbnailUrl,
        originalFilename: paper.originalFilename,
        fileSize: paper.fileSize,
        mimeType: paper.mimeType,
        createdAt: paper.createdAt,
      })),
      totalCount: result.totalCount,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      hasMore: result.hasMore,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error in papers API:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        papers: [],
      },
      { status: 500 }
    )
  }
}
