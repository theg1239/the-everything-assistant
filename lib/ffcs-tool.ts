import * as z from 'zod'

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

export async function getCourseData(school: School = 'smec'): Promise<FFCSToolData> {
  const baseUrl =
    typeof window === 'undefined' ? process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000' : ''
  const response = await fetch(`${baseUrl}/ffcs/${school}.json`)
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

  const uniqueCourses = allCourses.filter(
    (element, index, self) =>
      self.findIndex(t => t.CODE === element.CODE && t.TITLE === element.TITLE) === index
  )

  return { allCourses, uniqueCourses }
}
