export type PersonalHubSnapshot = {
  command: string
  title: string
  summary: string
  formatted_content?: string
  structured_data?: any
  meta?: Record<string, any> | null
  fetchedAt: string
}

export type PersonalHubState = {
  isLinked: boolean
  lastSyncedAt?: string | null
  snapshots: PersonalHubSnapshot[]
}

export type HubVTOPCommand =
  | 'profile'
  | 'marks'
  | 'grades'
  | 'attendance'
  | 'timetable'
  | 'receipts'
  | 'hostel'
  | 'cgpa'
  | 'exams'
  | 'exam-schedule'
  | 'calendar'
  | 'library-dues'
  | 'nightslip'
  | 'leave'
  | 'leave-status'
  | 'msg'
  | 'class-message'
  | 'da'
  | 'facility'
  | 'syllabus'
  | 'course-page'
  | 'sync'

export const HUB_COMMANDS = [
  'profile',
  'marks',
  'grades',
  'attendance',
  'timetable',
  'receipts',
  'hostel',
  'cgpa',
  'exams',
  'exam-schedule',
  'calendar',
  'library-dues',
  'nightslip',
  'leave',
  'leave-status',
  'msg',
  'class-message',
  'da',
  'facility',
  'syllabus',
  'course-page',
  'sync',
] as const satisfies HubVTOPCommand[]

export type VTOPCredentialPayload = {
  username: string
  encryptedPassword: string
}
