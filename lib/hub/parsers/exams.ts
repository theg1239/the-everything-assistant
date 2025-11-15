import type { HubVTOPCommand } from '@/types/hub'
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

const clean = (value?: string) =>
  value && value.trim().length > 0 ? value.trim() : undefined

function primaryExam(
  code?: string,
  title?: string,
  slot?: string,
  examDate?: string,
  examTime?: string,
  venue?: string,
  seat?: string,
  seatNo?: string,
  daysLeft?: string
): RawExamRow {
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

function normalizeExamRow(row: any[] = []): RawExamRow | null {
  if (!row.length) return null
  const [code, title, slot, examDate, examTime, venue, seat, seatNo, daysLeft, ...rest] = row
  const payload = primaryExam(code, title, slot, examDate, examTime, venue, seat, seatNo, daysLeft)
  if (rest && rest.length >= 6) {
    const extra = primaryExam(...(rest as any[]))
    if (extra && (extra.title || extra.code)) {
      payload.extra = extra
    }
  }
  if (!payload.title && !payload.code) return payload.extra || null
  return payload
}

export function parseExams(raw: any) {
  const text = typeof raw?.output === 'string' ? raw.output : typeof raw?.data === 'string' ? raw.data : ''
  if (!text.trim()) return null
  const tables = extractCliTables(text)
  if (!tables.length) return null

  const sections = tables.map(table => {
    const exams: RawExamRow[] = []
    table.rows.forEach(row => {
      const normalized = normalizeExamRow(row)
      if (!normalized) return
      if (normalized.title || normalized.code) {
        exams.push(normalized)
      }
      if (normalized.extra && (normalized.extra.title || normalized.extra.code)) {
        exams.push(normalized.extra)
      }
    })
    return {
      title: table.heading || 'schedule',
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
    command: 'exams' as HubVTOPCommand,
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
