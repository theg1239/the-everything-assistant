import type { HubVTOPCommand } from '@/types/hub'
import { extractCliTables } from './utils'

export function parseHostel(raw: any) {
  const text = typeof raw?.output === 'string' ? raw.output : typeof raw?.data === 'string' ? raw.data : ''
  if (!text.trim()) return null
  const tables = extractCliTables(text)
  const hostelTable = tables.find(table => table.headers.length === 2)
  if (!hostelTable) return null

  const info: Record<string, string> = {}
  hostelTable.rows.forEach(row => {
    const [field, value] = row
    if (!field) return
    info[field.toLowerCase()] = value
  })

  return {
    command: 'hostel' as HubVTOPCommand,
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
