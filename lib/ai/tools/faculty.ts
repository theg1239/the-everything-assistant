import { tool } from 'ai'
import { z } from 'zod'

import { getCourseData, type School } from '@/lib/ffcs-tool'
import type { FacultyCourseRecord, FacultyResultEntry, FacultySchoolRecord, JsonValue } from '@/types/tools'

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)])
)

const facultyCourseSchema = z.object({
  code: z.string().optional(),
  title: z.string().optional(),
  slot: z.string().optional(),
  venue: z.string().optional(),
  type: z.string().optional(),
})

const facultyMemberSchema = z
  .object({
    name: z.string().optional(),
    department: z.string().optional(),
    designation: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    slot: z.string().optional(),
    room: z.string().optional(),
    profile_url: z.string().optional(),
    profileUrl: z.string().optional(),
    image_url: z.string().optional(),
    image: z.string().optional(),
    courses: z.array(facultyCourseSchema).optional(),
  })
  .catchall(jsonValueSchema)

const facultyDepartmentSchema = z.object({
  name: z.string().optional(),
  department: z.string().optional(),
  url: z.string().optional(),
  faculty: z.array(facultyMemberSchema).optional(),
})

const facultySchoolSchema = z.object({
  school: z.string().optional(),
  departments: z.array(facultyDepartmentSchema).optional(),
})

const facultyDataSchema: z.ZodType<FacultySchoolRecord[]> = z.array(facultySchoolSchema)

const SCHOOL_VALUES: School[] = ['smec', 'score', 'scope', 'sbst', 'sce', 'scheme', 'select', 'sense']
const toSchool = (value: string): School | null => {
  const normalized = value.toLowerCase() as School
  return SCHOOL_VALUES.includes(normalized) ? normalized : null
}

const DEPARTMENT_ACRONYMS: Record<string, string[]> = {
  cse: [
    'computer science and engineering',
    'computer science',
    'school of computer science and engineering',
    'scope',
  ],
  scope: [
    'computer science and engineering',
    'computer science',
    'school of computer science and engineering',
    'cse',
  ],
  smec: ['mechanical engineering', 'school of mechanical engineering', 'mechanical'],
  mech: ['mechanical engineering', 'school of mechanical engineering', 'mechanical', 'smec'],
  ece: ['electronics and communication engineering', 'electronics', 'school of electronics engineering'],
  ssl: ['school of social sciences and languages', 'social sciences', 'languages'],
  sas: ['school of advanced sciences', 'advanced sciences', 'sas'],
  score: ['information technology', 'it', 'school of information technology and engineering', 'score'],
  civil: ['civil engineering', 'school of civil engineering', 'civil', 'sce'],
  sce: ['civil engineering', 'school of civil engineering', 'civil', 'sce'],
}

const deriveSchoolAcronym = (name: string): string => {
  const match = name.match(/\(([^)]+)\)/)
  if (match && match[1]) {
    return match[1].toLowerCase()
  }
  return name.toLowerCase()
}

function normalizeString(str?: string): string {
  return (str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function getLevenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + 1)
      }
    }
  }
  return matrix[a.length][b.length]
}

function matchesDepartment(deptName: string, filter: string): boolean {
  const normDept = normalizeString(deptName)
  const normFilter = normalizeString(filter)

  if (normDept.includes(normFilter) || normFilter.includes(normDept)) return true

  if (DEPARTMENT_ACRONYMS[normFilter]) {
    if (DEPARTMENT_ACRONYMS[normFilter].some(full => normDept.includes(normalizeString(full)))) {
      return true
    }
  }

  if (DEPARTMENT_ACRONYMS[normDept]) {
    if (DEPARTMENT_ACRONYMS[normDept].some(full => normFilter.includes(normalizeString(full)))) {
      return true
    }
  }

  for (const [acronym, names] of Object.entries(DEPARTMENT_ACRONYMS)) {
    if (
      names.some(
        n =>
          normDept.includes(normalizeString(n)) &&
          (normFilter === acronym || normFilter.includes(acronym) || acronym.includes(normFilter))
      )
    ) {
      return true
    }
    if (
      names.some(
        n =>
          normFilter.includes(normalizeString(n)) &&
          (normDept === acronym || normDept.includes(acronym) || acronym.includes(normDept))
      )
    ) {
      return true
    }
  }

  return false
}

