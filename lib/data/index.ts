export interface ContextData {
  section: string
  title: string
  lastUpdated: string
  priority: 'high' | 'medium' | 'low'
  content: string
  metadata?: Record<string, any>
}

export function getAllContextData(): ContextData[] {
  const { academicCalendar } = require('./academic-calendar')
  const { workingSaturdays } = require('./working-saturdays')
  const { examSchedule } = require('./exam-schedule')
  const { holidays } = require('./holidays')
  const { currentStatus } = require('./current-status')
  const { latestEvents } = require('./latest-events')

  const allData = [
    currentStatus,
    academicCalendar,
    examSchedule,
    workingSaturdays,
    latestEvents,
    holidays,
  ].filter(Boolean)
  return allData
}

export function getContextDataBySection(section: string): ContextData | null {
  const found = getAllContextData().find(data => data.section === section) || null
  if (!found) {
    console.warn('[getContextDataBySection] Section not found:', section)
  } else {
    console.log('[getContextDataBySection] Found section:', section)
  }
  return found
}

export function getHighPriorityContextData(): ContextData[] {
  const highPriority = getAllContextData().filter(data => data.priority === 'high')
  console.log(
    '[getHighPriorityContextData] High priority sections:',
    highPriority.map(d => d.section)
  )
  return highPriority
}

export function getFormattedContextForAI(includeAll: boolean = false): string {
  const data = includeAll ? getAllContextData() : getHighPriorityContextData()
  if (data.length === 0) {
    console.warn('[getFormattedContextForAI] No context data to format')
    return ''
  }
  console.log('[getFormattedContextForAI] Formatting', data.length, 'sections')
  const sections = data
    .sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
    .map(section => {
      return `## ${section.title}\nLast Updated: ${section.lastUpdated}\n\n${section.content}\n\n---`
    })
    .join('\n\n')
  return `# Current VIT Context Data\n\n${sections}\n\nNote: This data is automatically updated and should be referenced for the most current information about VIT Vellore.`
}

export function getRecentlyUpdatedData(withinDays: number = 7): ContextData[] {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - withinDays)

  const recent = getAllContextData().filter(data => {
    const updateDate = new Date(data.lastUpdated)
    return updateDate >= cutoffDate
  })
  console.log(
    '[getRecentlyUpdatedData] Recently updated sections:',
    recent.map(d => d.section)
  )
  return recent
}

export function checkForOutdatedData(maxDaysOld: number = 30): {
  hasOutdatedData: boolean
  outdatedSections: string[]
} {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - maxDaysOld)

  const outdatedSections = getHighPriorityContextData()
    .filter(data => new Date(data.lastUpdated) < cutoffDate)
    .map(data => data.section)

  return {
    hasOutdatedData: outdatedSections.length > 0,
    outdatedSections,
  }
}

export // Individual exports for direct access
 {}
