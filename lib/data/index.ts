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
//   const { workingSaturdays } = require('./working-saturdays')
  const { examSchedule } = require('./exam-schedule')
//   const { holidays } = require('./holidays')
  const { importantDates } = require('./important-dates')
  const { currentStatus } = require('./current-status')
  const { latestEvents } = require('./latest-events')
  
  return [
    currentStatus,
    academicCalendar,
    examSchedule,
    importantDates,
    // workingSaturdays,
    latestEvents,
    // holidays,
  ].filter(Boolean)
}

export function getContextDataBySection(section: string): ContextData | null {
  return getAllContextData().find(data => data.section === section) || null
}

export function getHighPriorityContextData(): ContextData[] {
  return getAllContextData().filter(data => data.priority === 'high')
}

export function getFormattedContextForAI(includeAll: boolean = false): string {
  const data = includeAll ? getAllContextData() : getHighPriorityContextData()
  
  if (data.length === 0) {
    return ''
  }

  const sections = data
    .sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
    .map(section => {
      return `## ${section.title}
Last Updated: ${section.lastUpdated}

${section.content}

---`
    })
    .join('\n\n')

  return `# Current VIT Context Data

${sections}

Note: This data is automatically updated and should be referenced for the most current information about VIT Vellore.`
}

export function getRecentlyUpdatedData(withinDays: number = 7): ContextData[] {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - withinDays)
  
  return getAllContextData().filter(data => {
    const updateDate = new Date(data.lastUpdated)
    return updateDate >= cutoffDate
  })
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
    outdatedSections
  }
}

export {
  // Individual exports for direct access
  // Note: These should be imported directly from their respective files
  // e.g., import { academicCalendar } from '@/lib/data/academic-calendar'
}
