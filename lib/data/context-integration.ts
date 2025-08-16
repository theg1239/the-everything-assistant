import { getAllContextData, getHighPriorityContextData, getFormattedContextForAI } from './index'

export function getCurrentVITContext(): string {
  try {
    const contextData = getContextForAIPrompt({
      includeAll: true,
      maxLength: 50000,
    })
    console.log('[getCurrentVITContext] Retrieved context data:', contextData?.slice(0, 200))
    if (!contextData || contextData.trim().length === 0) {
      console.warn('[getCurrentVITContext] No context data available')
      return '## CURRENT VIT INFORMATION\n(Context data not available at the moment)'
    }
    return contextData
  } catch (error) {
    console.error('Error loading VIT context:', error)
    return '## CURRENT VIT INFORMATION\n(Error loading current context data)'
  }
}

export function getContextForAIPrompt(
  options: {
    includeAll?: boolean
    maxLength?: number
    priorityFilter?: ('high' | 'medium' | 'low')[]
  } = {}
): string {
  const { includeAll = false, maxLength = 100000, priorityFilter } = options

  let contextData = includeAll ? getAllContextData() : getHighPriorityContextData()
  if (priorityFilter && Array.isArray(priorityFilter)) {
    contextData = contextData.filter(data => priorityFilter.includes(data.priority))
  }
  console.log('[getContextForAIPrompt] Context data count:', contextData.length)
  let formattedContext = getFormattedContextForAI(includeAll)
  if (formattedContext.length > maxLength) {
    console.warn('[getContextForAIPrompt] Context truncated to', maxLength, 'characters')
    formattedContext =
      formattedContext.substring(0, maxLength) + '\n\n[Content truncated for length...]'
  }
  return formattedContext
}

export function getSpecificContext(sections: string[]): string {
  const allData = getAllContextData()
  const requestedData = allData.filter(data => sections.includes(data.section))
  console.log('[getSpecificContext] Requested sections:', sections)
  if (requestedData.length === 0) {
    console.warn('[getSpecificContext] No matching sections found')
    return ''
  }
  const sections_content = requestedData
    .map(section => `## ${section.title}\n${section.content}\n---`)
    .join('\n\n')
  return `# Specific VIT Context\n\n${sections_content}`
}

export function getContextSummary(): {
  totalSections: number
  highPrioritySections: number
  lastUpdated: string
  sections: Array<{
    section: string
    title: string
    priority: string
    lastUpdated: string
  }>
} {
  const allData = getAllContextData()
  const highPriorityCount = allData.filter(data => data.priority === 'high').length
  const mostRecentUpdate = allData.reduce((latest, current) => {
    const currentDate = new Date(current.lastUpdated)
    const latestDate = new Date(latest)
    return currentDate > latestDate ? current.lastUpdated : latest
  }, '1970-01-01')
  console.log(
    '[getContextSummary] Sections:',
    allData.length,
    'High priority:',
    highPriorityCount,
    'Last updated:',
    mostRecentUpdate
  )
  return {
    totalSections: allData.length,
    highPrioritySections: highPriorityCount,
    lastUpdated: mostRecentUpdate,
    sections: allData.map(data => ({
      section: data.section,
      title: data.title,
      priority: data.priority,
      lastUpdated: data.lastUpdated,
    })),
  }
}

export function validateContextData(): {
  isValid: boolean
  warnings: string[]
  recommendations: string[]
} {
  const allData = getAllContextData()
  const warnings: string[] = []
  const recommendations: string[] = []
  console.log('[validateContextData] Validating', allData.length, 'sections')
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const outdatedSections = allData.filter(data => {
    return new Date(data.lastUpdated) < thirtyDaysAgo
  })
  if (outdatedSections.length > 0) {
    console.warn(
      '[validateContextData] Outdated sections:',
      outdatedSections.map(s => s.section)
    )
    warnings.push(`${outdatedSections.length} sections are outdated (>30 days old)`)
    recommendations.push(
      'Update outdated sections: ' + outdatedSections.map(s => s.section).join(', ')
    )
  }
  const highPrioritySections = allData.filter(data => data.priority === 'high')
  if (highPrioritySections.length < 3) {
    console.warn('[validateContextData] Less than 3 high-priority sections')
    warnings.push('Less than 3 high-priority sections available')
    recommendations.push(
      'Ensure academic calendar, exam schedule, and important dates are marked as high priority'
    )
  }
  const emptySections = allData.filter(data => !data.content || data.content.trim().length < 100)
  if (emptySections.length > 0) {
    console.warn(
      '[validateContextData] Minimal content in sections:',
      emptySections.map(s => s.section)
    )
    warnings.push(`${emptySections.length} sections have minimal content`)
    recommendations.push(
      'Review and expand content for: ' + emptySections.map(s => s.section).join(', ')
    )
  }
  return {
    isValid: warnings.length === 0,
    warnings,
    recommendations,
  }
}
