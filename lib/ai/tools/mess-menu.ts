import { tool } from 'ai'
import { z } from 'zod'

import { getMessMenu, formatMenuItems, getAvailableDateRange } from '@/lib/scrapers/mess-menu-scraper'

function organizeMenuByMealType(menuItems: Array<{ type: number; menu: string }>) {
  const mealTypes: { [key: string]: string[] } = {
    breakfast: [],
    lunch: [],
    snacks: [],
    dinner: [],
  }

  const typeToMeal: { [key: number]: string } = {
    1: 'breakfast',
    2: 'lunch',
    3: 'snacks',
    4: 'dinner',
  }

  menuItems.forEach(item => {
    const mealType = typeToMeal[item.type]
    if (mealType) {
      const cleanedItems = item.menu
        .split(',')
        .map(menuItem => menuItem.trim())
        .filter(menuItem => menuItem.length > 0 && !menuItem.match(/^[B,J\s]*$/))
        .map(menuItem => menuItem.charAt(0).toUpperCase() + menuItem.slice(1).toLowerCase())

      mealTypes[mealType].push(...cleanedItems)
    }
  })

  Object.keys(mealTypes).forEach(key => {
    if (mealTypes[key].length === 0) {
      delete mealTypes[key]
    }
  })

  return mealTypes
}

export function messMenuTools() {
  const getMessMenuTool = tool({
    description:
      'Get the mess menu for a specific hostel/mess type and date. Supports hostel type (mens/ladies), mess type (veg/non-veg/special), date (YYYY-MM-DD) and meal type (breakfast/lunch/snacks/dinner). Returns organized menu data and formatted menu text.',
    inputSchema: z.object({
      hostelType: z.string().describe("Hostel type: 'mens' or 'ladies'").optional(),
      messType: z.string().describe("Mess type: 'veg', 'non-veg', or 'special'").optional(),
      date: z.string().optional().describe('Date in YYYY-MM-DD format (defaults to today).'),
      mealType: z.string().optional().describe('Meal type: breakfast, lunch, snacks, dinner (optional filter).'),
    }),
    execute: async ({ hostelType, messType, date, mealType }) => {
      const processedDate = date ? new Date(date) : new Date()
      const result = await getMessMenu(hostelType, messType, processedDate, mealType)

      if (result.success && result.data && result.data.todayMenu) {
        const organizedTodayMenu = organizeMenuByMealType(result.data.todayMenu)
        const formattedMenu = formatMenuItems(organizedTodayMenu, processedDate)
        return {
          ...result,
          data: {
            ...result.data,
            todayMenu: organizedTodayMenu,
            weekMenu: undefined,
            formattedMenu,
          },
        }
      }

      if (!result.success && result.error) {
        const dateRange = await getAvailableDateRange(hostelType, messType)
        if (dateRange) {
          return {
            ...result,
            message: `${result.message} Available menu dates: ${dateRange.start} to ${dateRange.end}`,
            availableDateRange: dateRange,
          }
        }
      }

      return result
    },
  })

  return { getMessMenu: getMessMenuTool }
}

export type MessMenuTools = ReturnType<typeof messMenuTools>

