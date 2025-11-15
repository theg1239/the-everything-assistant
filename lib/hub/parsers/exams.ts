import type { HubVTOPCommand } from '@/types/hub'
import { extractCliTables } from './utils'

export function parseExams(raw: any) {
  const text = typeof raw?.output === 'string' ? raw.output : typeof raw?.data === 'string' ? raw.data : ''
  if (!text.trim()) return null
  const tables = extractCliTables(text)
  if (!tables.length) return null

  const sections = tables.map(table => {
    const exams = table.rows.map(row => {
      const [code, title, slot, examDate, examTime, venue, seat, seatNo, daysLeft] = row
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
