interface MenuItem {
  type: number
  menu: string
}

interface DayMenu {
  date: string
  menu: MenuItem[]
}

interface MessMenuData {
  hostel: number
  mess: number
  menu: DayMenu[]
}

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
}

const MESS_ENDPOINTS = {
  'mens-special': 'https://messit.vinnovateit.com/menu-data/hostel-1-mess-1.json',
  'mens-veg': 'https://messit.vinnovateit.com/menu-data/hostel-1-mess-2.json',
  'mens-nonveg': 'https://messit.vinnovateit.com/menu-data/hostel-1-mess-3.json',
  'ladies-special': 'https://messit.vinnovateit.com/menu-data/hostel-2-mess-1.json',
  'ladies-veg': 'https://messit.vinnovateit.com/menu-data/hostel-2-mess-2.json',
  'ladies-nonveg': 'https://messit.vinnovateit.com/menu-data/hostel-2-mess-3.json',
}

const HOSTEL_TYPES = {
  1: "Men's Hostel",
  2: "Ladies' Hostel",
}

const MESS_TYPES = {
  1: 'Special Mess',
  2: 'Veg Mess',
  3: 'Non-Veg Mess',
}

const MEAL_TYPES = {
  1: 'Breakfast',
  2: 'Lunch',
  3: 'Snacks',
  4: 'Dinner',
}

/* ────────────────⟡  PUBLIC ENTRY  ⟡─────────────── */

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

    console.log(`Fetching menu from ${selectedHostel} hostel, ${selectedMess} mess...`)

    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const menuData: MessMenuData = await response.json()

    if (!menuData || !menuData.menu || !Array.isArray(menuData.menu)) {
      throw new Error('Invalid menu data structure received')
    }
    const today = requestedDate || new Date().toISOString().split('T')[0]

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
        message: `Could not find mess menu for ${dayName}, ${formattedDate} at ${MESS_TYPES[menuData.mess as keyof typeof MESS_TYPES]} in ${HOSTEL_TYPES[menuData.hostel as keyof typeof HOSTEL_TYPES]}.`,
        error: `Menu not available for date: ${today}`,
      }
    }
    const weekMenu = getWeekMenu(menuData.menu, today)

    const filteredTodayMenu = filterByMealType(todayMenu, mealType)
    const filteredWeekMenu = weekMenu
      .map(day => filterByMealType(day, mealType))
      .filter(Boolean) as DayMenu[]

    const messTypeName = MESS_TYPES[menuData.mess as keyof typeof MESS_TYPES] || 'Unknown Mess'
    const hostelTypeName =
      HOSTEL_TYPES[menuData.hostel as keyof typeof HOSTEL_TYPES] || 'Unknown Hostel'

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
  } catch (error: any) {
    console.error('Mess menu fetch error:', error)
    return {
      success: false,
      error: error?.message ?? String(error),
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
    const dateStr = currentDate.toISOString().split('T')[0]

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
      const mealTypeName = MEAL_TYPES[item.type as keyof typeof MEAL_TYPES] || `Meal ${item.type}`

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

    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) return null

    const menuData: MessMenuData = await response.json()
    if (!menuData?.menu?.length) return null

    const dates = menuData.menu.map(day => day.date).sort()
    return {
      start: dates[0],
      end: dates[dates.length - 1],
    }
  } catch {
    return null
  }
}
