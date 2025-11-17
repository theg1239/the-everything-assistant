import type { HubVTOPCommand } from '@/types/hub'
import { normalizeWhitespace, splitColumns, stripAnsiCodes } from './utils'

export type ParsedHubResult = {
  command: HubVTOPCommand
  title: string
  summary: string
  formatted_content: string
  structured_data: any
  meta?: {
    fetchedAt: string
    notes?: string
  }
}

export type RawVTOPResult = {
  success?: boolean
  command?: string
  data?: any
  output?: string
  raw?: boolean
  message?: string
  structured_data?: any
  meta?: any
}

const HEADER_KEYWORDS = ['SUBJECT', 'TYPE', 'FACULTY', 'CLASSES', 'PERCENTAGE']

export function parseAttendance(result: RawVTOPResult): ParsedHubResult | null {
  const textPayload =
    (typeof result?.data === 'string' && result.data) ||
    (typeof result?.output === 'string' && result.output) ||
    ''

  if (!textPayload.trim()) {
    return null
  }

  const sanitized = stripAnsiCodes(textPayload)
  const lines = sanitized
    .split('\n')
    .map(line => line.replace(/[\r\t]+/g, '').trimEnd())
    .filter(line => line.length)

  const headerIndex = lines.findIndex(line => HEADER_KEYWORDS.every(keyword => line.includes(keyword)))
  if (headerIndex === -1) {
    return null
  }

  const headerLine = lines[headerIndex]
  const headers = splitColumns(headerLine)
  if (headers.length < 5) {
    return null
  }

  const rows: string[][] = []
  let currentRow: string[] | null = null

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.includes('│')) continue
    if (/^[\s\u00a0]*[─┼]+/.test(line)) continue

    const cells = splitColumns(line)
    if (cells.length !== headers.length) {
      if (currentRow) {
        currentRow = currentRow.map((value, idx) => {
          const addition = normalizeWhitespace(cells[idx] || '')
          if (!addition) return value
          return value ? `${value}\n${addition}` : addition
        })
      }
      continue
    }

    const firstCell = normalizeWhitespace(cells[0])
    if (/^\d+$/.test(firstCell)) {
      if (currentRow) {
        rows.push(currentRow)
      }
      currentRow = cells.map(cell => normalizeWhitespace(cell))
    } else if (currentRow) {
      currentRow = currentRow.map((value, idx) => {
        const addition = normalizeWhitespace(cells[idx] || '')
        if (!addition) return value
        return value ? `${value}\n${addition}` : addition
      })
    }
  }

  if (currentRow) {
    rows.push(currentRow)
  }

  if (!rows.length) {
    return null
  }

  const mappedRows = rows.map(row => {
    const [index, subject, type, faculty, classes, percentage, alert = ''] = row
    return {
      index: Number.parseInt(index, 10) || rows.indexOf(row) + 1,
      subject,
      type,
      faculty,
      classes,
      percentage,
      alert,
    }
  })

  const needsAttention = mappedRows.filter(r => r.alert.toLowerCase().includes('attend')).length
  const healthy = mappedRows.length - needsAttention
  const summary = `tracking ${mappedRows.length} courses • ${healthy} steady • ${needsAttention} need attention`

  const formattedRows = mappedRows
    .map(row => `
        <tr>
          <td>${row.subject}</td>
          <td>${row.type}</td>
          <td>${row.faculty}</td>
          <td>${row.classes}</td>
          <td>${row.percentage}</td>
          <td>${row.alert}</td>
        </tr>`)
    .join('\n')

  const formatted_content = `
    <div class="hub-card">
      <h3 class="hub-card-title">attendance overview</h3>
      <p class="hub-card-subtitle">${summary}</p>
      <table class="hub-table">
        <thead>
          <tr>
            <th>subject</th>
            <th>type</th>
            <th>faculty</th>
            <th>classes</th>
            <th>%</th>
            <th>alert</th>
          </tr>
        </thead>
        <tbody>
          ${formattedRows}
        </tbody>
      </table>
    </div>
  `.trim()

  return {
    command: 'attendance',
    title: 'attendance autopilot',
    summary,
    formatted_content,
    structured_data: {
      rows: mappedRows,
      stats: {
        totalSubjects: mappedRows.length,
        needsAttention,
        healthy,
      },
    },
    meta: {
      fetchedAt: new Date().toISOString(),
    },
  }
}
