import { formatDistanceToNow, differenceInCalendarDays } from 'date-fns'
import type { PersonalHubSnapshot, HubVTOPCommand } from '@/types/hub'

export type DailyBriefingMessage = {
  id: string
  primary: string
  supporting?: string
  tone?: 'neutral' | 'alert' | 'calm'
}

export type DailyBriefingAction = {
  id: string
  label: string
  command: HubVTOPCommand
}

export type DailyBriefingContext = {
  messages: DailyBriefingMessage[]
  examPrompt?: ExamPrompt
  actions: DailyBriefingAction[]
}

export type ExamPrompt = {
  course?: string
  code?: string
  when?: string
}

export type Persona = {
  registerNumber?: string
  program?: string
  school?: string
  email?: string
  hostelBlock?: string
  room?: string
  mess?: string
}

export type NextClassComputation = {
  classInfo: any
  startsAt?: Date
} | null

export function buildGreeting(reference: Date, name?: string) {
  const hour = reference.getHours()
  let prefix = 'good morning'
  if (hour >= 10 && hour < 12) prefix = 'good late morning'
  else if (hour >= 12 && hour < 17) prefix = 'good afternoon'
  else if (hour >= 17 && hour < 21) prefix = 'good evening'
  else if (hour >= 21 || hour < 5) prefix = 'good night'
  return name ? `${prefix}, ${name}` : prefix
}

export function deriveTerseName(profileSnapshot?: PersonalHubSnapshot | null) {
  if (!profileSnapshot) return 'there'
  const structured: any = profileSnapshot.structured_data || {}
  const persona = structured?.persona || {}
  const student = structured?.student || {}
  const candidates: Array<string | undefined | null> = [
    student?.name,
    student?.full_name,
    student?.fullName,
    persona?.name,
    persona?.studentName,
    structured?.name,
    profileSnapshot.title,
  ]

  const emailCandidate =
    persona?.email ||
    persona?.vitEmail ||
    student?.email ||
    student?.email_id ||
    student?.emailId ||
    student?.vitEmail ||
    structured?.vitEmail ||
    structured?.email

  if (emailCandidate) {
    candidates.unshift(extractNameFromEmail(emailCandidate))
  }

  const raw = candidates.find(candidate => candidate && candidate.trim()) || 'there'
  return normalizeNameToken(raw)
}

function extractNameFromEmail(email: string) {
  if (!email) return null
  const local = email.split('@')[0]?.trim()
  if (!local) return null
  const cleaned = local.replace(/\d+$/g, '')
  const parts = cleaned.split(/[._-]+/).filter(Boolean)
  if (!parts.length) return null
  return parts[0]
}

function normalizeNameToken(value?: string | null) {
  if (!value) return 'there'
  const trimmed = value.trim()
  if (!trimmed) return 'there'
  const sanitized = trimmed.toLowerCase().startsWith('hey ') ? trimmed.slice(4).trim() : trimmed
  const token = sanitized.split(/[\s._-]+/).filter(Boolean)[0] || 'there'
  if (!token) return 'there'
  const lower = token.replace(/[^A-Za-z]/g, '') || token
  if (!lower) return 'there'
  return lower.charAt(0).toUpperCase() + lower.slice(1).toLowerCase()
}

