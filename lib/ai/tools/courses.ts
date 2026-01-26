import { tool } from 'ai'
import * as z from 'zod/v3';

import { findFullCourseName, searchCoursesByName, getAllCourseMatches, recognizeCourseInText } from '@/lib/course-map'
import { getCourseData, type School } from '@/lib/ffcs-tool'

const SCHOOL_VALUES: School[] = ['smec', 'score', 'scope', 'sbst', 'sce', 'scheme', 'select', 'sense']

const toSchool = (value: string): School | null => {
  const normalized = value.toLowerCase() as School
  return SCHOOL_VALUES.includes(normalized) ? normalized : null
}

export function courseTools() {
  const resolveCourseCode = tool({
    description:
      'Resolve a VIT course name, acronym, or partial description to canonical course codes using the local course map. Use this before any course-specific tools (past papers, VTOP course materials, FFCS lookups) when the user did not provide the exact course code.',
    inputSchema: z.object({
      query: z
        .string()
        .min(1, 'Provide a course name, acronym, or code to resolve.')
        .describe(
          'Course name, acronym, or partial code. Examples: "database systems", "DSA", "BCSE302L", "machine learning lab".'
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe('Maximum number of candidate codes to return (default 5).'),
    }),
    execute: async ({ query, limit }) => {
      const cleanedQuery = query.trim()
      if (!cleanedQuery) {
        return {
          success: false,
          message: 'Please provide a course name, acronym, or partial code to resolve.',
        }
      }

      const limitValue = Math.max(1, Math.min(limit ?? 5, 10))
      let matches = getAllCourseMatches(cleanedQuery)

      if (matches.length === 0) {
        const fallback = searchCoursesByName(cleanedQuery)
        matches = fallback.map(match => ({
          code: match.code,
          name: match.name,
          matchType: 'name_similarity',
        }))
      }

      const recognizedCourses = recognizeCourseInText(cleanedQuery)
      const limitedMatches = matches.slice(0, limitValue)
      const normalizedName = findFullCourseName(
        limitedMatches[0]?.code || cleanedQuery.toUpperCase()
      )

      if (limitedMatches.length === 0) {
        return {
          success: false,
          query: cleanedQuery,
          message: `No VIT course matches found for "${cleanedQuery}".`,
          suggestions: [
            'Check the spelling or include more of the course title (e.g., "database systems lab").',
            'Include any known acronym such as DSA, DBMS, ML, etc.',
            'Mention part of the official course code if available (e.g., BCSE, BMAT).',
          ],
          recognizedCourses,
        }
      }

      return {
        success: true,
        query: cleanedQuery,
        matches: limitedMatches,
        totalMatches: matches.length,
        normalizedName,
        recognizedCourses,
        primary: limitedMatches[0],
        limitUsed: limitValue,
        message:
          limitedMatches.length === 1
            ? `Resolved "${cleanedQuery}" to ${limitedMatches[0].code} (${limitedMatches[0].name}).`
            : `Found ${limitedMatches.length} candidate course codes for "${cleanedQuery}".`,
      }
    },
  })

  const getCourseInfo = tool({
    description:
      'Get information about courses from the FFCS dataset (supports all schools: SMEC, SCORE, SCOPE, SBST, SCE, SCHEME, SELECT, SENSE). Returns faculty names, slots, venue, etc.',
    inputSchema: z.object({
      school: z
        .enum(['smec', 'score', 'scope', 'sbst', 'sce', 'scheme', 'select', 'sense'])
        .describe(
          'The school to search within. Examples: smec (mechanical), score (information tech), scope (computer science), sbst (biosciences and technology), sce (civil), scheme (chemical engineering), select (electrical engineering), sense (electronics and communication engineering'
        ),
      courseQuery: z.string().describe('The course code or title to search for. Can be a partial match.'),
      slot: z.string().optional().describe('Specific slot to filter by (e.g., "A1", "L1+L2").'),
    }),
    execute: async ({ school, courseQuery, slot }) => {
      try {
        const { allCourses } = await getCourseData(school)

        let matchCodes: string[] = []
        const matches = getAllCourseMatches(courseQuery)
        if (matches.length > 0) matchCodes = matches.map(m => m.code.toUpperCase())

        let filteredCourses = allCourses.filter(course => {
          if (matchCodes.length) {
            return matchCodes.includes(course.CODE.toUpperCase())
          }
          return (
            course.CODE.toLowerCase().includes(courseQuery.toLowerCase()) ||
            course.TITLE.toLowerCase().includes(courseQuery.toLowerCase())
          )
        })

        if (slot) {
          filteredCourses = filteredCourses.filter(course => course.SLOT === slot)
        }

        if (filteredCourses.length === 0) {
          return {
            success: true,
            message:
              `No courses found matching "${courseQuery}"` + (slot ? ` in slot ${slot}` : '') +
              ` for ${school.toUpperCase()} school.`,
            results: [],
          }
        }

        const results = filteredCourses.map(course => ({
          code: course.CODE,
          title: course.TITLE,
          faculty: course.FACULTY,
          slot: course.SLOT,
          type: course.TYPE,
        }))

        return {
          success: true,
          message: `Found ${results.length} matching course(s).`,
          results,
        }
      } catch (error) {
        console.error('Error in getCourseInfo tool:', error)
        return {
          success: false,
          message: 'An error occurred while fetching course information.',
        }
      }
    },
  })

  return { resolveCourseCode, getCourseInfo }
}

export type CourseTools = ReturnType<typeof courseTools>

