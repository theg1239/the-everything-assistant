import { tool } from "ai"
import { z } from "zod"
import { scrapePapersCodeChef } from "./scrapers/papers-codechef"
import { scrapeVITPaperVault } from "./scrapers/vit-papervault"
import { scrapeFacultyInfo } from "./scrapers/faculty-scraper"
import { scrapePlacementInfo } from "./scrapers/placement-scraper"

export function createVITTools() {
  return {
    findPastPapers: tool({
      description: "find past examination papers for vit courses from real repositories",
      parameters: z.object({
        courseCode: z.string().describe("course code like CSE1001, MAT1001, ECE1001"),
        examType: z.string().optional().describe("exam type: cat1, cat2, fat, quiz"),
        year: z.string().optional().describe("academic year like 2023, 2022"),
      }),
      execute: async ({ courseCode, examType, year }) => {
        try {
          const results = await Promise.allSettled([
            scrapePapersCodeChef(courseCode, examType, year),
            scrapeVITPaperVault(courseCode, examType, year),
          ])

          const papers = []
          const sources = []

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
            papers: papers.slice(0, 15),
            totalFound: papers.length,
            message: `found ${papers.length} papers for ${courseCode}${examType ? ` (${examType})` : ""}${year ? ` from ${year}` : ""}`,
            sources,
          }
        } catch (error) {
          return {
            success: false,
            error: error.message,
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