export function buildDailyBriefingContext(
  snapshots: PersonalHubSnapshot[],
  referenceDate: Date
): DailyBriefingContext {
  const findSnapshot = (command: HubVTOPCommand | string) =>
    snapshots.find(snapshot => snapshot.command === command)

  const timetable = findSnapshot('timetable')
  const assignments = findSnapshot('da')
  const exams = findSnapshot('exams') || findSnapshot('exam-schedule')
  const attendanceSnapshot = findSnapshot('attendance')
  const librarySnapshot = findSnapshot('library-dues')
  const leaveSnapshot = findSnapshot('leave') || findSnapshot('leave-status')
  const gradesSnapshot = findSnapshot('grades')

  const normalizedAssignments = normalizeAssignments(assignments, referenceDate)
  const upcomingAssignments = normalizedAssignments
    .filter(item => item.dueDate)
    .sort((a, b) => (a.dueDate!.getTime() || 0) - (b.dueDate!.getTime() || 0))

  const assignmentsDueSoon = upcomingAssignments.filter(item => {
    if (!item.dueDate) return false
    const diff = differenceInCalendarDays(item.dueDate, referenceDate)
    return diff <= 2
  })

  const timetableData = timetable?.structured_data
  const nextClassComputation = timetableData
    ? computeDynamicNextClass(timetableData, referenceDate)
    : null

  const examSchedule = normalizeExamSchedule(exams, referenceDate)
    .filter(entry => entry.examDateObj)
    .sort((a, b) => (a.examDateObj!.getTime() || 0) - (b.examDateObj!.getTime() || 0))
  const upcomingExam = examSchedule.find(
    entry => entry.examDateObj && entry.examDateObj >= referenceDate
  )
  const examFocus = upcomingExam || examSchedule[0]
  const examDaysAway = examFocus?.examDateObj
    ? differenceInCalendarDays(examFocus.examDateObj, referenceDate)
    : null
  let examPhrase: 'right here' | 'almost here' | 'around the corner' | null = null
  if (typeof examDaysAway === 'number') {
    if (examDaysAway <= 0) examPhrase = 'right here'
    else if (examDaysAway <= 3) examPhrase = 'almost here'
    else if (examDaysAway <= 7) examPhrase = 'around the corner'
  }

  let busyScore = 0
  if (assignmentsDueSoon.length >= 2) busyScore += 2
  if (
    assignmentsDueSoon.some(
      item => item.dueDate && differenceInCalendarDays(item.dueDate, referenceDate) <= 1
    )
  ) {
    busyScore += 1
  }
  if (nextClassComputation?.startsAt) {
    const delta = nextClassComputation.startsAt.getTime() - referenceDate.getTime()
    if (delta <= 60 * 60 * 1000) {
      busyScore += 1
    }
  }
  if (examPhrase) busyScore += 2

  const messages: DailyBriefingMessage[] = []
  if (busyScore >= 3) {
    messages.push({ id: 'mood-busy', primary: 'today looks like a very busy day.' })
  } else if (busyScore <= 0) {
    messages.push({
      id: 'mood-calm',
      primary: 'today looks mellow—reset and go again.',
      tone: 'calm',
    })
  } else {
    messages.push({ id: 'mood-balanced', primary: 'today looks balanced. pace yourself.' })
  }

  const todaysClasses = timetableData ? deriveClassesForDay(timetableData, referenceDate) : []
  if (todaysClasses.length > 0) {
    const scheduleNarrative = buildClassScheduleNarrative(todaysClasses, referenceDate)
    if (scheduleNarrative) {
      messages.push(scheduleNarrative)
    }
  } else if (timetable) {
    messages.push({
      id: 'classes-today',
      primary: 'no classes scheduled on the timetable today.',
      tone: 'calm',
    })
  }

  if (examPhrase) {
    messages.push({ id: 'exam-heads-up', primary: `FAT exams are ${examPhrase}.`, tone: 'alert' })
    examSchedule.slice(0, 3).forEach((entry, index) => {
      if (!entry.examDateObj) return
      const when = `${formatDateWithTime(entry.examDateObj)}${entry.venue ? ` · ${entry.venue}` : ''}`
      messages.push({
        id: `exam-${index}`,
        primary: entry.title || entry.course || entry.code || 'exam',
        supporting: when,
      })
    })
  }

  if (typeof examDaysAway === 'number' && examDaysAway <= 0 && todaysClasses.length > 0) {
    const earliestClass = todaysClasses.find(cls => cls.startMinutes != null)
    const lastClassWithTime = [...todaysClasses].reverse().find(cls => cls.startMinutes != null)
    const windowLabel =
      earliestClass && lastClassWithTime
        ? `${formatMinutesLabel(earliestClass.startMinutes!)} → ${formatMinutesLabel(lastClassWithTime.startMinutes!)}`
        : null
    messages.push({
      id: 'exam-class-balance',
      primary: `exam today plus ${todaysClasses.length} class${todaysClasses.length === 1 ? '' : 'es'} to juggle`,
      supporting: windowLabel
        ? `${windowLabel} timetable window—plan buffers`
        : 'plan buffers between exam blocks and class slots',
      tone: 'alert',
    })
  }

  if (upcomingAssignments.length > 0) {
    upcomingAssignments.slice(0, 3).forEach((assignment, index) => {
      const dueLabel = assignment.dueDate
        ? `${formatShortDate(assignment.dueDate)} (${formatDistanceToNow(assignment.dueDate, { addSuffix: true })})`
        : assignment.nextDue
      messages.push({
        id: `assignment-${index}`,
        primary:
          `${assignment.subject || 'assignment'}${dueLabel ? ` due ${dueLabel}` : ''}`.trim(),
        supporting: assignment.status,
      })
    })
  }

  const nextClassInsight = timetable
    ? deriveNextClassInsight(timetable, referenceDate.getTime())
    : null
  if (nextClassInsight) {
    messages.push({
      id: 'next-class',
      primary: nextClassInsight.headline,
      supporting: nextClassInsight.supporting || nextClassInsight.meta,
    })
  }

  const examPrompt =
    examPhrase && examFocus?.examDateObj
      ? {
          course: examFocus.title || examFocus.course || examFocus.code,
          code: examFocus.code,
          when: formatDateWithTime(examFocus.examDateObj),
        }
      : undefined

  const notifications = deriveNotifications(
    {
      attendanceSnapshot,
      assignmentsSnapshot: assignments,
      leaveSnapshot,
      examsSnapshot: exams,
      librarySnapshot,
      gradesSnapshot,
    },
    referenceDate.getTime()
  )

  const actions: DailyBriefingAction[] = []
  const pushAction = (id: string, label: string, command: HubVTOPCommand) => {
    if (actions.find(action => action.command === command)) return
    actions.push({ id, label, command })
  }

  notifications.slice(0, 3).forEach(notification => {
    if (notification.command) {
      pushAction(`notif-${notification.id}`, notification.text, notification.command)
    }
  })

  if (assignmentsDueSoon[0]) {
    pushAction('focus-da', 'review assignments', 'da')
  }
  if (nextClassComputation) {
    pushAction('focus-timetable', 'view timetable', 'timetable')
  }
  if (attendanceSnapshot) {
    pushAction('focus-attendance', 'open attendance watch', 'attendance')
  }

  const attendanceStats = (attendanceSnapshot?.structured_data as any)?.stats
  if (attendanceStats?.needsAttention > 0) {
    messages.push({
      id: 'attendance-status',
      primary: `${attendanceStats.needsAttention} course${attendanceStats.needsAttention === 1 ? '' : 's'} have low attendance`,
      supporting: attendanceStats.worstSubject
        ? `${attendanceStats.worstSubject} at ${attendanceStats.worstPercentage}%`
        : undefined,
      tone: 'alert',
    })
  } else if (attendanceStats?.healthy > 0) {
    messages.push({
      id: 'attendance-ok',
      primary: `${attendanceStats.healthy} course${attendanceStats.healthy === 1 ? '' : 's'} steady at or above target`,
    })
  }

  const pendingLeave = (leaveSnapshot?.structured_data as any)?.pending
  if (pendingLeave?.status && pendingLeave.status.toLowerCase().includes('pending')) {
    messages.push({
      id: 'leave-pending',
      primary: 'leave request still pending approval.',
      supporting: pendingLeave.reason || undefined,
      tone: 'neutral',
    })
    pushAction('focus-leave', 'check leave status', 'leave')
  }

  const libraryTotal = (librarySnapshot?.structured_data as any)?.total
  if (libraryTotal && libraryTotal > 0) {
    messages.push({
      id: 'library-dues',
      primary: `library dues ₹${libraryTotal.toFixed(2)}`,
      supporting: 'settle before fines grow',
      tone: 'alert',
    })
    pushAction('focus-library', 'pay library dues', 'library-dues')
  }

  const gradeRisk = ((gradesSnapshot?.structured_data as any)?.risk || []) as any[]
  if (gradeRisk.length > 0) {
    messages.push({
      id: 'grade-risk',
      primary: `${gradeRisk.length} grade${gradeRisk.length === 1 ? '' : 's'} flagged last term`,
      supporting: 'review grade history for remediation',
    })
    pushAction('focus-grades', 'review grades', 'grades')
  }

  return { messages, examPrompt, actions: actions.slice(0, 3) }
}

