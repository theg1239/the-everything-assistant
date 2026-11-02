#!/usr/bin/env node
'use strict'

/**
 * Fake cli-top v2.12.1 for tests and benchmarks.
 *
 * Reproduces the machine-facing `cli-top proxy <username> <password> <command> [flags]`
 * protocol as implemented in cli-top c3d14de (cmd/proxy_command.go, internal/proxyutil,
 * helpers/table-renderer.go and the features/*.go selection paths):
 *
 *  - startup: GET $CLI_TOP_LATEST_JSON_URL (kill switch); killSwitch 2 prints a plain-text
 *    "decommissioned" line and exits 0 without an envelope
 *  - config: viper reads ./cli-top-config.env; without a UUID the real binary registers a new one
 *  - login failures print human text to stdout BEFORE the JSON envelope
 *  - one JSON envelope line: { success, command, version, requested_at, completed_at,
 *    duration_ms, reg_no, flags, output, structured_data: { tables, selection_requests, messages },
 *    error: { kind, message } }
 *  - selection steps emit `selection_requests` (subject/query/message/table) and stop
 *  - downloads are written under $HOME/Downloads/CLI-TOP Downloads/... (no paths in the envelope
 *    except what features print, e.g. "File saved to: <path>")
 *
 * Behaviour switches (by credentials / env):
 *  password "wrong"   -> auth_failed with "Invalid LoginId/Password" preamble
 *  password "locked"  -> auth_failed with "Maximum Fail Attempts" preamble
 *  password "captcha" -> auth_failed with captcha preamble
 *  password "down"    -> auth_failed, no preamble (VTOP unreachable)
 *  password "homefail"-> auth_failed "invalid VTOP credentials" (home page failed after login)
 *  password "crash"   -> panic on stderr, exit 2, no envelope
 *  password "garbage" -> non-JSON stdout, exit 0
 *  password "slow"    -> sleeps FAKE_SLOW_MS (default 5000) before answering
 *  password "pending" -> leave/nightslip apply fails with "already pending"
 *  password "flaky-*" -> first call per password fails with a network execution_error
 *  FAKE_LOGIN_MS        simulated login latency (default 0)
 *  FAKE_LATEST_JSON_MS  simulated latency of the official latest.json fetch when no override URL
 *  FAKE_CLI_LOG         append one JSON line per invocation (argv, env keys, cwd)
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const VERSION = '2.12.1'
const started = Date.now()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ---------------------------------------------------------------- proxyutil.ParseFlags port
function canonicalFlagName(flag) {
  const n = flag.trim().toLowerCase()
  const map = {
    s: 'semester', semester: 'semester', semesterflag: 'semester', semesterquery: 'semester',
    c: 'course', course: 'course', 'course-name': 'course', coursename: 'course',
    category: 'category', 'curriculum-category': 'category', curriculumcategory: 'category',
    f: 'faculty', faculty: 'faculty', facultyflag: 'faculty',
    facility: 'facility', 'facility-name': 'facility', facilityname: 'facility',
    g: 'classGroup', 'class-group': 'classGroup', classgroup: 'classGroup',
    d: 'debug', debug: 'debug',
    x: 'commands', commands: 'commands', sync: 'commands', 'sync-commands': 'commands',
    apply: 'apply', details: 'details', reason: 'reason',
    materials: 'materials', material: 'materials', topics: 'materials', 'topic-selection': 'materials',
    assignment: 'assignment', assignments: 'assignment', 'da-selection': 'assignment',
    confirm: 'confirm', yes: 'confirm',
    'from-date': 'from-date', fromdate: 'from-date', latehourfromdate: 'from-date',
    'from-time': 'from-time', fromtime: 'from-time',
    'to-date': 'to-date', todate: 'to-date', latehourtodate: 'to-date',
    'to-time': 'to-time', totime: 'to-time',
    'cost-centre-id': 'cost-centre-id', costcentreid: 'cost-centre-id', 'cost-center-id': 'cost-centre-id', costcenterid: 'cost-centre-id',
    'applied-to': 'applied-to', appliedto: 'applied-to', 'warden-id': 'applied-to', 'approver-id': 'applied-to',
    'room-type-id': 'room-type-id', roomtypeid: 'room-type-id',
    'building-id': 'building-id', buildingid: 'building-id',
    venue: 'venue',
    'event-id': 'event-id', eventid: 'event-id', 'late-hour-event-id': 'event-id', latehoureventid: 'event-id',
  }
  return Object.prototype.hasOwnProperty.call(map, n) ? map[n] : n
}

function parseFlags(args) {
  if (!args.length) return null
  const flags = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg.startsWith('-')) continue
    const name = canonicalFlagName(arg.replace(/^-+/, ''))
    if (!name) continue
    let value = 'true'
    if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
      value = args[i + 1]
      i++
    }
    flags[name] = value
  }
  return Object.keys(flags).length ? flags : null
}

const intFlag = (flags, key) => {
  const raw = flags?.[key]
  if (!raw || !/^[+-]?\d+$/.test(raw)) return 0
  return parseInt(raw, 10)
}
const boolFlag = (flags, key) => ['1', 'true', 'yes', 'y', 'on'].includes(String(flags?.[key] || '').trim().toLowerCase())
const strFlag = (flags, key) => (flags && flags[key]) || ''

// ---------------------------------------------------------------- capture helpers (proxy mode)
class Capture {
  constructor() {
    this.lines = []
    this.tables = []
    this.selections = []
  }
  println(...parts) {
    this.lines.push(parts.join(' '))
  }
  table(nested, indexStatus = 0) {
    if (!nested.length) return
    const width = nested[0].length
    const normalized = nested.map(row => Array.from({ length: width }, (_, i) => row[i] ?? ''))
    normalized[0] = normalized[0].map(h => h.toUpperCase())
    if (indexStatus === 1) {
      normalized[0] = ['INDEX', ...normalized[0]]
      for (let i = 1; i < normalized.length; i++) normalized[i] = [String(i), ...normalized[i]]
    }
    this.tables.push({ headers: normalized[0], rows: normalized.slice(1), hasIndex: indexStatus === 1 })
  }
  select(subject, nested, query, message) {
    this.selections.push({
      subject,
      ...(query && query.trim() ? { query: query.trim() } : {}),
      ...(message ? { message } : {}),
      table: { headers: nested[0], rows: nested.slice(1), hasIndex: true },
    })
  }
}

function fuzzyMatch(query, target) {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!q.length) return true
  if (q.length > t.length) return false
  let qi = 0
  for (let i = 0; i < t.length; i++) {
    if (q[qi] === t[i]) {
      qi++
      if (qi === q.length) return true
    }
  }
  return false
}

/** helpers.TableSelector: numeric-only; out of range -> print table + emit selection request. */
function tableSelector(cap, subject, nested, query) {
  if (/^\d+$/.test(query)) {
    const choice = parseInt(query, 10)
    if (choice >= 1 && choice <= nested.length - 1) return choice
  }
  cap.table(nested, 1)
  cap.select(subject, nested, query, `selection required for ${subject}`)
  return 0
}

