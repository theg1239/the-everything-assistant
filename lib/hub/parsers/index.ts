import type { HubVTOPCommand } from '@/types/hub'
import { parseAttendance, type ParsedHubResult, type RawVTOPResult } from './attendance'
import { parseTimetable } from './timetable'
import { parseAssignments } from './assignments'
import { parseLeave } from './leave'
import { parseExams } from './exams'
import { parseMarks } from './marks'
import { parseGrades } from './grades'
import { parseLibraryDues } from './library-dues'
import { parseProfile } from './profile'
import { parseHostel } from './hostel'

const PARSERS: Partial<Record<HubVTOPCommand, (result: RawVTOPResult) => ParsedHubResult | null>> = {
  attendance: parseAttendance,
  timetable: parseTimetable,
  da: parseAssignments,
  leave: parseLeave,
  'leave-status': parseLeave,
  exams: parseExams,
  'exam-schedule': parseExams,
  marks: parseMarks,
  grades: parseGrades,
  'library-dues': parseLibraryDues,
  profile: parseProfile,
  hostel: parseHostel,
}

export function parseHubCommandResult(command: HubVTOPCommand, payload: RawVTOPResult) {
  const parser = PARSERS[command]
  if (!parser) return null
  try {
    return parser(payload)
  } catch (error) {
    console.error(`[hub-parser] failed to parse ${command}:`, error)
    return null
  }
}
