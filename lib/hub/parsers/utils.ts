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