/** helpers.TableSelectorFuzzy (proxy-mode branches). */
function tableSelectorFuzzy(cap, subject, nested, query) {
  if (/^\d+$/.test(query)) {
    const choice = parseInt(query, 10)
    if (choice >= 1 && choice <= nested.length - 1) return choice
    cap.println(`Invalid number. Please enter a number between 1 and ${nested.length - 1}.`)
    query = ''
  }
  if (!query) {
    cap.table(nested, 1)
    cap.select(subject, nested, '', `selection required for ${subject}`)
    return 0
  }
  const matches = []
  nested.forEach((row, index) => {
    if (fuzzyMatch(query, row.join(' '))) matches.push(index)
  })
  const valid = matches.filter(i => i >= 1)
  if (matches.length === 0) {
    cap.println('No matching results found for your query.')
    cap.table(nested, 1)
    cap.select(subject, nested, query, `no matches found for ${subject}`)
    return 0
  }
  if (matches.length === 1 && valid.length === 1) return valid[0]
  if (!valid.length) {
    cap.table(nested, 1)
    cap.select(subject, nested, query, `no valid matches found for ${subject}`)
    return 0
  }
  const filtered = [nested[0], ...valid.map(i => nested[i])]
  cap.println('Multiple matches found. Please select from the results below:')
  cap.table(filtered, 1)
  cap.select(subject, filtered, query, `multiple matches found for ${subject}`)
  return 0
}

class ExecError extends Error {}

// ---------------------------------------------------------------- fake VTOP data
const SEMESTERS = [
  ['VL20242505', 'Winter Semester 2024-25'],
  ['VL20252601', 'Fall Semester 2025-26'],
]

