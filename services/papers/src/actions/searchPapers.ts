'use server'

import { db } from '../db'
import { papers } from '../db/schema'
import { desc, asc, ilike, and, or, eq, count, isNotNull } from 'drizzle-orm'

export interface SearchFilters {
  courseCode?: string
  year?: number
  slot?: string
  semester?: string
  examType?: string
  query?: string
}

export interface PaginationOptions {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'title' | 'year'
  sortOrder?: 'asc' | 'desc'
}

export interface SearchResult {
  papers: Array<{
    id: string
    title: string
    courseCode?: string
    year?: number
    slot?: string
    semester?: string
    examType?: string
    fileUrl: string
    thumbnailUrl: string
    createdAt: Date
    originalFilename?: string
    fileSize?: number
    mimeType?: string
    ocrText?: string
  }>
  totalCount: number
  hasMore: boolean
  currentPage: number
  totalPages: number
}

export interface PaperListResult {
  papers: Array<{
    id: string
    title: string
    courseCode?: string
    year?: number
    slot?: string
    semester?: string
    examType?: string
    fileUrl: string
    thumbnailUrl: string
    createdAt: Date
    originalFilename?: string
    fileSize?: number
  }>
  totalCount: number
  hasMore: boolean
  currentPage: number
  totalPages: number
}

export async function searchPapers(
  filters: SearchFilters = {},
  pagination: PaginationOptions = {}
): Promise<PaperListResult> {
  try {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination

    const offset = (page - 1) * limit

    const conditions = []

    if (filters.courseCode) {
      conditions.push(ilike(papers.courseCode, `%${filters.courseCode}%`))
    }

    if (filters.year) {
      conditions.push(eq(papers.year, filters.year))
    }

    if (filters.slot) {
      conditions.push(ilike(papers.slot, `%${filters.slot}%`))
    }

    if (filters.semester) {
      conditions.push(ilike(papers.semester, `%${filters.semester}%`))
    }

    if (filters.examType) {
      conditions.push(ilike(papers.examType, `%${filters.examType}%`))
    }

    if (filters.query) {
      conditions.push(
        or(ilike(papers.title, `%${filters.query}%`), ilike(papers.ocrText, `%${filters.query}%`))
      )
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    let orderByClause
    switch (sortBy) {
      case 'title':
        orderByClause = sortOrder === 'asc' ? asc(papers.title) : desc(papers.title)
        break
      case 'year':
        orderByClause = sortOrder === 'asc' ? asc(papers.year) : desc(papers.year)
        break
      default:
        orderByClause = sortOrder === 'asc' ? asc(papers.createdAt) : desc(papers.createdAt)
    }

    const totalCountResult = await db.select({ count: count() }).from(papers).where(whereClause)

    const totalCount = totalCountResult[0]?.count || 0

    const papersResult = await db
      .select({
        id: papers.id,
        title: papers.title,
        courseCode: papers.courseCode,
        year: papers.year,
        slot: papers.slot,
        semester: papers.semester,
        examType: papers.examType,
        fileUrl: papers.fileUrl,
        thumbnailUrl: papers.thumbnailUrl,
        createdAt: papers.createdAt,
        originalFilename: papers.originalFilename,
        fileSize: papers.fileSize,
        mimeType: papers.mimeType,
        ocrText: papers.ocrText,
      })
      .from(papers)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset)

    const totalPages = Math.ceil(totalCount / limit)
    const hasMore = page < totalPages

    return {
      papers: papersResult.map(paper => ({
        ...paper,
        courseCode: paper.courseCode || undefined,
        year: paper.year || undefined,
        slot: paper.slot || undefined,
        semester: paper.semester || undefined,
        examType: paper.examType || undefined,
        originalFilename: paper.originalFilename || undefined,
        fileSize: paper.fileSize || undefined,
        mimeType: paper.mimeType || undefined,
        ocrText: paper.ocrText || undefined,
        // URL already includes extension since we upload with extension
        fileUrl: paper.fileUrl,
      })),
      totalCount,
      hasMore,
      currentPage: page,
      totalPages,
    }
  } catch (error) {
    console.error('Error searching papers:', error)
    throw new Error('Failed to search papers')
  }
}

export async function getPaperById(id: string) {
  try {
    const [paper] = await db.select().from(papers).where(eq(papers.id, id)).limit(1)

    if (!paper) {
      return null
    }

    return {
      ...paper,
      courseCode: paper.courseCode || undefined,
      year: paper.year || undefined,
      slot: paper.slot || undefined,
      semester: paper.semester || undefined,
      examType: paper.examType || undefined,
      originalFilename: paper.originalFilename || undefined,
      fileSize: paper.fileSize || undefined,
    }
  } catch (error) {
    console.error('Error getting paper by ID:', error)
    throw new Error('Failed to get paper')
  }
}

export async function deletePaper(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const [paperToDelete] = await db
      .select({
        cloudinaryPublicId: papers.cloudinaryPublicId,
        thumbnailPublicId: papers.thumbnailPublicId,
      })
      .from(papers)
      .where(eq(papers.id, id))
      .limit(1)

    if (!paperToDelete) {
      return { success: false, error: 'Paper not found' }
    }

    const { v2: cloudinary } = await import('cloudinary')

    if (paperToDelete.cloudinaryPublicId) {
      await cloudinary.uploader.destroy(paperToDelete.cloudinaryPublicId)
    }

    if (paperToDelete.thumbnailPublicId) {
      await cloudinary.uploader.destroy(paperToDelete.thumbnailPublicId)
    }

    await db.delete(papers).where(eq(papers.id, id))

    return { success: true }
  } catch (error) {
    console.error('Error deleting paper:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete paper',
    }
  }
}
export async function getFilterOptions() {
  try {
    const courseCodes = await db
      .selectDistinct({ courseCode: papers.courseCode })
      .from(papers)
      .where(isNotNull(papers.courseCode))

    const years = await db
      .selectDistinct({ year: papers.year })
      .from(papers)
      .where(isNotNull(papers.year))
      .orderBy(desc(papers.year))

    const slots = await db
      .selectDistinct({ slot: papers.slot })
      .from(papers)
      .where(isNotNull(papers.slot))

    const semesters = await db
      .selectDistinct({ semester: papers.semester })
      .from(papers)
      .where(isNotNull(papers.semester))

    const examTypes = await db
      .selectDistinct({ examType: papers.examType })
      .from(papers)
      .where(isNotNull(papers.examType))

    return {
      courseCodes: courseCodes.map(c => c.courseCode).filter(Boolean),
      years: years.map(y => y.year).filter(Boolean),
      slots: slots.map(s => s.slot).filter(Boolean),
      semesters: semesters.map(s => s.semester).filter(Boolean),
      examTypes: examTypes.map(e => e.examType).filter(Boolean),
    }
  } catch (error) {
    console.error('Error getting filter options:', error)
    throw new Error('Failed to get filter options')
  }
}
