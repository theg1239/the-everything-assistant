import type { HubVTOPCommand } from '@/types/hub'
import { extractCliTables } from './utils'

export function parseLibraryDues(raw: any) {
  const text = typeof raw?.output === 'string' ? raw.output : typeof raw?.data === 'string' ? raw.data : ''
  if (!text.trim()) return null
  const tables = extractCliTables(text)
  const duesTable = tables.find(table =>
    table.headers.length >= 2 && table.headers[0].toLowerCase().includes('type')
  )
  if (!duesTable) return null

  const entries = duesTable.rows.map(row => {
    const [type, amount] = row
    return {
      type,
      amount,
      value: toNumber(amount),
    }
  })

  const total = entries.reduce((sum, entry) => sum + entry.value, 0)
  const summary = total > 0 ? `₹${total.toFixed(2)} outstanding` : 'no dues'

  return {
    command: 'library-dues' as HubVTOPCommand,
    title: 'library dues',
    summary,
    formatted_content: `<p>${summary}</p>`,
    structured_data: {
      entries,
      total,
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
