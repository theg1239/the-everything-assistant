import { getRawText } from '../guards'
import type { ParsedHubResult } from './attendance'
import { extractCliTables } from './utils'

export function parseAssignments(raw: unknown): ParsedHubResult | null {
  const text = getRawText(raw)
  if (!text.trim()) return null
  const tables = extractCliTables(text)
  const summaryTable = tables.find(table =>
    table.headers.some(header => header.toLowerCase().includes('subject'))
  )
  if (!summaryTable) return null

  const subjects = summaryTable.rows
    .map(row => {
      const [subject, status, nextDue] = row
      return {
        subject,
        status,
        nextDue,
      }
    })
    .filter(item => item.subject)

  if (!subjects.length) return null

  const upcoming = subjects.find(
    item => item.nextDue && item.nextDue !== 'N/A' && item.nextDue.toLowerCase() !== 'n/a'
  )

  const summary = upcoming
    ? `${upcoming.subject} due ${upcoming.nextDue}`
    : `${subjects.length} subjects tracked`

  return {
    command: 'da',
    title: 'digital assignments',
    summary,
    formatted_content: `<p>${summary}</p>`,
    structured_data: {
      subjects,
      upcoming,
    },
    meta: {
      fetchedAt: new Date().toISOString(),
    },
  }
}