export function deriveNextClassInsight(snapshot?: PersonalHubSnapshot | null, nowTick?: number) {
  if (!snapshot?.structured_data) return null
  const reference = nowTick ? new Date(nowTick) : new Date()
  const rolling = computeDynamicNextClass(snapshot.structured_data, reference)
  const data: any = snapshot.structured_data
  const fallback =
    rolling?.classInfo ||
    data?.upcomingClass ||
    data?.upcoming ||
    data?.nextClass ||
    data?.next_session ||
    data?.next ||
    (Array.isArray(data?.classes) ? data.classes[0] : null)

  if (!fallback) return null

  const course = fallback.course || fallback.subject || fallback.title || snapshot.title
  const room = fallback.location || fallback.room || fallback.venue
  const timeStamp = rolling?.startsAt
    ? new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(rolling.startsAt)
    : fallback.startTime || fallback.start || fallback.slot || fallback.time

  const supportingParts = [
    fallback.day,
    rolling?.startsAt ? formatDistanceToNow(rolling.startsAt, { addSuffix: true }) : null,
    room ? `room ${room}` : null,
  ].filter(Boolean)

  return {
    headline: `${course || 'class'} @ ${timeStamp || 'unknown'}`.trim(),
    supporting: supportingParts.length ? supportingParts.join(' · ') : undefined,
    meta: fallback.faculty ? `with ${fallback.faculty}` : undefined,
  }
}

