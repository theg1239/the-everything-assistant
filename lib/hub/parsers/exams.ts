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
}

function normalizeExamRow(row: any[]): RawExamRow {
  const [
    code,
    title,
    slot,
    examDate,
    examTime,
    venue,
    seat,
    seatNo,
    daysLeft,
    ...rest
  ] = row

  // handle CLI that nests multiple tables (e.g., lab + theory) into a single row chunk
  if (rest && rest.length >= 8 && !seatNo) {
    const secondary = normalizeExamRow(rest)
    return [primaryExam(code, title, slot, examDate, examTime, venue, seat, seatNo, daysLeft), secondary]
  }

  return primaryExam(code, title, slot, examDate, examTime, venue, seat, seatNo, daysLeft)
}

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
) {
  return {
    code,
    title,
    slot,
    examDate,
    examTime,
    venue,
    seat,
    seatNo,
    daysLeft,
  }
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
      if (Array.isArray(normalized)) {
        normalized.forEach(item => {
          if (item?.title || item?.code) exams.push(item)
        })
      } else if (normalized?.title || normalized?.code) {
        exams.push(normalized)
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
