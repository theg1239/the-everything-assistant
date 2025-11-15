const ANSI_PATTERN = /\u001b\[[0-9;]*m/g

export function stripAnsiCodes(input: string) {
  return input.replace(ANSI_PATTERN, '')
}

export function splitColumns(row: string) {
  return row
    .split('│')
    .map(segment => segment.replace(/^[\s\u00a0]+|[\s\u00a0]+$/g, ''))
}

export function normalizeWhitespace(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const TABLE_SEPARATOR = /^[\s┌┐└┘┬┴┼─]+$/

type ParsedTable = {
  heading?: string | null
  headers: string[]
  rows: string[][]
}

export function extractCliTables(text: string): ParsedTable[] {
  const lines = text
    .split('\n')
    .map(line => stripAnsiCodes(line).replace(/[\t\r]+/g, '').trimEnd())

  const tables: ParsedTable[] = []
  let buffer: string[] = []
  let lastHeading: string | null = null

  const flush = () => {
    if (!buffer.length) return
    const table = parseTableBlock(buffer)
    if (table) {
      tables.push({ heading: lastHeading, ...table })
    }
    buffer = []
  }

  for (const line of lines) {
    if (!line.trim()) {
      flush()
      continue
    }
    if (line.includes('│')) {
      buffer.push(line)
    } else {
      flush()
      lastHeading = line.trim()
    }
  }
  flush()
  return tables
}

function parseTableBlock(lines: string[]): { headers: string[]; rows: string[][] } | null {
  const cleaned = lines.filter(line => !TABLE_SEPARATOR.test(line))
  if (!cleaned.length) return null
  const headerLine = cleaned[0]
  const headers = splitColumns(headerLine).map(normalizeWhitespace)
  const rows: string[][] = []
  for (const line of cleaned.slice(1)) {
    if (!line.includes('│')) continue
    const cols = splitColumns(line).map(normalizeWhitespace)
    if (cols.length === headers.length) {
      rows.push(cols)
    }
  }
  if (!headers.length || !rows.length) return null
  return { headers, rows }
}
