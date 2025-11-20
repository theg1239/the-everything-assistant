import { tool } from 'ai'
import * as z from 'zod'

import { scrapePapersCodeChef } from '@/lib/scrapers/papers-codechef'
import { scrapePapersService } from '@/lib/scrapers/papers-scraper'
import { scrapeVITPaperVault } from '@/lib/scrapers/vit-papervault'
import { scrapeExamCooker } from '@/lib/scrapers/examcooker'
import { getCourseCode } from '@/lib/question-generator'
import { getAllCourseMatches } from '@/lib/course-map'

export function paperTools() {
  const findPastPapersInputSchema = z.object({
    courseCode: z
      .string()
      .optional()
      .describe("course code like BCSE302L or course name like 'database systems'"),
    examType: z.string().optional().describe('exam type: cat1, cat2, fat, quiz'),
    year: z.string().optional().describe('academic year like 2023, 2022'),
  })

  const findPastPapers = tool({
    description:
      "find past examination papers for VIT courses from real repositories. You can use course names or codes. You don' need the user to specify the year, when no year is specified, the tool will search for all available years.",
    inputSchema: findPastPapersInputSchema,
    execute: async ({ courseCode, examType, year }: z.infer<typeof findPastPapersInputSchema>) => {
      try {
        if (!courseCode) {
          return {
            success: false,
            error: 'Course code required',
            requiresCourseCode: true,
            message: 'I could not find the course code for the course, can you provide it?',
            suggestion: 'You can use course codes like BCSE302L or course names like "database systems".',
          }
        }

        let resolvedCourseCode = courseCode.trim().toUpperCase()

        if (!/^[A-Z]{4}\d{3}[A-Z]?$/.test(resolvedCourseCode)) {
          const mappedCode = getCourseCode(courseCode)
          if (mappedCode) {
            resolvedCourseCode = mappedCode
          } else {
            const courseMatches = getAllCourseMatches(courseCode)
            if (courseMatches.length > 0) {
              resolvedCourseCode = courseMatches[0].code
            } else {
              return {
                success: false,
                courseCode,
                papers: [],
                message: `Could not find a valid course code for "${courseCode}". Please provide a valid VIT course code.`,
                suggestions: [
                  'Use the exact VIT course code',
                  'Check your course timetable or VTOP for the exact course code',
                  'Contact course faculty for the correct course code',
                ],
              }
            }
          }
        }

        const results = await Promise.allSettled([
          scrapePapersService(resolvedCourseCode, examType, year),
          scrapePapersCodeChef(resolvedCourseCode, examType, year),
          scrapeVITPaperVault(resolvedCourseCode, examType, year),
          scrapeExamCooker(resolvedCourseCode, examType, year),
        ])

        const papers: any[] = []
        const sources: any[] = []

        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value?.success) {
            papers.push(...(r.value.papers || []))
            sources.push(r.value.source)
          }
        })

        if (papers.length === 0) {
          return {
            success: false,
            courseCode: resolvedCourseCode,
            originalQuery: courseCode,
            papers: [],
            message: `No papers found for course code "${resolvedCourseCode}"${
              resolvedCourseCode !== courseCode ? ` (searched for: "${courseCode}")` : ''
            }${examType ? ` (${examType})` : ''}${year ? ` from ${year}` : ''}.`,
            suggestions: [
              resolvedCourseCode !== courseCode
                ? `Double-check that "${resolvedCourseCode}" is the correct course code for "${courseCode}"`
                : 'Verify the course code format (e.g., MECH2001, BMEE302L)',
              'Try different exam types: CAT1, CAT2, FAT, or Quiz',
              'Check with course faculty for official study materials',
              'Visit VIT library for physical copies of past papers',
              'Contact senior students or study groups for materials',
            ],
          }
        }

        return {
          success: true,
          courseCode,
          examType,
          year,
          papers,
          totalFound: papers.length,
          message: `found ${papers.length} papers for ${courseCode}${examType ? ` (${examType})` : ''}${year ? ` from ${year}` : ''}`,
          sources,
        }
      } catch (err: any) {
        const errorMessage =
          typeof err === 'object' && err?.message
            ? err.message
            : 'unable to scrape papers at the moment. please try again later.'
        return {
          success: false,
          error: errorMessage,
          message: 'unable to scrape papers at the moment. please try again later.',
        }
      }
    },
  })

  return { findPastPapers }
}

export type PaperTools = ReturnType<typeof paperTools>