function selectSemester(cap, flags) {
  const choice = intFlag(flags, 'semester')
  if (choice <= 0) return SEMESTERS[SEMESTERS.length - 1]
  const nested = [['Semester ID', 'Semester'], ...SEMESTERS]
  const index = tableSelector(cap, 'semester', nested, String(choice))
  if (!index) {
    cap.println('Error selecting semester: invalid semester selection')
    return null
  }
  return SEMESTERS[index - 1]
}

const COURSES = {
  'Fall Semester 2025-26': [
    ['CSE1001', 'Problem Solving and Programming', 'Embedded Theory'],
    ['CSE2001', 'Data Structures and Algorithms', 'Embedded Theory'],
    ['MAT1011', 'Calculus for Engineers', 'Theory Only'],
  ],
  'Winter Semester 2024-25': [['PHY1001', 'Engineering Physics', 'Theory Only']],
}

const FACULTY = {
  CSE1001: ['Anuj Kumar', 'Anjali Sharma', 'Ravi Shankar'],
  CSE2001: ['Meera Iyer'],
  MAT1011: ['Nobody Uploaded'],
  PHY1001: ['Old Physics Prof'],
}

const MATERIALS = [
  ['12-08-2025', '1', 'Introduction to programming', '1', ''],
  ['19-08-2025', '1', 'Variables and types', '1', ''],
  ['02-09-2025', '2', 'Control flow slides', '1', 'Open'],
  ['09-09-2025', '2', 'Loops worksheet', '1', ''],
  ['16-09-2025', '3', 'Functions', '1', ''],
]

