import { tool } from "ai"
import { z } from "zod"
import { scrapePapersCodeChef } from "./scrapers/papers-codechef"
import { scrapeVITPaperVault } from "./scrapers/vit-papervault"
import { scrapeFacultyInfo } from "./scrapers/faculty-scraper"
import { scrapePlacementInfo } from "./scrapers/placement-scraper"
import { getCourseCode } from "./question-generator"

export function createVITTools() {
  return {
    findPastPapers: tool({
      description: "find past examination papers for vit courses from real repositories. You can use course names or codes.",
      parameters: z.object({
        courseCode: z.string().describe("course code like BCSE302L or course name like 'database systems'"),
        examType: z.string().optional().describe("exam type: cat1, cat2, fat, quiz"),
        year: z.string().optional().describe("academic year like 2023, 2022"),
      }),
      execute: async ({ courseCode, examType, year }) => {
        try {
          let resolvedCourseCode = courseCode.trim().toUpperCase();
          
          if (!resolvedCourseCode.match(/^[A-Z]{4}\d{3}[A-Z]?$/)) {
            const mappedCode = getCourseCode(courseCode);
            if (mappedCode) {
              resolvedCourseCode = mappedCode;
            }
          }
          
          const results = await Promise.allSettled([
            scrapePapersCodeChef(resolvedCourseCode, examType, year),
            scrapeVITPaperVault(resolvedCourseCode, examType, year),
          ])

          const papers: any[] = [];
          const sources: any[] = [];

          results.forEach((result, index) => {
            if (result.status === "fulfilled" && result.value.success) {
              papers.push(...result.value.papers)
              sources.push(result.value.source)
            }
          })

          if (papers.length === 0) {
            return {
              success: false,
              courseCode,
              papers: [],
              message: `no papers found for ${courseCode}${examType ? ` (${examType})` : ""}${year ? ` from ${year}` : ""}. try checking the course code or contact faculty for materials.`,
              suggestions: [
                "verify the course code format (e.g., CSE1001, MAT1001)",
                "check with course faculty for official materials",
                "visit vit library for physical copies",
                "contact senior students or study groups",
              ],
            }
          }

          return {
            success: true,
            courseCode,
            examType,
            year,
            papers: papers,
            totalFound: papers.length,
            message: `found ${papers.length} papers for ${courseCode}${examType ? ` (${examType})` : ""}${year ? ` from ${year}` : ""}`,
            sources,
          }
        } catch (error) {
          let errorMessage = "unable to scrape papers at the moment. please try again later.";
          if (typeof error === "object" && error !== null && "message" in error) {
            errorMessage = (error as { message?: string }).message || errorMessage;
          }
          return {
            success: false,
            error: errorMessage,
            message: "unable to scrape papers at the moment. please try again later.",
          }
        }
      },
    }),

    getFacultyInfo: tool({
      description: "get current faculty information from vit official websites",
      parameters: z.object({
        department: z.string().optional().describe("department like computer science, mechanical, electronics"),
        facultyName: z.string().optional().describe("specific faculty member name"),
      }),
      execute: async ({ department, facultyName }) => {
        return await scrapeFacultyInfo(department, facultyName)
      },
    }),

    getPlacementInfo: tool({
      description: "get latest placement statistics and company information",
      parameters: z.object({
        year: z.string().optional().describe("academic year like 2024-25, 2023-24"),
        company: z.string().optional().describe("specific company name"),
      }),
      execute: async ({ year, company }) => {
        return await scrapePlacementInfo(year, company)
      },
    }),
  }
}
