import type { HubVTOPCommand } from '@/types/hub'
import { extractCliTables } from './utils'

export function parseMarks(raw: any) {
  const text =
    typeof raw?.output === 'string' ? raw.output : typeof raw?.data === 'string' ? raw.data : ''
  if (!text.trim()) return null
  const tables = extractCliTables(text)
  if (!tables.length) return null

  const courses = tables.map(table => {
    const assessments = table.rows.map(row => {
      const [title, maxMarks, weightagePercent, status, scoredMark, weightageMark] = row
      return {
        title,
        maxMarks,
        weightagePercent,
        status,
        scoredMark,
        weightageMark,
      }
    })
    const totalWeightage = assessments.reduce((sum, row) => sum + toNumber(row.weightagePercent), 0)
    const totalScored = assessments.reduce((sum, row) => sum + toNumber(row.weightageMark), 0)
    return {
      title: table.heading || assessments[0]?.title || 'course',
      assessments,
      totals: {
        weightage: totalWeightage,
        scored: totalScored,
      },
    }
  })

  const summary = `${courses.length} course${courses.length === 1 ? '' : 's'} refreshed`

  return {
    command: 'marks' as HubVTOPCommand,
    title: 'marks ledger',
    summary,
    formatted_content: `<p>${summary}</p>`,
    structured_data: {
      courses,
    },
    meta: {
      fetchedAt: new Date().toISOString(),
    },
  }
}

const toNumber = (value?: string) => {
  const numeric = parseFloat((value || '').replace(/[^0-9.-]+/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}
