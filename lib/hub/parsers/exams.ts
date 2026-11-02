import { asArray, asRecord, asString, firstTruthy, getRawText } from '../guards'
import type { ParsedHubResult } from './attendance'
import { extractCliTables } from './utils'

type RawExamRow = {
  code?: string
  daysLeft?: string
  examDate?: string
  examTime?: string
  venue?: string
  seat?: string
  seatNo?: string
  slot?: string
  title?: string
  extra?: RawExamRow | null
}

const clean = (value?: string) => (value && value.trim().length > 0 ? value.trim() : undefined)

function primaryExam(cells: ReadonlyArray<string | undefined>): RawExamRow {
  const [code, title, slot, examDate, examTime, venue, seat, seatNo, daysLeft] = cells
  return {
    code: clean(code),
    title: clean(title),
    slot: clean(slot),
    examDate: clean(examDate),
    examTime: clean(examTime),
    venue: clean(venue),
    seat: clean(seat),
    seatNo: clean(seatNo),
    daysLeft: clean(daysLeft),
  }
}

function normalizeExamRow(row: readonly unknown[] = []): RawExamRow | null {
  if (!row.length) return null
  const cells = row.map(cell => (typeof cell === 'string' ? cell : undefined))
  const firstCell = cells[0]
  if (typeof firstCell === 'string' && /^(\d+)$/.test(firstCell.trim()) && cells.length > 9) {
    cells.shift()
  }
  const payload = primaryExam(cells)
  const rest = cells.slice(9)
  if (rest.length >= 6) {
    const extra = primaryExam(rest)
    if (extra.title || extra.code) {
      payload.extra = extra
    }
  }
  if (!payload.title && !payload.code) return payload.extra || null
  return payload
}

type ExamTableSource = {
  heading?: string | null
  rows: readonly unknown[]
}

export function parseExams(raw: unknown): ParsedHubResult | null {
  const structuredTables = asArray(asRecord(asRecord(raw)?.structured_data)?.tables) ?? []
  const text = getRawText(raw)
  const fallbackTables = text.trim() ? extractCliTables(text) : []
  if (!structuredTables.length && !fallbackTables.length) return null

  const sourceTables: ExamTableSource[] = structuredTables.length
    ? structuredTables.map(entry => {
        const table = asRecord(entry) ?? {}
        return {
          heading: asString(firstTruthy(table.heading, table.title)) || 'schedule',
          rows: asArray(table.rows) ?? [],
        }
      })
    : fallbackTables

  const sections = sourceTables.map(table => {
    const heading = table.heading || 'schedule'
    const normalizedHeading = /[\u2500-\u257f]/.test(heading) ? 'FAT exams' : heading
    const exams: RawExamRow[] = []
    table.rows.forEach(row => {
      const normalized = normalizeExamRow(asArray(row))
      if (!normalized) return
      if (normalized.title || normalized.code) {
        exams.push(normalized)
      }
      if (normalized.extra && (normalized.extra.title || normalized.extra.code)) {
        exams.push(normalized.extra)
      }
    })
    return {
      title: normalizedHeading,
      exams,
    }
  })

  const allExams = sections.flatMap(section => section.exams)
  if (!allExams.length) return null

  const upcoming = allExams
    .map(exam => ({
      ...exam,
      parsedDate: exam.examDate ? Date.parse(exam.examDate) : NaN,
    }))
    .filter(exam => !Number.isNaN(exam.parsedDate))
    .sort((a, b) => a.parsedDate - b.parsedDate)[0]

  const summary = upcoming
    ? `${upcoming.title || upcoming.code} on ${upcoming.examDate}`
    : `${allExams.length} exams scheduled`

  return {
    command: 'exams',
    title: 'exam schedule',
    summary,
    formatted_content: `<p>${summary}</p>`,
    structured_data: {
      sections,
      schedule: allExams,
      upcoming,
    },
    meta: {
      fetchedAt: new Date().toISOString(),
    },
  }
}
