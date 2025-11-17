import type { HubVTOPCommand } from '@/types/hub'
import { extractCliTables } from './utils'

export function parseLeave(raw: any) {
  const text = typeof raw?.output === 'string' ? raw.output : typeof raw?.data === 'string' ? raw.data : ''
  if (!text.trim()) return null
  const tables = extractCliTables(text)
  const leaveTable = tables.find(table =>
    table.headers.some(header => header.toLowerCase().includes('visit place'))
  )
  if (!leaveTable) return null

  const requests = leaveTable.rows.map(row => {
    const [place, reason, type, from, to, status] = row
    return {
      place,
      reason,
      type,
      from,
      to,
      status,
    }
  })

  const pending = requests.find(req => req.status?.toLowerCase().includes('pending'))

  const summary = pending ? `${pending.reason || 'request'} pending` : `${requests.length} requests on file`

  return {
    command: 'leave' as HubVTOPCommand,
    title: 'leave status',
    summary,
    formatted_content: `<p>${summary}</p>`,
    structured_data: {
      requests,
      pending,
    },
    meta: {
      fetchedAt: new Date().toISOString(),
    },
  }
}
