'use server'

import { db } from '../db'
import { papers } from '../db/schema'
import { desc, asc, ilike, and, or, eq, count, isNotNull, type SQL } from 'drizzle-orm'
import { z } from 'zod'

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform(value => value || undefined)

/** Server actions are callable from the client, so their inputs are validated at runtime. */
const SearchFiltersSchema = z.object({
  courseCode: optionalText,
  year: z.number().int().positive().optional(),
  slot: optionalText,
  semester: optionalText,
  examType: optionalText,
  query: optionalText,
})

const PaginationOptionsSchema = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
  sortBy: z.enum(['createdAt', 'title', 'year']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})

export type SearchFilters = z.input<typeof SearchFiltersSchema>
export type PaginationOptions = z.input<typeof PaginationOptionsSchema>

export interface PaperSummary {
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
}

export interface PaperListResult {
  papers: PaperSummary[]
  totalCount: number
  hasMore: boolean
  currentPage: number
  totalPages: number
}

export interface FilterOptions {
  courseCodes: string[]
  years: number[]
  slots: string[]
  semesters: string[]
  examTypes: string[]
}

export async function searchPapers(
  rawFilters: SearchFilters = {},
  rawPagination: PaginationOptions = {}
): Promise<PaperListResult> {
  try {
    const filters = SearchFiltersSchema.parse(rawFilters)
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = PaginationOptionsSchema.parse(rawPagination)

    const offset = (page - 1) * limit

    const conditions: SQL[] = []

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
      const queryCondition = or(
        ilike(papers.title, `%${filters.query}%`),
        ilike(papers.ocrText, `%${filters.query}%`)
      )
      if (queryCondition) conditions.push(queryCondition)
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    let orderByClause: SQL
    switch (sortBy) {
      case 'title':
        orderByClause = sortOrder === 'asc' ? asc(papers.title) : desc(papers.title)
        break
      case 'year':
        orderByClause = sortOrder === 'asc' ? asc(papers.year) : desc(papers.year)
        break
      case 'createdAt':
        orderByClause = sortOrder === 'asc' ? asc(papers.createdAt) : desc(papers.createdAt)
        break
    }

    const totalCountResult = await db.select({ count: count() }).from(papers).where(whereClause)

    const totalCount = totalCountResult[0]?.count ?? 0

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

export async function getPaperById(rawId: string) {
  try {
    const id = z.string().min(1).parse(rawId)
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

export async function deletePaper(rawId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const idResult = z.string().min(1).safeParse(rawId)
    if (!idResult.success) {
      return { success: false, error: 'Invalid paper id' }
    }
    const id = idResult.data

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
export async function getFilterOptions(): Promise<FilterOptions> {
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
