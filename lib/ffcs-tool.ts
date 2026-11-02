import * as z from 'zod'
import { memoizeAsyncByKey, publicAssetUrl } from './static-data'

export interface Course {
  CODE: string
  TITLE: string
  TYPE: string
  CREDITS: string
  VENUE: string
  SLOT: string
  FACULTY: string
}

export interface FFCSToolData {
  allCourses: Course[]
  uniqueCourses: Course[]
}

export type School = 'smec' | 'score' | 'scope' | 'sbst' | 'sce' | 'scheme' | 'select' | 'sense'

const rawCourseSessionSchema = z.object({
  type: z.string().optional(),
  venue: z.string().optional(),
  slot: z.string().optional(),
  faculty: z.string().optional(),
})

const rawCourseDataSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(rawCourseSessionSchema))
)

/**
 * Fetched, validated and flattened once per school per instance. The returned arrays
 * are shared across requests — callers only filter/map them, never mutate.
 */
const loadCourseData = memoizeAsyncByKey(async (school: School): Promise<FFCSToolData> => {
  const response = await fetch(publicAssetUrl(`/ffcs/${school}.json`))
  if (!response.ok) {
    throw new Error(`Failed to fetch course data for ${school}`)
  }
  const data = rawCourseDataSchema.parse(await response.json())

  const allCourses: Course[] = []

  Object.values(data).forEach(category => {
    Object.entries(category).forEach(([courseKey, sessions]) => {
      const [codePart, ...titleRest] = courseKey.split(' - ')
      const code = (codePart ?? '').trim()
      const title = titleRest.join(' - ').trim()
      sessions.forEach(session => {
        allCourses.push({
          CODE: code,
          TITLE: title,
          TYPE: session.type ?? '',
          CREDITS: '',
          VENUE: session.venue ?? '',
          SLOT: session.slot ?? '',
          FACULTY: session.faculty ?? '',
        })
      })
    })
  })

  // First occurrence of each (CODE, TITLE), in order — O(n) instead of findIndex's O(n²).
  const seen = new Set<string>()
  const uniqueCourses = allCourses.filter(course => {
    const key = `${course.CODE}\u0000${course.TITLE}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { allCourses, uniqueCourses }
})

export async function getCourseData(school: School = 'smec'): Promise<FFCSToolData> {
  return loadCourseData(school)
}