export function deriveAssignmentInsight(snapshot?: PersonalHubSnapshot | null, nowTick?: number) {
  if (!snapshot?.structured_data) return null
  const now = nowTick ? new Date(nowTick) : new Date()
  const subjects = normalizeAssignments(snapshot, now)
  if (!subjects.length) return null
  const upcoming = pickUpcomingAssignment(subjects, now) || subjects[0]
  if (!upcoming) return null
  const absolute = upcoming.dueDate ? formatShortDate(upcoming.dueDate) : upcoming.nextDue
  const relative = upcoming.dueDate
    ? formatDistanceToNow(upcoming.dueDate, { addSuffix: true })
    : undefined

  return {
    headline: upcoming.subject || 'assignment',
    supporting: absolute ? [absolute, relative].filter(Boolean).join(' · ') : undefined,
    meta: upcoming.status,
  }
}

export function deriveAttendanceInsight(snapshot?: PersonalHubSnapshot | null) {
  if (!snapshot?.structured_data) return null
  const stats = (snapshot.structured_data as any)?.stats
  if (stats?.healthy !== undefined) {
    return {
      headline: `${stats.healthy} steady / ${stats.needsAttention} at risk`,
      supporting: snapshot.summary,
      meta: 'auto synced',
    }
  }
  return snapshot.summary
    ? {
        headline: snapshot.summary,
      }
    : null
}

export function deriveLeaveInsight(snapshot?: PersonalHubSnapshot | null) {
  if (!snapshot?.structured_data) return null
  const data: any = snapshot.structured_data
  const pending = (data.requests || data.leaves || []).find((req: any) =>
    (req.status || req.state || '').toLowerCase().includes('pending')
  )
  if (pending) {
    return {
      headline: pending.title || pending.purpose || 'pending request',
      supporting: pending.status,
      meta: pending.from && pending.to ? `${pending.from} → ${pending.to}` : undefined,
    }
  }
  return {
    headline: 'no pending leave',
  }
}

export function deriveExamInsight(snapshot?: PersonalHubSnapshot | null, nowTick?: number) {
  if (!snapshot?.structured_data) return null
  const now = nowTick ? new Date(nowTick) : new Date()
  const schedule = normalizeExamSchedule(snapshot, now)
  if (!schedule.length) return null
  const upcoming = pickUpcomingExam(schedule, now) || schedule[0]
  if (!upcoming || !upcoming.examDateObj) return null

  const relative = formatDistanceToNow(upcoming.examDateObj, { addSuffix: true })
  const daysUntil = differenceInCalendarDays(upcoming.examDateObj, now)
  const nearby = daysUntil >= 0 && daysUntil <= 7
  const baseLabel = upcoming.title || upcoming.course || upcoming.code || 'exam'
  const countdownLabel =
    daysUntil === 0 ? 'today' : daysUntil === 1 ? 'in 1 day' : `in ${daysUntil} days`
  const headline = nearby
    ? `${baseLabel} ${countdownLabel}`
    : `${baseLabel} on ${formatShortDate(upcoming.examDateObj)}`

  return {
    headline,
    supporting:
      [upcoming.examTime, relative, nearby ? 'nearby exam' : undefined]
        .filter(Boolean)
        .join(' · ') || undefined,
    meta: upcoming.venue || upcoming.hall || upcoming.slot,
  }
}

