import * as z from 'zod'
import { getRedis } from '@/lib/redis'

const menuItemSchema = z.object({
  type: z.number(),
  menu: z.string(),
})

const dayMenuSchema = z.object({
  date: z.string(),
  menu: z.array(menuItemSchema),
})

const messMenuDataSchema = z.object({
  hostel: z.number().optional().catch(undefined),
  mess: z.number().optional().catch(undefined),
  menu: z.array(dayMenuSchema),
})

type MenuItem = z.infer<typeof menuItemSchema>
type DayMenu = z.infer<typeof dayMenuSchema>
type MessMenuData = z.infer<typeof messMenuDataSchema>

const parseMessMenuData = (value: unknown): MessMenuData | null => {
  const parsed = messMenuDataSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

const toIsoDate = (date: Date = new Date()): string => date.toISOString().slice(0, 10)

/** Why `getMessMenu` failed: no menu published for the date, or the menu source was unreachable. */
export type MessMenuErrorKind = 'menu_unavailable' | 'menu_fetch_failed'

export interface MessMenuResponse {
  success: boolean
  data?: {
    hostelType: string
    messType: string
    todayMenu?: DayMenu
    weekMenu?: DayMenu[]
    requestedDate?: string
    actualDate?: string
    isExactMatch?: boolean
  }
  message?: string
  error?: string
  errorKind?: MessMenuErrorKind
}

const MESS_ENDPOINTS = {
  'mens-special': 'https://messit.vinnovateit.com/menu-data/hostel-1-mess-1.json',
  'mens-veg': 'https://messit.vinnovateit.com/menu-data/hostel-1-mess-2.json',
  'mens-nonveg': 'https://messit.vinnovateit.com/menu-data/hostel-1-mess-3.json',
  'ladies-special': 'https://messit.vinnovateit.com/menu-data/hostel-2-mess-1.json',
  'ladies-veg': 'https://messit.vinnovateit.com/menu-data/hostel-2-mess-2.json',
  'ladies-nonveg': 'https://messit.vinnovateit.com/menu-data/hostel-2-mess-3.json',
}

const HOSTEL_TYPES: Partial<Record<number, string>> = {
  1: "Men's Hostel",
  2: "Ladies' Hostel",
}

const MESS_TYPES: Partial<Record<number, string>> = {
  1: 'Special Mess',
  2: 'Veg Mess',
  3: 'Non-Veg Mess',
}

const lookupName = (names: Partial<Record<number, string>>, key: number | undefined) =>
  key === undefined ? undefined : names[key]

const MEAL_TYPES: Partial<Record<number, string>> = {
  1: 'Breakfast',
  2: 'Lunch',
  3: 'Snacks',
  4: 'Dinner',
}

/** The upstream menus change at most daily; one hour keeps "today" correct while sparing the fetch. */
const MENU_CACHE_TTL_SECONDS = 60 * 60
const menuMemoryCache = new Map<string, { data: MessMenuData; expiresAt: number }>()
const menuCacheKey = (endpoint: string) => `mess-menu:v1:${endpoint}`

/**
 * Parsed menu JSON for `endpoint`: instance memory, then Redis (shared across instances),
 * then the upstream fetch. Only valid menus are cached; errors propagate as before.
 */
async function loadMenuData(
  endpoint: string,
  init: { headers: Record<string, string>; timeoutMs: number }
): Promise<MessMenuData | null> {
  const now = Date.now()
  const memo = menuMemoryCache.get(endpoint)
  if (memo && memo.expiresAt > now) return memo.data

  const redis = getRedis()
  if (redis) {
    try {
      const cached = parseMessMenuData(await redis.get(menuCacheKey(endpoint)))
      if (cached) {
        menuMemoryCache.set(endpoint, { data: cached, expiresAt: now + MENU_CACHE_TTL_SECONDS * 1000 })
        return cached
      }
    } catch (error) {
      console.warn('[mess-menu] cache read failed', error)
    }
  }

  const response = await fetch(endpoint, {
    headers: init.headers,
    signal: AbortSignal.timeout(init.timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  const data = parseMessMenuData(await response.json())
  if (data) {
    menuMemoryCache.set(endpoint, { data, expiresAt: Date.now() + MENU_CACHE_TTL_SECONDS * 1000 })
    if (redis) {
      redis
        .set(menuCacheKey(endpoint), data, { ex: MENU_CACHE_TTL_SECONDS })
        .catch((error: unknown) => console.warn('[mess-menu] cache write failed', error))
    }
  }
  return data
}

export async function getMessMenu(
  hostelType?: 'mens' | 'ladies',
  messType?: 'special' | 'veg' | 'nonveg',
  requestedDate?: string,
  mealType?: 'breakfast' | 'lunch' | 'snacks' | 'dinner'
): Promise<MessMenuResponse> {
  try {
    const selectedHostel = hostelType || 'mens'
    const selectedMess = messType || 'special'

    const endpointKey = `${selectedHostel}-${selectedMess}` as keyof typeof MESS_ENDPOINTS
    const endpoint = MESS_ENDPOINTS[endpointKey]

    if (!endpoint) {
      throw new Error(`Invalid hostel/mess combination: ${selectedHostel}-${selectedMess}`)
    }

    const menuData = await loadMenuData(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timeoutMs: 10000,
    })

    if (!menuData) {
      throw new Error('Invalid menu data structure received')
    }
    const today = requestedDate || toIsoDate()

    const todayMenu = menuData.menu.find(day => day.date === today)

    if (!todayMenu) {
      const dateObj = new Date(today)
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' })
      const formattedDate = dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

      return {
        success: false,
        message: `Could not find mess menu for ${dayName}, ${formattedDate} at ${lookupName(MESS_TYPES, menuData.mess)} in ${lookupName(HOSTEL_TYPES, menuData.hostel)}.`,
        error: `Menu not available for date: ${today}`,
        errorKind: 'menu_unavailable',
      }
    }
    const weekMenu = getWeekMenu(menuData.menu, today)

    const filteredTodayMenu = filterByMealType(todayMenu, mealType)
    const filteredWeekMenu = weekMenu.flatMap(day => {
      const filtered = filterByMealType(day, mealType)
      return filtered ? [filtered] : []
    })

    const messTypeName = lookupName(MESS_TYPES, menuData.mess) || 'Unknown Mess'
    const hostelTypeName = lookupName(HOSTEL_TYPES, menuData.hostel) || 'Unknown Hostel'

    const message = generateMenuMessage(filteredTodayMenu, messTypeName, mealType, today)

    return {
      success: true,
      data: {
        hostelType: hostelTypeName,
        messType: messTypeName,
        todayMenu: filteredTodayMenu,
        weekMenu: filteredWeekMenu,
        requestedDate: today,
        actualDate: todayMenu.date,
        isExactMatch: true,
      },
      message,
    }
  } catch (error) {
    console.error('Mess menu fetch error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorKind: 'menu_fetch_failed',
      message: 'Unable to fetch mess menu. Please try again later.',
    }
  }
}

function getWeekMenu(allMenus: DayMenu[], startDate: string): DayMenu[] {
  const start = new Date(startDate)
  const weekMenus: DayMenu[] = []

  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(start)
    currentDate.setDate(start.getDate() + i)
    const dateStr = toIsoDate(currentDate)

    const dayMenu = allMenus.find(menu => menu.date === dateStr)
    if (dayMenu) {
      weekMenus.push(dayMenu)
    }
  }

  return weekMenus
}

function filterByMealType(dayMenu: DayMenu | undefined, mealType?: string): DayMenu | undefined {
  if (!dayMenu || !mealType) return dayMenu

  const mealTypeMap: Record<string, number> = {
    breakfast: 1,
    lunch: 2,
    snacks: 3,
    dinner: 4,
  }

  const targetType = mealTypeMap[mealType.toLowerCase()]
  if (!targetType) return dayMenu

  const filteredItems = dayMenu.menu.filter(item => item.type === targetType)

  return filteredItems.length > 0
    ? {
        ...dayMenu,
        menu: filteredItems,
      }
    : undefined
}

function generateMenuMessage(
  todayMenu: DayMenu | undefined,
  messType: string,
  mealType?: string,
  date?: string
): string {
  if (!todayMenu) {
    const requestedDate = date || 'today'
    const dateObj = date ? new Date(date) : new Date()
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' })

    return `No menu available for ${dayName} (${requestedDate}) at ${messType}. The menu might not be updated yet or the date might be outside the available range.`
  }

  const dateObj = new Date(todayMenu.date)
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' })
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  if (mealType) {
    const mealTypeCapitalized = mealType.charAt(0).toUpperCase() + mealType.slice(1)
    return `${mealTypeCapitalized} menu for ${dayName}, ${formattedDate} at ${messType}`
  }

  return `Menu for ${dayName}, ${formattedDate} at ${messType}`
}

function formatMenuItems(menuItems: MenuItem[]): string {
  return menuItems
    .map(item => {
      const mealTypeName = MEAL_TYPES[item.type] || `Meal ${item.type}`

      let cleanMenu = item.menu
        .replace(/\s+/g, ' ')
        .replace(/,\s*,/g, ',')
        .replace(/\s*,\s*/g, ', ')
        .trim()

      const menuItems = cleanMenu
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0 && !item.match(/^[B,J\s]*$/))
        .map(item => {
          return item.charAt(0).toUpperCase() + item.slice(1).toLowerCase()
        })

      const formattedItems = menuItems.join(', ')

      return `**${mealTypeName}:** ${formattedItems}`
    })
    .join('\n\n')
}

export { formatMenuItems, MEAL_TYPES }

export async function getAvailableDateRange(
  hostelType: 'mens' | 'ladies' = 'mens',
  messType: 'special' | 'veg' | 'nonveg' = 'special'
): Promise<{ start: string; end: string } | null> {
  try {
    const endpointKey = `${hostelType}-${messType}` as keyof typeof MESS_ENDPOINTS
    const endpoint = MESS_ENDPOINTS[endpointKey]

    if (!endpoint) return null

    const menuData = await loadMenuData(endpoint, {
      headers: { Accept: 'application/json' },
      timeoutMs: 5000,
    })
    const dates = (menuData?.menu ?? []).map(day => day.date).sort()
    const start = dates[0]
    const end = dates[dates.length - 1]
    if (start === undefined || end === undefined) return null

    return { start, end }
  } catch {
    return null
  }
}