function downloadsDir(...parts) {
  const dir = path.join(os.homedir(), 'Downloads', 'CLI-TOP Downloads', ...parts)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function parseIndices(input, max) {
  const indices = []
  const invalid = []
  for (const part of input.split(',').map(p => p.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/)
    if (range) {
      const a = parseInt(range[1], 10)
      const b = parseInt(range[2], 10)
      if (a < 1 || b > max || a > b) invalid.push(part)
      else for (let i = a; i <= b; i++) indices.push(i)
    } else if (/^\d+$/.test(part) && parseInt(part, 10) >= 1 && parseInt(part, 10) <= max) {
      indices.push(parseInt(part, 10))
    } else invalid.push(part)
  }
  return { indices: [...new Set(indices)], invalid }
}

function coursePage(cap, flags, archive) {
  let semesterName
  if (archive) {
    const sem = selectSemester(cap, flags)
    if (!sem) return
    semesterName = sem[1]
  } else {
    const names = SEMESTERS.map(s => s[1])
    const semFlag = intFlag(flags, 'semester')
    const selection = semFlag <= 0 ? String(names.length) : String(semFlag)
    const semIndex = tableSelector(cap, 'Semester', [['SEMESTER'], ...names.map(n => [n])], selection)
    if (!semIndex) {
      cap.println('Error selecting course: invalid semester selection')
      return
    }
    semesterName = names[semIndex - 1]
  }
  const courses = COURSES[semesterName] || []
  const courseTable = archive
    ? [['COURSE NAME'], ...courses.map(c => [`${c[0]} - ${c[1]} - ${c[2]}`])]
    : [['COURSE CODE', 'COURSE NAME'], ...courses.map(c => [c[0], c[1]])]
  const courseIndex = tableSelector(cap, 'Course', courseTable, String(intFlag(flags, 'course')))
  if (!courseIndex) {
    cap.println('Error selecting course: invalid course selection')
    return
  }
  const course = courses[courseIndex - 1]
  const faculty = FACULTY[course[0]] || []
  if (course[0] === 'MAT1011') {
    cap.println('Error fetching faculties: no material uploaded')
    return
  }
  const facultyTable = archive
    ? [['NAME', 'SLOT'], ...faculty.map((f, i) => [f, `A${i + 1}+TA${i + 1}`])]
    : [['FACULTY'], ...faculty.map(f => [f])]
  const facultyIndex = tableSelectorFuzzy(cap, 'Faculty', facultyTable, strFlag(flags, 'faculty'))
  if (!facultyIndex) {
    cap.println('Error fetching faculties: invalid faculty selection')
    return
  }
  const facultyName = faculty[facultyIndex - 1]
  const materialTable = [['DATE', 'MODULE', 'TOPIC', 'REF COUNT', 'WEB MATERIAL'], ...MATERIALS]
  cap.table(materialTable, 1)
  const selection = strFlag(flags, 'materials').trim()
  if (!selection) {
    cap.select('material', materialTable, '', 'material selection required')
    cap.println('Error selecting materials: material selection required')
    return
  }
  let chosen
  if (selection === '0') chosen = MATERIALS.map((_, i) => i + 1)
  else {
    const { indices, invalid } = parseIndices(selection, MATERIALS.length)
    if (invalid.length) {
      cap.println(`Error selecting materials: invalid material selection: ${invalid.join(', ')}`)
      return
    }
    chosen = indices
  }
  const dir = downloadsDir(
    archive ? 'Course Page Archive' : 'Course Page',
    semesterName.replace(/\s+/g, '_'),
    course[1],
    facultyName
  )
  for (const index of chosen) {
    const m = MATERIALS[index - 1]
    if (m[4]) {
      cap.println(`Web Material available for '${m[2]}'`)
      cap.println(`Link: https://vtop.vit.ac.in/vtop/web/${index}`)
    }
    const name = `Module-${m[1]}_${m[2].replace(/\s+/g, '_')}_${(1000 + index).toString(16)}abcd.pdf`
    fs.writeFileSync(path.join(dir, name), `%PDF-1.4\n% fake material ${index}\n`)
  }
  cap.println(`Downloading materials... 100% |███████████████| (${chosen.length}/${chosen.length})`)
  cap.println('Download complete!')
}

function syllabus(cap, flags) {
  const rows = [
    ['Problem Solving and Programming', 'CSE1001', 'Programme Core'],
    ['Data Structures and Algorithms', 'CSE2001', 'Programme Core'],
    ['Calculus for Engineers', 'MAT1011', 'University Core'],
  ]
  const nested = [['Course Title', 'Course Code', 'Category'], ...rows]
  const index = tableSelectorFuzzy(cap, 'Course', nested, strFlag(flags, 'course'))
  if (!index) {
    cap.println('Selection canceled')
    return
  }
  const row = rows[index - 1]
  const dir = downloadsDir('Syllabus')
  const file = path.join(dir, `${row[0]}_${row[1]}.pdf`)
  fs.writeFileSync(file, '%PDF-1.4\n% fake syllabus\n')
  cap.println(`Successfully downloaded syllabus for course ${row[1]}. File saved at: ${file}`)
}

function da(cap, flags) {
  const subjects = [
    ['Problem Solving and Programming', 'Pending', 'DA1 (in 3 days)'],
    ['Data Structures and Algorithms', 'Completed', '-'],
  ]
  cap.println('ICS file uploaded successfully. URL: https://calendar.example/da.ics')
  const nested = [['Subjects', 'STATUS', 'Next Pending DA'], ...subjects]
  const subjectIndex = tableSelectorFuzzy(cap, 'subject', nested, strFlag(flags, 'course'))
  if (!subjectIndex) return
  const das = [['DA1', '05-Nov-2025', '3', 'Pending', 'Yes', 'File Not Uploaded'], ['DA2', '20-Nov-2025', '18', 'Pending', 'No', 'File Not Uploaded']]
  const daTable = [['Title', 'Due Date', 'Days Left', 'Status', 'QP', 'Last Upload'], ...das]
  const daIndex = tableSelectorFuzzy(cap, 'DA', daTable, strFlag(flags, 'assignment'))
  if (!daIndex) return
  const chosen = das[daIndex - 1]
  if (chosen[4] === 'No') {
    cap.println('No question papers available for this DA.')
    return
  }
  const dir = downloadsDir('DA', `CSE1001_${subjects[subjectIndex - 1][0]}`)
  const file = path.join(dir, `${chosen[0]}.pdf`)
  fs.writeFileSync(file, '%PDF-1.4\n% fake DA\n')
  cap.println(`File saved to: ${file}`)
  cap.println('Click Here')
}

function facility(cap, flags) {
  const rows = [
    ['Gym (Men)', '1180.00', 'Open - 12 seats'],
    ['Badminton Court', '590.00', 'Registered'],
    ['Swimming Pool', '2360.00', 'Full'],
  ]
  cap.table([['FACILITY NAME', 'FEES (INCLUDING GST)', 'STATUS'], ...rows], 0)
  const nested = [['FACILITY NAME', 'FEES (INCLUDING GST)', 'STATUS'], ...rows]
  const index = tableSelectorFuzzy(cap, 'facility', nested, strFlag(flags, 'facility'))
  if (!index) throw new ExecError('facility selection required')
  const row = rows[index - 1]
  if (row[2] === 'Registered') throw new ExecError('selected facility is already registered')
  if (row[2] === 'Full') throw new ExecError('selected facility is full or unavailable for registration')
  if (!boolFlag(flags, 'confirm')) throw new ExecError('registration confirmation required; rerun with --confirm')
  cap.println('Registration completed successfully.')
}

function courseAllocation(cap, flags) {
  const categories = [['Programme Core'], ['University Elective']]
  const nested = [['CATEGORY NAME'], ...categories]
  const catIndex = tableSelectorFuzzy(cap, 'Category', nested, strFlag(flags, 'category'))
  if (!catIndex) return
  const courses = [['CSE1001 - Problem Solving and Programming'], ['CSE2001 - Data Structures and Algorithms']]
  const courseIndex = tableSelectorFuzzy(cap, 'Course', [['COURSE (CODE - TITLE)'], ...courses], strFlag(flags, 'course'))
  if (!courseIndex) return
  cap.table([['FACULTY', 'VENUE', 'SLOT', 'TYPE'], ['Anuj Kumar', 'SJT 401', 'A1+TA1', 'ETH'], ['Ravi Shankar', 'SJT 502', 'B1+TB1', 'ETH']], 0)
}

const KNOWN_LEAVE = [['WV', 'WINTER VACATION'], ['HT1', 'HOME TOWN'], ['EY1', 'EMERGENCY LEAVE'], ['LG1', 'LOCAL GUARDIAN'], ['WP', 'WITH PARENT LEAVE'], ['SV', 'SUMMER VACATION'], ['EP', 'OFFICIAL LEAVES']]
const fmtOptions = options => options.map(([v, l]) => (l && l !== v ? `${v} (${l})` : v)).join(', ')

function normalizeDate(value, flag) {
  if (!value || !value.trim()) throw new ExecError(`missing ${flag}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim()) && !/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(value.trim())) {
    throw new ExecError(`invalid ${flag}; use YYYY-MM-DD`)
  }
  return value.trim()
}
function normalizeTime(value, flag) {
  if (!value || !value.trim()) throw new ExecError(`missing ${flag}`)
  if (!/^\d{1,2}:\d{2}(\s?[AP]M)?$/i.test(value.trim())) {
    throw new ExecError(`invalid ${flag}; use a time like 08:30 PM or 20:30`)
  }
  return value.trim()
}

function leave(cap, flags, password) {
  const statusTable = [['PLACE', 'REASON', 'TYPE', 'FROM', 'TO', 'STATUS'], ['Chennai', 'Family visit', 'HOME TOWN', '01-Oct-2025', '03-Oct-2025', 'APPROVED']]
  if (!boolFlag(flags, 'apply')) {
    cap.table(statusTable, 0)
    return
  }
  const code = strFlag(flags, 'leave-code').trim()
  if (!code) throw new ExecError('missing --leave-code')
  const match = KNOWN_LEAVE.find(([v, l]) => v.toLowerCase() === code.toLowerCase() || l.toLowerCase() === code.toLowerCase())
  if (!match) throw new ExecError(`invalid --leave-code "${code}"; available leaveCode values: ${fmtOptions(KNOWN_LEAVE)}`)
  for (const [flag, label] of [['visiting-place', 'visiting place'], ['reason', 'reason']]) {
    const value = strFlag(flags, flag).trim()
    if (!value) throw new ExecError(`missing --${flag}`)
    if (/[<>]/.test(value)) throw new ExecError(`${label} cannot contain '<' or '>'`)
  }
  normalizeDate(strFlag(flags, 'from-date'), '--from-date')
  normalizeTime(strFlag(flags, 'from-time'), '--from-time')
  normalizeDate(strFlag(flags, 'to-date'), '--to-date')
  normalizeTime(strFlag(flags, 'to-time'), '--to-time')
  if (password === 'pending') {
    cap.println('')
    cap.println('A leave request is already pending approval. Clear it before applying for another one.')
    cap.table(statusTable, 0)
    throw new ExecError('leave request already pending')
  }
  cap.println('Leave request submitted successfully.')
  cap.table([...statusTable, [strFlag(flags, 'visiting-place'), strFlag(flags, 'reason'), match[1], strFlag(flags, 'from-date'), strFlag(flags, 'to-date'), 'PENDING']], 0)
}

function nightslip(cap, flags, password) {
  const statusTable = [['VENUE', 'EVENT', 'DETAILS', 'FROM', 'TO', 'STATUS'], ['SJT', 'Hackathon', 'Late lab', '01-Oct-2025', '01-Oct-2025', 'APPROVED']]
  if (!boolFlag(flags, 'apply')) {
    cap.table(statusTable, 0)
    return
  }
  if (!strFlag(flags, 'details').trim()) throw new ExecError('missing --details')
  normalizeDate(strFlag(flags, 'from-date'), '--from-date')
  normalizeTime(strFlag(flags, 'from-time'), '--from-time')
  normalizeDate(strFlag(flags, 'to-date'), '--to-date')
  normalizeTime(strFlag(flags, 'to-time'), '--to-time')
  if (password === 'pending') {
    cap.println('A nightslip request is already pending approval. Clear it before applying for another one.')
    throw new ExecError('nightslip request already pending')
  }
  const fields = [
    ['cost-centre-id', 'costCentreId', [['CC1', 'Hostel Office'], ['CC2', 'Academic Block']]],
    ['applied-to', 'appliedTo', [['W100', 'Warden A'], ['W200', 'Warden B']]],
    ['room-type-id', 'roomTypeId', [['RT1', 'Lab']]],
    ['event-id', 'lateHourEventId', [['EV1', 'Hackathon'], ['EV2', 'Club Meeting']]],
  ]
  for (const [flag, field, options] of fields) {
    if (strFlag(flags, flag).trim()) continue
    if (options.length === 1) continue
    throw new ExecError(`missing --${flag}; available ${field} values: ${fmtOptions(options)}`)
  }
  cap.println('Nightslip request submitted successfully.')
  cap.table(statusTable, 0)
}

const SIMPLE = {
  profile: cap => cap.table([['FIELD', 'INFORMATION'], ['Name', 'Test Student'], ['Register Number', '21BCE0001'], ['Programme', 'B.Tech CSE']], 0),
  attendance: cap =>
    cap.table([['SUBJECT', 'TYPE', 'FACULTY', 'CLASSES', 'PERCENTAGE', '75% ALERT'], ['CSE1001 - Problem Solving', 'ETH', 'Anuj Kumar', '30/40', '75%', 'Can skip 0'], ['MAT1011 - Calculus', 'TH', 'Ravi', '20/22', '91%', 'Can skip 4']], 0),
  marks: cap => cap.table([['COURSE', 'TITLE', 'MAX', 'SCORED'], ['CSE1001', 'CAT1', '50', '42']], 0),
  grades: cap => cap.table([['COURSE', 'GRADE'], ['CSE1001', 'A']], 0),
  timetable: cap => cap.table([['DAY', 'SLOT', 'COURSE', 'VENUE'], ['MON', 'A1', 'CSE1001', 'SJT401']], 0),
  cgpa: cap => cap.table([['CREDITS', 'CGPA'], ['80', '8.91']], 0),
  hostel: cap => cap.table([['FIELD', 'INFORMATION'], ['Block', 'A'], ['Room', '101']], 0),
  receipts: cap => cap.table([['RECEIPT', 'DATE', 'AMOUNT'], ['R1', '01-07-2025', '100000']], 0),
  'library-dues': cap => cap.println('No library dues.'),
  msg: cap => cap.table([['COURSE', 'MESSAGE'], ['CSE1001', 'Quiz on Monday']], 0),
  exams: cap => {
    cap.println('MID-TERM EXAMS')
    cap.table([['COURSE', 'DATE', 'VENUE'], ['CSE1001', '10-Oct-2025', 'SJT 101']], 0)
    const dir = downloadsDir('Other Downloads', 'ICS File')
    fs.writeFileSync(path.join(dir, 'CLI-TOP_Exams.ics'), 'BEGIN:VCALENDAR\nEND:VCALENDAR\n')
    cap.println('ICS file generated and saved successfully.')
  },
  holiday: cap => cap.table([['DATE', 'DAY', 'OCCASION', 'IN'], ['25-12-2025', 'Thu', 'Christmas', 'in 53 days']], 0),
  today: cap => cap.table([['TIME', 'COURSE', 'VENUE', 'ATTENDANCE', 'SKIP?'], ['08:00', 'CSE1001', 'SJT401', '75%', 'No']], 0),
  tomorrow: cap => cap.table([['TIME', 'COURSE', 'VENUE', 'ATTENDANCE', 'SKIP?'], ['09:00', 'MAT1011', 'SJT502', '91%', 'Yes']], 0),
  dayafter: cap => cap.println('No classes on Tuesday 04 Nov (holiday).'),
  events: cap => cap.table([['In', 'When', 'Title', 'Club', 'Where', 'Status'], ['2d', '04 Nov 10:00', 'HackVIT', 'ACM', 'SJT', 'Open']], 0),
}

function calendar(cap, flags) {
  const sem = selectSemester(cap, flags)
  if (!sem) return
  const groups = [['CLASS GROUP'], ['General Semester', 'ALL'], ['Weekend Semester', 'WEEKEND']]
  const index = tableSelector(cap, 'class group', groups, String(intFlag(flags, 'classGroup')))
  if (!index) {
    cap.println('Selection canceled')
    return
  }
  cap.table([['MON', 'TUE', 'WED'], ['1', '2', '3']], 0)
}

const SEMESTER_COMMANDS = new Set(['marks', 'grades', 'attendance', 'timetable', 'exams', 'holiday', 'today', 'tomorrow', 'dayafter'])

function dispatch(cap, command, flags, password) {
  if (SEMESTER_COMMANDS.has(command) && intFlag(flags, 'semester') > 0) {
    if (!selectSemester(cap, flags)) return
  }
  switch (command) {
    case 'course-page':
      return coursePage(cap, flags, false)
    case 'course-page-archive':
      return coursePage(cap, flags, true)
    case 'syllabus':
      return syllabus(cap, flags)
    case 'da':
      return da(cap, flags)
    case 'facility':
      return facility(cap, flags)
    case 'course-allocation':
      return courseAllocation(cap, flags)
    case 'leave':
      return leave(cap, flags, password)
    case 'nightslip':
      return nightslip(cap, flags, password)
    case 'calendar':
      return calendar(cap, flags)
    default:
      if (SIMPLE[command]) return SIMPLE[command](cap, flags)
      throw new ExecError(`unsupported proxy command: ${command}`)
  }
}

function runOne(command, flags, password) {
  const cap = new Capture()
  let execErr = null
  try {
    dispatch(cap, command, flags, password)
  } catch (error) {
    if (!(error instanceof ExecError)) throw error
    execErr = error
  }
  const messages = cap.lines.map(l => l.trim()).filter(Boolean)
  const structured = {}
  if (cap.tables.length) structured.tables = cap.tables
  if (cap.selections.length) structured.selection_requests = cap.selections
  if (messages.length) structured.messages = messages
  let error
  if (cap.selections.length) {
    const first = cap.selections[0]
    error = { kind: 'selection_required', message: first.message || `selection required for ${first.subject}` }
  } else if (execErr) {
    error = { kind: 'execution_error', message: execErr.message }
  }
  return {
    output: messages.join('\n'),
    structured: Object.keys(structured).length ? structured : null,
    error,
  }
}

// ---------------------------------------------------------------- main
async function main() {
  const argv = process.argv.slice(2)
  const env = process.env
  if (env.FAKE_CLI_LOG) {
    let configUuid = null
    try {
      const cfg = fs.readFileSync(path.join(process.cwd(), 'cli-top-config.env'), 'utf8')
      configUuid = (cfg.match(/^UUID=(.*)$/m) || [])[1] || null
    } catch {}
    fs.appendFileSync(
      env.FAKE_CLI_LOG,
      JSON.stringify({ argv, envKeys: Object.keys(env).sort(), cwd: process.cwd(), home: os.homedir(), configUuid, pid: process.pid, at: Date.now() }) + '\n'
    )
  }

  // Execute(): kill switch check (blocking HTTP GET, 5s timeout) before anything else.
  let killSwitch = 0
  if (env.CLI_TOP_LATEST_JSON_URL) {
    try {
      const res = await fetch(env.CLI_TOP_LATEST_JSON_URL, { signal: AbortSignal.timeout(5000) })
      const doc = await res.json()
      killSwitch = Number.isInteger(doc.killSwitch) ? doc.killSwitch : 4
    } catch {
      killSwitch = 4
    }
  } else if (env.FAKE_LATEST_JSON_MS) {
    await sleep(parseInt(env.FAKE_LATEST_JSON_MS, 10))
  }
  if (killSwitch === 2) {
    process.stdout.write('This version of cli-top has been decommissioned.\n')
    return
  }

  if (argv[0] !== 'proxy' || argv.length < 4) {
    process.stderr.write('Error: requires at least 3 arg(s)\n')
    process.exitCode = 1
    return
  }
  const username = (argv[1] || '').trim()
  const password = argv[2] || ''
  const command = (argv[3] || '').trim().toLowerCase()
  const flags = parseFlags(argv.slice(4))
  const resp = { success: false, command, version: VERSION, requested_at: new Date(started).toISOString() }
  if (flags) resp.flags = flags
  const preamble = []
  const print = () => {
    resp.completed_at = new Date().toISOString()
    if (resp.error) resp.success = false
    resp.duration_ms = Date.now() - started
    const ordered = {
      success: resp.success,
      command: resp.command,
      version: resp.version,
      requested_at: resp.requested_at,
      completed_at: resp.completed_at,
      duration_ms: resp.duration_ms,
      ...(resp.reg_no ? { reg_no: resp.reg_no } : {}),
      ...(resp.flags ? { flags: resp.flags } : {}),
      ...(resp.output ? { output: resp.output } : {}),
      ...(resp.structured_data ? { structured_data: resp.structured_data } : {}),
      ...(resp.error ? { error: resp.error } : {}),
    }
    process.stdout.write(preamble.join('') + JSON.stringify(ordered) + '\n')
  }

  if (password === 'crash') {
    process.stderr.write('panic: runtime error: invalid memory address or nil pointer dereference\n')
    process.exit(2)
  }
  if (password === 'garbage') {
    process.stdout.write('Unable to log in. something odd happened\n')
    return
  }
  if (!username || !password) {
    resp.error = { kind: 'auth_failed', message: 'missing VTOP credentials' }
    return print()
  }
  if (password === 'slow') await sleep(parseInt(env.FAKE_SLOW_MS || '5000', 10))
  if (env.FAKE_LOGIN_MS) await sleep(parseInt(env.FAKE_LOGIN_MS, 10))

  const authFailures = {
    wrong: ['\nInvalid LoginId/Password. Please check your cli-top config and try again...\n', 'failed to initialize VTOP session'],
    locked: ['\nNumber Of Maximum Fail Attempts Reached. Use Forgot Password on VTOP to reset your password.\n', 'failed to initialize VTOP session'],
    captcha: ['\nCaptcha could not be solved after multiple attempts. Please try again later.\n', 'failed to initialize VTOP session'],
    down: ['', 'failed to initialize VTOP session'],
    homefail: ['', 'invalid VTOP credentials'],
  }
  if (authFailures[password]) {
    preamble.push(authFailures[password][0])
    resp.error = { kind: 'auth_failed', message: authFailures[password][1] }
    return print()
  }
  resp.reg_no = username.toUpperCase()

  if (password.startsWith('flaky')) {
    const marker = path.join(env.FAKE_STATE_DIR || os.tmpdir(), `fake-cli-${password}.count`)
    let count = 0
    try {
      count = parseInt(fs.readFileSync(marker, 'utf8'), 10) || 0
    } catch {}
    fs.writeFileSync(marker, String(count + 1))
    if (count === 0) {
      resp.output = 'Error fetching data: Post "https://vtop.vit.ac.in/vtop/x": dial tcp: i/o timeout'
      resp.error = { kind: 'execution_error', message: 'Post "https://vtop.vit.ac.in/vtop/x": dial tcp: i/o timeout' }
      return print()
    }
  }

  if (command === 'sync') {
    const raw = (flags && flags.commands) || ''
    let commands = raw.split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
    if (!commands.length) commands = ['profile', 'timetable', 'attendance', 'marks', 'cgpa', 'exams']
    const sub = { ...(flags || {}) }
    delete sub.commands
    const results = commands.map(cmd => {
      const r = runOne(cmd, sub, password)
      const entry = { command: cmd, success: !r.error }
      if (r.output) entry.output = r.output
      if (r.structured) entry.structured_data = r.structured
      if (r.error) entry.error = r.error
      return entry
    })
    resp.structured_data = { results }
    resp.success = results.every(r => r.success)
    if (!resp.success) resp.error = { kind: 'partial_failure', message: 'one or more sync commands failed' }
    return print()
  }

  const result = runOne(command, flags, password)
  if (result.output) resp.output = result.output
  if (result.structured) resp.structured_data = result.structured
  resp.error = result.error
  resp.success = !resp.error
  print()
}

main().catch(error => {
  process.stderr.write(`fake cli-top crashed: ${error && error.stack}\n`)
  process.exit(3)
})