export function derivePersona(
  profileSnapshot?: PersonalHubSnapshot | null,
  hostelSnapshot?: PersonalHubSnapshot | null
): Persona | null {
  const persona: Persona = {}
  const profileData = (profileSnapshot?.structured_data as any)?.persona
  if (profileData) {
    persona.registerNumber = profileData.registerNumber
    persona.program = profileData.program
    persona.email = profileData.email
    persona.school = profileData.school
  }
  const hostelInfo = (hostelSnapshot?.structured_data as any)?.info
  if (hostelInfo) {
    persona.hostelBlock = hostelInfo['hostel name'] || hostelInfo['hostel block']
    persona.room = hostelInfo['room no'] || hostelInfo['room number']
    persona.mess = hostelInfo['mess type'] || hostelInfo['mess']
  }
  if (Object.values(persona).every(value => !value)) {
    return null
  }
  return persona
}

export function deriveNotifications(
  snapshots: {
    attendanceSnapshot?: PersonalHubSnapshot | null
    assignmentsSnapshot?: PersonalHubSnapshot | null
    leaveSnapshot?: PersonalHubSnapshot | null
    examsSnapshot?: PersonalHubSnapshot | null
    librarySnapshot?: PersonalHubSnapshot | null
    gradesSnapshot?: PersonalHubSnapshot | null
  },
  nowTick?: number
) {
  const notifications: { id: string; text: string; command?: HubVTOPCommand }[] = []
  const now = nowTick ? new Date(nowTick) : new Date()

  const attendanceStats = (snapshots.attendanceSnapshot?.structured_data as any)?.stats
  if (attendanceStats?.needsAttention > 0) {
    notifications.push({
      id: 'attendance-risk',
      text: `${attendanceStats.needsAttention} course${attendanceStats.needsAttention === 1 ? '' : 's'} below 75%`,
      command: 'attendance',
    })
  }

  const assignmentList = normalizeAssignments(snapshots.assignmentsSnapshot, now)
  const upcomingDA = pickUpcomingAssignment(assignmentList, now)
  if (upcomingDA?.subject) {
    const relative = upcomingDA.dueDate
      ? formatDistanceToNow(upcomingDA.dueDate, { addSuffix: true })
      : upcomingDA.nextDue
    notifications.push({
      id: 'da-due',
      text: `${upcomingDA.subject} due ${relative}`,
      command: 'da',
    })
  }

  const pendingLeave = (snapshots.leaveSnapshot?.structured_data as any)?.pending
  if (pendingLeave?.status && pendingLeave.status.toLowerCase().includes('pending')) {
    notifications.push({
      id: 'leave-pending',
      text: `Leave pending: ${pendingLeave.reason || pendingLeave.status}`,
      command: 'leave',
    })
  }

  const normalizedExams = normalizeExamSchedule(snapshots.examsSnapshot, now)
  const upcomingExam = pickUpcomingExam(normalizedExams, now)
  if (upcomingExam?.examDateObj) {
    const relative = formatDistanceToNow(upcomingExam.examDateObj, { addSuffix: true })
    notifications.push({
      id: 'exam-soon',
      text: `${upcomingExam.title || upcomingExam.code} ${relative}`,
      command: 'exams',
    })
  }

  const libraryTotal = (snapshots.librarySnapshot?.structured_data as any)?.total
  if (libraryTotal && libraryTotal > 0) {
    notifications.push({
      id: 'library-dues',
      text: `Library dues: ₹${libraryTotal.toFixed(2)}`,
      command: 'library-dues',
    })
  }

  const gradeRisk = ((snapshots.gradesSnapshot?.structured_data as any)?.risk || []) as any[]
  if (gradeRisk.length > 0) {
    notifications.push({
      id: 'grade-risk',
      text: `${gradeRisk.length} grade${gradeRisk.length === 1 ? '' : 's'} need attention`,
      command: 'grades',
    })
  }

  return notifications.slice(0, 4)
}

export type NormalizedAssignment = {
  subject?: string
  status?: string
  nextDue?: string
  dueDate?: Date | null
  [key: string]: any
}

