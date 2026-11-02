import { getRawText } from '../guards'
import type { ParsedHubResult } from './attendance'
import { extractCliTables } from './utils'

export function parseProfile(raw: unknown): ParsedHubResult | null {
  const text = getRawText(raw)
  if (!text.trim()) return null
  const tables = extractCliTables(text)
  const profileTable = tables.find(table => table.headers.length === 2)
  if (!profileTable) return null

  const map: Record<string, string> = {}
  profileTable.rows.forEach(row => {
    const [field, value] = row
    if (!field || value === undefined) return
    map[field.toLowerCase()] = value
  })

  const persona = {
    registerNumber: map['register number'] || map['reg no'] || '',
    program: map['program & branch'] || map['program'] || '',
    email: map['vit email'] || map['email'] || '',
    school: map['school name'] || '',
  }

  return {
    command: 'profile',
    title: 'profile',
    summary: persona.program || 'profile synced',
    formatted_content: '',
    structured_data: {
      persona,
    },
    meta: {
      fetchedAt: new Date().toISOString(),
    },
  }
}
