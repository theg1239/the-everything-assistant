import { NextRequest, NextResponse } from 'next/server'
import { searchPapers } from '../../../actions/searchPapers'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const query = searchParams.get('query') || undefined
    const courseCode = searchParams.get('courseCode') || searchParams.get('subject') || undefined
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined
    const slot = searchParams.get('slot') || undefined
    const semester = searchParams.get('semester') || undefined
    const examType = searchParams.get('examType') || searchParams.get('exam') || undefined
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50

    const filters: any = {}
    if (query) filters.query = query
    if (courseCode) filters.courseCode = courseCode
    if (year) filters.year = year
    if (slot) filters.slot = slot
    if (semester) filters.semester = semester
    if (examType) filters.examType = examType

    const pagination = {
      page,
      limit,
      sortBy: 'createdAt' as const
    }

    // Call the search function
    const result = await searchPapers(filters, pagination)

    // Transform the result to match the expected API format
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
        description: (paper as any).ocrText ? (paper as any).ocrText.substring(0, 200) + '...' : '',
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
        mimeType: (paper as any).mimeType,
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