export function normalizeAssignments(
  snapshot: PersonalHubSnapshot | null | undefined,
  reference: Date
): NormalizedAssignment[] {
  if (!snapshot?.structured_data) return []
  const payload: any = snapshot.structured_data
  const subjects =
    (Array.isArray(payload?.subjects) && payload.subjects) ||
    (Array.isArray(payload?.assignments) && payload.assignments) ||
    (Array.isArray(payload?.items) && payload.items) ||
    []

  return subjects.map((item: any) => {
    const subject = item.subject || item.title || item.course || item.assignment
    const status = item.status || item.state
    const dueLabel = item.nextDue || item.next_due || item.dueDate || item.deadline || item.due
    return {
      ...item,
      subject,
      status,
      nextDue: dueLabel,
      dueDate: parseDateString(dueLabel, reference),
    }
  })
}

function pickUpcomingAssignment(
  list: NormalizedAssignment[],
  now: Date
): NormalizedAssignment | null {
  const dated = list
    .filter(item => item.dueDate && item.subject)
    .sort((a, b) => (a.dueDate!.getTime() || 0) - (b.dueDate!.getTime() || 0))

  const future = dated.find(item => item.dueDate && item.dueDate >= now)
  return future || dated[0] || null
}

export type NormalizedExamEntry = {
  examDateObj?: Date | null
  examDate?: string
  examTime?: string
  session?: string
  title?: string
  code?: string
  course?: string
  venue?: string
  hall?: string
  [key: string]: any
}

export function normalizeExamSchedule(
  snapshot: PersonalHubSnapshot | null | undefined,
  reference: Date
): NormalizedExamEntry[] {
  if (!snapshot?.structured_data) return []
  const payload: any = snapshot.structured_data
  const schedule: any[] =
    (Array.isArray(payload?.schedule) && payload.schedule) ||
    (Array.isArray(payload?.exams) && payload.exams) ||
    []

  return schedule.map(entry => {
    const date = parseDateString(entry.examDate || entry.date, reference)
    if (date) {
      const timeParts = parseStartTime(entry.examTime || entry.time || entry.session)
      if (timeParts) {
        date.setHours(timeParts.hour, timeParts.minute ?? 0, 0, 0)
      }
    }
    return {
      ...entry,
      examDateObj: date,
    }
  })
}

function pickUpcomingExam(list: NormalizedExamEntry[], now: Date): NormalizedExamEntry | null {
  const dated = list
    .filter(entry => entry.examDateObj)
    .sort((a, b) => (a.examDateObj!.getTime() || 0) - (b.examDateObj!.getTime() || 0))

  const future = dated.find(entry => entry.examDateObj && entry.examDateObj >= now)
  return future || dated[0] || null
}

export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatDateWithTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const MONTH_INDEX_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

function parseDateString(value?: string, referenceDate: Date = new Date()): Date | null {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()

  if (lower.includes('today')) {
    return new Date(referenceDate)
  }
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(referenceDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed)
  }

  let match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (match) {
    const day = parseInt(match[1], 10)
    const month = parseInt(match[2], 10) - 1
    const year = parseInt(match[3], 10)
    if (month >= 0 && month < 12) {
      return new Date(year < 100 ? 2000 + year : year, month, day)
    }
  }

  match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{2,4}))?$/)
  if (match) {
    const day = parseInt(match[1], 10)
    const monthKey = match[2].toLowerCase()
    const month = MONTH_INDEX_MAP[monthKey]
    if (month !== undefined) {
      let year = match[3] ? parseInt(match[3], 10) : referenceDate.getFullYear()
      if (year < 100) year += 2000
      const date = new Date(year, month, day)
      if (!match[3] && date < referenceDate) {
        date.setFullYear(date.getFullYear() + 1)
      }
      return date
    }
  }

  return null
}

const DAY_INDEX_MAP: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
}

const DAY_ALIAS_MAP: Record<string, string> = {
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
  sun: 'sunday',
  sunday: 'sunday',
}