export function facultyTools() {
  const getFacultyInfo = tool({
    description: `Get current faculty information from a local JSON file (public/faculty.json). NEVER return all faculty members at once—ALWAYS require at least a department or faculty name filter. If no filter is provided, ask the user to specify a department or faculty name. Returns school, department, and faculty info. Do NOT provide a full list of all faculty.

For best results, try both department acronyms (e.g., 'CSE', 'SMEC', 'SCORE', 'CIVIL') and full or partial department names (e.g., 'computer science', 'school of mechanical engineering', 'information technology', 'civil engineering'). The search is robust to acronyms, full names, and partial matches in either direction.`,
    inputSchema: z.object({
      department: z.string().optional().describe('Department name or acronym to filter faculty (e.g., CSE, Mechanical).'),
      facultyName: z.string().optional().describe('Specific faculty member name'),
      includeCourses: z.boolean().optional().describe('If true, also return courses the faculty teaches.'),
      school: z
        .enum(['smec', 'score', 'scope', 'sbst', 'sce', 'scheme', 'select', 'sense'])
        .optional()
        .describe(
          'Limit course lookup to a specific school; defaults to all, while using the parameter, use the acronym (like smec, score, scope, sbst, sce, scheme, select, sense)'
        ),
      courseQuery: z.string().optional().describe('Course code or title to filter faculty who teach a specific course.'),
    }),
    execute: async ({ department, facultyName, includeCourses = false, school, courseQuery }) => {
      try {
        const res = await fetch(
          typeof window === 'undefined'
            ? `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/faculty.json`
            : '/faculty.json'
        )
        if (!res.ok) throw new Error('Could not load faculty.json')
        const schools = facultyDataSchema.parse(await res.json())

        let results: FacultyResultEntry[] = []
        const deptFilter = department ? department.toLowerCase() : null
        const facultyFilter = facultyName ? facultyName.toLowerCase() : null
        const courseFilter = courseQuery ? courseQuery.toLowerCase() : null

        const normalizeName = (value?: string) =>
          (value ?? '')
            .replace(/^Dr\.?\s*|\s+/g, '')
            .toLowerCase()
            .trim()

        for (const schoolEntry of schools) {
          const schoolName = schoolEntry.school
          if (!schoolName) continue
          const departments = schoolEntry.departments || []
          let schoolMatches = false
          if (deptFilter && matchesDepartment(schoolName, deptFilter)) {
            schoolMatches = true
          }

          for (const dept of departments) {
            const departmentName = dept.department || dept.name || ''
            const facultyArr = dept.faculty || []

            const considerDept = schoolMatches || (deptFilter ? matchesDepartment(departmentName || schoolName, deptFilter) : true)
            if (!considerDept) continue

            for (const facultyEntry of facultyArr) {
              const facultyNameValue = facultyEntry.name
              if (!facultyNameValue) continue

              if (facultyFilter) {
                const name = normalizeString(facultyNameValue)
                const filter = normalizeString(facultyFilter)
                const nameTokens = name.split(' ')
                const filterTokens = filter.split(' ')
                let allTokensMatch = true
                for (const fToken of filterTokens) {
                  let tokenMatched = false
                  for (const nToken of nameTokens) {
                    if (fToken.length < 4) {
                      if (nToken === fToken) {
                        tokenMatched = true
                        break
                      }
                    } else {
                      const dist = getLevenshteinDistance(nToken, fToken)
                      if (nToken.includes(fToken) || dist <= 1) {
                        tokenMatched = true
                        break
                      }
                    }
                  }
                  if (!tokenMatched) {
                    allTokensMatch = false
                    break
                  }
                }
                if (!allTokensMatch) continue
              }

              let facultyRecord: FacultyResultEntry = {
                name: facultyNameValue,
                department: facultyEntry.department || departmentName || schoolName,
                school: schoolName,
                email: facultyEntry.email || undefined,
                profileUrl: facultyEntry.profile_url || facultyEntry.profileUrl || undefined,
                ...facultyEntry,
                image: facultyEntry.image_url || facultyEntry.image || undefined,
              }

              let teachesCourse = true
              if (courseFilter) {
                const normalizedSchool = toSchool(deriveSchoolAcronym(schoolName))
                if (!normalizedSchool) {
                  teachesCourse = false
                } else {
                  try {
                    const { allCourses } = await getCourseData(normalizedSchool)
                    const facultyNameNormalized = normalizeName(facultyNameValue)
                    const facultyCourses = allCourses.filter(course => {
                      const courseFacultyNormalized = normalizeName(course.FACULTY)
                      const courseTitle = course.TITLE.toLowerCase()
                      const courseCode = course.CODE.toLowerCase()
                      return (
                        facultyNameNormalized.length > 0 &&
                        (courseFacultyNormalized.includes(facultyNameNormalized) ||
                          facultyNameNormalized.includes(courseFacultyNormalized)) &&
                        (courseTitle.includes(courseFilter) || courseCode.includes(courseFilter))
                      )
                    })
                    if (facultyCourses.length === 0) {
                      teachesCourse = false
                    } else if (includeCourses) {
                      facultyRecord.courses = facultyCourses.map(course => ({
                        code: course.CODE,
                        title: course.TITLE,
                        slot: course.SLOT,
                        type: course.TYPE,
                        venue: course.VENUE,
                      }))
                    }
                  } catch {
                    teachesCourse = false
                  }
                }
              } else if (includeCourses) {
                const normalizedSchool = toSchool(deriveSchoolAcronym(schoolName))
                if (normalizedSchool) {
                  try {
                    const { allCourses } = await getCourseData(normalizedSchool)
                    const facultyNameNormalized = normalizeName(facultyNameValue)
                    const facultyCourses = allCourses.filter(course => {
                      const courseFacultyNormalized = normalizeName(course.FACULTY)
                      return (
                        facultyNameNormalized.length > 0 &&
                        (courseFacultyNormalized.includes(facultyNameNormalized) ||
                          facultyNameNormalized.includes(courseFacultyNormalized))
                      )
                    })
                    facultyRecord.courses = facultyCourses.map(course => ({
                      code: course.CODE,
                      title: course.TITLE,
                      slot: course.SLOT,
                      type: course.TYPE,
                      venue: course.VENUE,
                    }))
                  } catch {
                    facultyRecord.courses = []
                  }
                } else {
                  facultyRecord.courses = []
                }
              }

              if (teachesCourse) {
                results.push(facultyRecord)
              }
            }
          }
        }

        return {
          success: true,
          total: results.length,
          faculty: results,
          message: results.length
            ? `Found ${results.length} faculty${department ? ' in ' + department : ''}${facultyName ? ' matching ' + facultyName : ''}${courseQuery ? ' teaching ' + courseQuery : ''}.`
            : 'No faculty found. Please check the spelling or try a different department, name, or course.',
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to search faculty.json',
          message: error.message,
        }
      }
    },
  })

  return { getFacultyInfo }
}

export type FacultyTools = ReturnType<typeof facultyTools>

