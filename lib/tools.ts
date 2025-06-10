import { tool } from "ai"
import { z } from "zod"
import { scrapePapersCodeChef } from "./scrapers/papers-codechef"
import { scrapeVITPaperVault } from "./scrapers/vit-papervault"
import { scrapeFacultyInfo } from "./scrapers/faculty-scraper"
import { scrapePlacementInfo } from "./scrapers/placement-scraper"
import { getMessMenu, formatMenuItems, getAvailableDateRange } from "./scrapers/mess-menu-scraper"
import { getCourseCode } from "./question-generator"

// Helper function to organize menu items by meal type
function organizeMenuByMealType(menuItems: Array<{type: number, menu: string}>) {
  const mealTypes: { [key: string]: string[] } = {
    breakfast: [],
    lunch: [],
    snacks: [],
    dinner: []
  }
  
  const typeToMeal: { [key: number]: string } = {
    1: 'breakfast',
    2: 'lunch', 
    3: 'snacks',
    4: 'dinner'
  }
  
  menuItems.forEach(item => {
    const mealType = typeToMeal[item.type]
    if (mealType) {
      // Clean and split menu items
      const cleanedItems = item.menu
        .split(',')
        .map(menuItem => menuItem.trim())
        .filter(menuItem => menuItem.length > 0 && !menuItem.match(/^[B,J\s]*$/))
        .map(menuItem => menuItem.charAt(0).toUpperCase() + menuItem.slice(1).toLowerCase())
      
      mealTypes[mealType].push(...cleanedItems)
    }
  })
  
  // Remove empty meal types
  Object.keys(mealTypes).forEach(key => {
    if (mealTypes[key].length === 0) {
      delete mealTypes[key]
    }
  })
  
  return mealTypes
}

