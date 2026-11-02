import { getRawText } from '../guards'
import type { ParsedHubResult } from './attendance'
import { extractCliTables } from './utils'

export function parseHostel(raw: unknown): ParsedHubResult | null {
  const text = getRawText(raw)
  if (!text.trim()) return null
  const tables = extractCliTables(text)
  const hostelTable = tables.find(table => table.headers.length === 2)
  if (!hostelTable) return null

  const info: Record<string, string> = {}
  hostelTable.rows.forEach(row => {
    const [field, value] = row
    if (!field || value === undefined) return
    info[field.toLowerCase()] = value
  })

  return {
    command: 'hostel',
    title: 'hostel info',
    summary: info['hostel block'] || info['hostel name'] || 'hostel synced',
    formatted_content: '',
    structured_data: {
      info,
    },
    meta: {
      fetchedAt: new Date().toISOString(),
    },
  }
}