export function computeDynamicNextClass(
  structuredData: any,
  referenceDate: Date = new Date()
): NextClassComputation {
  const candidates = extractTimetableCandidates(structuredData)
  if (!candidates.length) return null

  const now = referenceDate
  const currentDayIndex = (now.getDay() + 6) % 7
  let winner: { classInfo: any; startsAt?: Date } | null = null
  let bestDelta = Infinity

  candidates.forEach(candidate => {
    const dayValue = candidate.day || candidate.dayName || candidate.weekday || candidate.Day
    const dayIndex = resolveDayIndex(dayValue)
    if (dayIndex === null) return

    const timeSource =
      candidate.startTime ||
      candidate.start ||
      candidate.start_time ||
      candidate.time ||
      candidate.slotTime ||
      candidate.slot
    const timeParts = parseStartTime(timeSource)
    if (!timeParts) return

    const start = new Date(now)
    start.setHours(timeParts.hour, timeParts.minute ?? 0, 0, 0)

    let diff = dayIndex - currentDayIndex
    if (diff < 0) diff += 7
    if (diff === 0 && start <= now) {
      diff = 7
    }
    start.setDate(start.getDate() + diff)

    const delta = start.getTime() - now.getTime()
    if (delta < bestDelta) {
      bestDelta = delta
      winner = { classInfo: candidate, startsAt: start }
    }
  })

  return winner
}

type DayClassSummary = {
  subject: string
  timeLabel?: string
  venue?: string
  sortValue: number
  startMinutes?: number | null
}

function deriveClassesForDay(structuredData: any, referenceDate: Date): DayClassSummary[] {
  const candidates = extractTimetableCandidates(structuredData)
  if (!candidates.length) return []
  const targetIndex = (referenceDate.getDay() + 6) % 7
  const results: DayClassSummary[] = []

  candidates.forEach(candidate => {
    const dayValue =
      candidate.day ||
      candidate.Day ||
      candidate.dayName ||
      candidate.dayname ||
      candidate.weekday ||
      candidate.DayName
    const dayIndex = resolveDayIndex(typeof dayValue === 'string' ? dayValue : undefined)
    if (dayIndex === null || dayIndex !== targetIndex) return

    const subject =
      candidate.subject ||
      candidate.course ||
      candidate.title ||
      candidate.code ||
      candidate.slot ||
      candidate.className
    if (!subject || typeof subject !== 'string') return

    const timeSource =
      candidate.startTime ||
      candidate.time ||
      candidate.slotTime ||
      candidate.start ||
      candidate.slot ||
      candidate.timeRange
    const timeLabel =
      typeof timeSource === 'string'
        ? timeSource
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
        : undefined
    const parsed = typeof timeSource === 'string' ? parseStartTime(timeSource) : null
    const sortValue = parsed ? parsed.hour * 60 + (parsed.minute ?? 0) : 24 * 60 + results.length

    results.push({
      subject: subject.trim(),
      timeLabel,
      venue: candidate.venue || candidate.room || candidate.location || candidate.hall,
      sortValue,
      startMinutes: parsed ? sortValue : null,
    })
  })

  return results.sort((a, b) => a.sortValue - b.sortValue)
}

function buildClassScheduleNarrative(
  classes: DayClassSummary[],
  referenceDate: Date
): DailyBriefingMessage | null {
  if (!classes.length) return null
  const sorted = [...classes].sort((a, b) => a.sortValue - b.sortValue)
  const withTime = sorted.filter(cls => typeof cls.startMinutes === 'number')
  const totalCount = sorted.length

  const fallbackPreview = sorted
    .slice(0, 3)
    .map(cls => {
      const detail = [cls.timeLabel, cls.venue].filter(Boolean).join(' · ')
      return detail ? `${cls.subject} (${detail})` : cls.subject
    })
    .join(' · ')

  if (!withTime.length) {
    return {
      id: 'classes-today',
      primary: `${totalCount} class${totalCount === 1 ? '' : 'es'} on the calendar today`,
      supporting: fallbackPreview || undefined,
    }
  }

  const first = withTime[0]
  const last = withTime[withTime.length - 1]
  const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes()
  const upcoming = withTime.find(cls => (cls.startMinutes as number) >= nowMinutes) || first
  const windowLabel = `${formatMinutesLabel(first.startMinutes!)} → ${formatMinutesLabel(last.startMinutes!)}`
  const spanMinutes = Math.max(0, (last.startMinutes ?? 0) - (first.startMinutes ?? 0))
  const longestGap = computeLongestGap(withTime)

  const supportingBits = [windowLabel]
  if (spanMinutes >= 180) {
    supportingBits.push(`≈${formatDurationLabel(spanMinutes)} on campus`)
  }
  if (longestGap && longestGap.minutes >= 90) {
    supportingBits.push(
      `gap ${formatDurationLabel(longestGap.minutes)} between ${longestGap.from.subject} and ${longestGap.to.subject}`
    )
  }
  if (fallbackPreview) {
    supportingBits.push(fallbackPreview)
  }

  return {
    id: 'classes-today',
    primary: `${upcoming.subject} at ${formatMinutesLabel(upcoming.startMinutes!)} is next of ${totalCount} class${
      totalCount === 1 ? '' : 'es'
    } today`,
    supporting: supportingBits.filter(Boolean).join(' · ') || undefined,
  }
}