export function createVITTools() {
  return {
    findPastPapers: tool({
      description:
        "find past examination papers for VIT courses from real repositories. You can use course names or codes.",
      parameters: z.object({
        courseCode: z
          .string()
          .describe("course code like BCSE302L or course name like 'database systems'"),
        examType: z
          .string()
          .optional()
          .describe("exam type: cat1, cat2, fat, quiz"),
        year: z
          .string()
          .optional()
          .describe("academic year like 2023, 2022"),
      }),
      execute: async ({ courseCode, examType, year }) => {
        try {
          let resolvedCourseCode = courseCode.trim().toUpperCase()

          if (!/^[A-Z]{4}\d{3}[A-Z]?$/.test(resolvedCourseCode)) {
            const mappedCode = getCourseCode(courseCode)
            if (mappedCode) resolvedCourseCode = mappedCode
          }

          const results = await Promise.allSettled([
            scrapePapersCodeChef(resolvedCourseCode, examType, year),
            scrapeVITPaperVault(resolvedCourseCode, examType, year),
          ])

          const papers: any[] = []
          const sources: any[] = []

          results.forEach((r) => {
            if (r.status === "fulfilled" && r.value.success) {
              papers.push(...r.value.papers)
              sources.push(r.value.source)
            }
          })

          if (papers.length === 0) {
            return {
              success: false,
              courseCode,
              papers: [],
              message: `no papers found for ${courseCode}${
                examType ? ` (${examType})` : ""
              }${year ? ` from ${year}` : ""}. try checking the course code or contact faculty for materials.`,
              suggestions: [
                "verify the course code format (e.g., CSE1001, MAT1001)",
                "check with course faculty for official materials",
                "visit VIT library for physical copies",
                "contact senior students or study groups",
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
            message: `found ${papers.length} papers for ${courseCode}${
              examType ? ` (${examType})` : ""
            }${year ? ` from ${year}` : ""}`,
            sources,
          }
        } catch (err: any) {
          const errorMessage =
            typeof err === "object" && err?.message
              ? err.message
              : "unable to scrape papers at the moment. please try again later."
          return {
            success: false,
            error: errorMessage,
            message: "unable to scrape papers at the moment. please try again later.",
          }
        }
      },
    }),

    getFacultyInfo: tool({
      description: "get current faculty information from VIT official websites",
      parameters: z
        .object({
          department: z
            .string()
            .optional()
            .describe("department like computer science, mechanical, electronics"),
          facultyName: z
            .string()
            .optional()
            .describe("specific faculty member name"),
        }),
      execute: async ({ department, facultyName }) =>
        scrapeFacultyInfo(department, facultyName),
    }),

    getPlacementInfo: tool({
      description:
        "get latest placement statistics and company information from VIT Placements Tracker",
      parameters: z.object({
        year: z
          .string()
          .optional()
          .describe("academic year like 2024-25, 2023-24"),
        companyFilter: z
          .string()
          .optional()
          .describe(
            "filter results by company name (case-insensitive substring match)"
          ),
      }),
      execute: async ({ year, companyFilter }) =>
        scrapePlacementInfo(year, companyFilter),
    }),

    getMessMenu: tool({
      description:
        "get mess menu for VIT hostels (both men's and ladies' hostels). Use this when users ask about mess menu, today's food, what's for lunch/dinner/breakfast/snacks, tomorrow's menu, etc. Covers special mess, veg mess, and non-veg mess for both hostels. IMPORTANT: Always ask the user to specify hostelType and messType if not provided.",
      parameters: z.object({
        hostelType: z
          .enum(["mens", "ladies"])
          .describe("REQUIRED: type of hostel: mens (men's hostel) or ladies (ladies' hostel). Must be specified by user."),
        messType: z
          .enum(["special", "veg", "nonveg"])
          .describe("REQUIRED: type of mess: special (premium food), veg (vegetarian), or nonveg (non-vegetarian). Must be specified by user."),
        date: z
          .string()
          .optional()
          .describe("date in YYYY-MM-DD format. If not provided, uses today's date. Can also accept 'today', 'tomorrow', etc."),
        mealType: z
          .enum(["breakfast", "lunch", "snacks", "dinner"])
          .optional()
          .describe("specific meal type to filter. If not provided, returns all meals for the day"),
      }),
      execute: async ({ hostelType, messType, date, mealType }) => {
        // Handle relative dates like 'today', 'tomorrow'
        let processedDate = date
        if (date) {
          const today = new Date()
          if (date.toLowerCase() === 'today') {
            processedDate = today.toISOString().split('T')[0]
          } else if (date.toLowerCase() === 'tomorrow') {
            const tomorrow = new Date(today)
            tomorrow.setDate(today.getDate() + 1)
            processedDate = tomorrow.toISOString().split('T')[0]
          } else if (date.toLowerCase() === 'yesterday') {
            const yesterday = new Date(today)
            yesterday.setDate(today.getDate() - 1)
            processedDate = yesterday.toISOString().split('T')[0]
          }
        }

        const result = await getMessMenu(hostelType, messType, processedDate, mealType)
        
        if (result.success && result.data?.todayMenu) {
          // Transform the menu structure for UI display
          const organizedTodayMenu = organizeMenuByMealType(result.data.todayMenu.menu)
          
          // For week menu, we only want to show today's organized menu, not the entire week
          // The UI component expects a single menu structure, not an array of daily menus
          
          // Format the response with properly formatted menu items
          const formattedMenu = formatMenuItems(result.data.todayMenu.menu)
          
          return {
            ...result,
            formattedMenu,
            data: {
              ...result.data,
              todayMenu: organizedTodayMenu,
              // Remove weekMenu since it causes rendering issues and is not needed for the current UI
              weekMenu: undefined,
              formattedMenu
            }
          }
        } else if (!result.success && result.error) {
          // If there's an error, try to get available date range to help user
          const dateRange = await getAvailableDateRange(hostelType, messType)
          if (dateRange) {
            return {
              ...result,
              message: `${result.message} Available menu dates: ${dateRange.start} to ${dateRange.end}`,
              availableDateRange: dateRange
            }
          }
        }
        
        return result
      },
    }),
  }
}
