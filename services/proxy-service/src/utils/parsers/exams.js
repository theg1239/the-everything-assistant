const { extractCliTables } = require('../cli-table')

const SUMMARY_COMMANDS = new Set(['exams', 'exam-schedule'])

function clean(value) {
  return value && typeof value === 'string' && value.trim().length ? value.trim() : undefined
}

function primaryExam(
  code,
  title,
  slot,
  examDate,
  examTime,
  venue,
  seat,
  seatNo,
  daysLeft
) {
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

function normalizeRow(row = []) {
  const [code, title, slot, examDate, examTime, venue, seat, seatNo, daysLeft, ...rest] = row
  const base = primaryExam(code, title, slot, examDate, examTime, venue, seat, seatNo, daysLeft)
  if (rest && rest.length >= 6) {
    const extra = primaryExam(...rest)
    if (extra && (extra.title || extra.code)) {
      base.extra = extra
    }
  }
  return base
}

function parseForCommand(command, printable) {
  if (!SUMMARY_COMMANDS.has(command)) return null
  return parseExamSchedule(printable)
}

function parseExamSchedule(printable = '') {
  if (!printable.trim()) return null
  const tables = extractCliTables(printable)
  if (!tables.length) return null

  const sections = tables.map(table => {
    const exams = []
    table.rows.forEach(row => {
      const normalized = normalizeRow(row)
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
    summary,
    structured_data: {
      sections,
      schedule: allExams,
      upcoming,
    },
  }
}

module.exports = {
  parseExamSchedule,
  parseForCommand,
}