function computeLongestGap(classes: DayClassSummary[]) {
  let longest: { minutes: number; from: DayClassSummary; to: DayClassSummary } | null = null
  for (let i = 0; i < classes.length - 1; i += 1) {
    const current = classes[i]
    const next = classes[i + 1]
    if (current.startMinutes == null || next.startMinutes == null) continue
    const diff = next.startMinutes - current.startMinutes
    if (!longest || diff > longest.minutes) {
      longest = { minutes: diff, from: current, to: next }
    }
  }
  return longest
}

function formatMinutesLabel(minutes: number) {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  base.setMinutes(minutes)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(base)
}

function formatDurationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (mins > 0) parts.push(`${mins}m`)
  return parts.length ? parts.join(' ') : '0m'
}

function extractTimetableCandidates(structuredData: any): any[] {
  if (!structuredData) return []
  const pools = ['classes', 'schedule', 'sessions']
  const result: any[] = []
  const push = (entry: any) => {
    if (entry && typeof entry === 'object') {
      result.push(entry)
    }
  }
  pools.forEach(key => {
    const collection = structuredData[key]
    if (Array.isArray(collection)) {
      collection.forEach(push)
    }
  })
  return result
}

function resolveDayIndex(dayValue?: string): number | null {
  if (!dayValue || typeof dayValue !== 'string') return null
  const normalized = dayValue.trim().toLowerCase().replace(/\./g, '')
  const alias = DAY_ALIAS_MAP[normalized] || DAY_ALIAS_MAP[normalized.slice(0, 3)] || normalized
  const index = DAY_INDEX_MAP[alias]
  return typeof index === 'number' ? index : null
}

function parseStartTime(value?: string) {
  if (!value || typeof value !== 'string') return null
  const lower = value.toLowerCase()
  if (lower.includes('fn') || lower.includes('forenoon')) {
    return { hour: 9, minute: 0 }
  }
  if (lower.includes('an') || lower.includes('afternoon')) {
    return { hour: 13, minute: 30 }
  }
  const primary = value.split(/-|–|—|to/i)[0]?.trim() || ''
  if (!primary) return null
  const sanitized = primary.replace(/(hrs|hours)/gi, '').trim()
  const match = sanitized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (match) {
    let hour = parseInt(match[1], 10)
    const minute = match[2] ? parseInt(match[2], 10) : 0
    const suffix = match[3]?.toLowerCase()
    if (suffix === 'pm' && hour < 12) hour += 12
    if (suffix === 'am' && hour === 12) hour = 0
    if (hour >= 24 || minute >= 60) return null
    return { hour, minute }
  }

  const digitsOnly = sanitized.replace(/\D/g, '')
  if (digitsOnly.length === 4) {
    const hour = parseInt(digitsOnly.slice(0, 2), 10)
    const minute = parseInt(digitsOnly.slice(2), 10)
    if (hour >= 24 || minute >= 60) return null
    return { hour, minute }
  }

  return null
}

export function formatLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parsePreferenceTime(timeValue?: string, reference: Date = new Date()) {
  if (!timeValue || typeof timeValue !== 'string') return null
  const parts = timeValue.split(':')
  if (parts.length < 2) return null
  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  const candidate = new Date(reference)
  candidate.setHours(hours, minutes, 0, 0)
  return candidate
}

export function formatPreferenceTimeLabel(timeValue?: string) {
  if (!timeValue) return ''
  const parts = timeValue.split(':')
  if (parts.length < 2) return timeValue
  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return timeValue
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

