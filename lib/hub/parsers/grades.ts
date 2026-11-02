import { getRawText } from '../guards'
import type { ParsedHubResult } from './attendance'
import { extractCliTables } from './utils'

export function parseGrades(raw: unknown): ParsedHubResult | null {
  const text = getRawText(raw)
  if (!text.trim()) return null
  const tables = extractCliTables(text)
  if (!tables.length) return null

  const gradeTable = tables.find(table =>
    table.headers.some(header => header.toLowerCase().includes('course code'))
  )
  if (!gradeTable) return null

  const courses = gradeTable.rows.map(row => {
    const [code, title, type, credits, total, grading, grade] = row
    return {
      code,
      title,
      type,
      credits: toNumber(credits),
      total: toNumber(total),
      grading,
      grade,
    }
  })

  if (!courses.length) return null

  const risk = courses.filter(course => ['f', 'n'].includes((course.grade || '').toLowerCase()))
  const summary = risk.length
    ? `${risk.length} course${risk.length === 1 ? '' : 's'} at risk`
    : `${courses.length} courses graded`

  return {
    command: 'grades',
    title: 'grade history',
    summary,
    formatted_content: `<p>${summary}</p>`,
    structured_data: {
      courses,
      risk,
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
