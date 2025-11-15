import { stripAnsiCodes } from './utils'
import type { HubVTOPCommand } from '@/types/hub'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const DAY_REGEX = new RegExp(`^(${DAYS.join('|')})`, 'i')

export function parseTimetable(raw: any) {
  const classes: TimetableClass[] = extractClassesFromTables((raw?.structured_data as any)?.tables)

  if (!classes.length) {
    const text = typeof raw?.output === 'string' ? raw.output : typeof raw?.data === 'string' ? raw.data : ''
    const lines = text.split('\n').map((line: string) => stripAnsiCodes(line).trimEnd())
    let currentDay: string | null = null
    let buffer: string[] = []

    const flush = () => {
      if (!currentDay || !buffer.length) {
        buffer = []
        return
      }
      const table = parseBlock(buffer)
      if (table) {
        table.rows.forEach(row => {
          const [timeRange, subject, slot, venue] = row
          const match = timeRange?.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
          const startTime = match ? match[1] : undefined
          const endTime = match ? match[2] : undefined
          classes.push({
            day: currentDay!,
            subject,
            slot,
            venue,
            startTime,
            endTime,
          })
        })
      }
      buffer = []
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        flush()
        continue
      }
      if (line.includes('│')) {
        buffer.push(line)
        continue
      }
      const lower = trimmed.toLowerCase()
      if (DAY_REGEX.test(lower)) {
        flush()
        currentDay = capitalize(trimmed)
        continue
      }
    }
    flush()
  }

  if (!classes.length) return null

  const upcoming = computeNextClass(classes)

  const summary = upcoming
    ? `${upcoming.subject || upcoming.slot || 'class'} on ${upcoming.day} at ${upcoming.startTime}`
    : `${classes.length} scheduled sessions`

  return {
    command: 'timetable' as HubVTOPCommand,
    title: 'timetable pulse',
    summary,
    formatted_content: `<p>next class: ${summary}</p>`,
    structured_data: {
      classes,
      nextClass: upcoming,
    },
    meta: {
      fetchedAt: new Date().toISOString(),
    },
  }
}

type TimetableClass = {
  day: string
  subject: string
  slot: string
  venue: string
  startTime?: string
  endTime?: string
  startISO?: string
  endISO?: string
  faculty?: string
}

type ParsedTable = {
  headers: string[]
  rows: string[][]
}

function parseBlock(lines: string[]): ParsedTable | null {
  const cleaned = lines.filter(line => line.includes('│'))
  if (!cleaned.length) return null
  const headerLine = cleaned[0]
  const headers = headerLine.split('│').map(part => part.trim()).filter(Boolean)
  const rows: string[][] = []
  cleaned.slice(1).forEach(line => {
    if (/^[\s┌┐└┘┬┴┼─]+$/.test(line)) return
    if (!line.includes('│')) return
    const cols = line
      .split('│')
      .map(part => part.trim())
      .filter(Boolean)
    if (cols.length === headers.length) rows.push(cols)
  })
  if (!headers.length || !rows.length) return null
  return { headers, rows }
}

const DAY_INDEX: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
}

function computeNextClass(classes: TimetableClass[]): TimetableClass | null {
  const now = new Date()
  let best: TimetableClass | null = null
  let bestTime = Infinity

  classes.forEach(cls => {
    if (!cls.startTime) return
    const idx = DAY_INDEX[cls.day.toLowerCase()]
    if (idx === undefined) return
    const [sh, sm] = cls.startTime.split(':').map(Number)
    const [eh, em] = cls.endTime?.split(':').map(Number) || []
    const currentDayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1
    let diff = idx - currentDayIdx
    if (diff < 0) diff += 7
    const start = new Date(now)
    start.setHours(sh, sm || 0, 0, 0)
    start.setDate(start.getDate() + diff)
    if (diff === 0 && start <= now) {
      start.setDate(start.getDate() + 7)
    }
    const delta = start.getTime() - now.getTime()
    if (delta < bestTime) {
      const end = new Date(start)
      if (!Number.isNaN(eh)) {
        end.setHours(eh || 0, em || 0, 0, 0)
      }
      bestTime = delta
      best = {
        ...cls,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
      }
    }
  })

  return best
}

function extractClassesFromTables(tables?: any[]): TimetableClass[] {
  if (!Array.isArray(tables)) return []
  const classes: TimetableClass[] = []

  tables.forEach(table => {
    const headers: string[] = Array.isArray(table?.headers)
      ? table.headers.map((h: string) => (typeof h === 'string' ? h.toLowerCase() : ''))
      : []
    const rows: string[][] = Array.isArray(table?.rows) ? table.rows : []
    if (!headers.length || !rows.length) return

    const dayIdx = headers.findIndex(h => h.includes('day'))
    const subjectIdx = headers.findIndex(h => h.includes('subject') || h.includes('course'))
    const slotIdx = headers.findIndex(h => h.includes('slot'))
    const venueIdx = headers.findIndex(h => h.includes('venue') || h.includes('room'))
    const facultyIdx = headers.findIndex(h => h.includes('faculty') || h.includes('instructor'))
    const timeIdx = headers.findIndex(h => h.includes('time'))

    rows.forEach(row => {
      const rawDay = dayIdx >= 0 ? row[dayIdx] : undefined
      const day = rawDay ? capitalize(rawDay) : undefined
      const subject = subjectIdx >= 0 ? row[subjectIdx] : ''
      const slot = slotIdx >= 0 ? row[slotIdx] : ''
      const venue = venueIdx >= 0 ? row[venueIdx] : ''
      const faculty = facultyIdx >= 0 ? row[facultyIdx] : undefined
      const timeRaw = timeIdx >= 0 ? row[timeIdx] : ''

      if (!day || !subject) return

      const match = timeRaw?.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
      const startTime = match ? match[1] : timeRaw || undefined
      const endTime = match ? match[2] : undefined

      classes.push({
        day,
        subject,
        slot,
        venue,
        startTime,
        endTime,
        faculty,
      } as TimetableClass)
    })
  })

  return classes
}

function capitalize(input: string) {
  const lower = input.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
