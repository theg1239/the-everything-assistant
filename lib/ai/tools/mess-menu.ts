import { tool } from 'ai'
import { z } from 'zod'

import { getMessMenu, formatMenuItems, getAvailableDateRange } from '@/lib/scrapers/mess-menu-scraper'

type MealBuckets = Record<string, string[]>

function organizeMenuByMealType(menuItems: Array<{ type: number; menu: string }>): MealBuckets {
  const mealTypes: MealBuckets = {
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

const normalizeHostelType = (value?: string): 'mens' | 'ladies' | undefined => {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('lad')) return 'ladies'
  if (normalized.startsWith('men')) return 'mens'
  return undefined
}

const normalizeMessType = (value?: string): 'special' | 'veg' | 'nonveg' | undefined => {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase().replace(/[^a-z]/g, '')
  if (normalized.includes('nonveg')) return 'nonveg'
  if (normalized.includes('special')) return 'special'
  if (normalized.includes('veg')) return 'veg'
  return undefined
}

const normalizeMealType = (
  value?: string
): 'breakfast' | 'lunch' | 'snacks' | 'dinner' | undefined => {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('break')) return 'breakfast'
  if (normalized.startsWith('lun')) return 'lunch'
  if (normalized.startsWith('snack')) return 'snacks'
  if (normalized.startsWith('din')) return 'dinner'
  return undefined
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
      const normalizedHostel = normalizeHostelType(hostelType)
      const normalizedMess = normalizeMessType(messType)
      const normalizedMeal = normalizeMealType(mealType)
      const result = await getMessMenu(
        normalizedHostel,
        normalizedMess,
        processedDate.toISOString().split('T')[0],
        normalizedMeal
      )

      if (result.success && result.data && result.data.todayMenu) {
        const organizedTodayMenu = organizeMenuByMealType(result.data.todayMenu.menu)
        const formattedMenu = formatMenuItems(result.data.todayMenu.menu)
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
        const dateRange = await getAvailableDateRange(normalizedHostel, normalizedMess)
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

