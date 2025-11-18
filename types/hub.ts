import { z } from 'zod'
import type { RawVTOPResult } from '@/lib/hub/parsers/attendance'
import type { JsonValue } from '@/types/tools'

export type PersonalHubSnapshot = {
  command: string
  title: string
  summary: string
  formatted_content?: string
  structured_data?: JsonValue
  meta?: Record<string, JsonValue> | null
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

export type ProxySyncResultEntry = {
  command: string
  success: boolean
  result?: RawVTOPResult
  error?: string | { message: string; details?: JsonValue } | null
}

export type ProxySyncResponse = {
  results?: ProxySyncResultEntry[]
}

export const sendBriefingRequestSchema = z
  .object({
    userId: z.string().min(1).optional(),
    email: z.string().email().optional(),
    scheduledAt: z.string().optional(),
    referenceTime: z.string().optional(),
  })
  .refine(data => data.userId || data.email, {
    message: 'Provide either userId or email',
    path: ['userId'],
  })
export type SendBriefingRequest = z.infer<typeof sendBriefingRequestSchema>

export const dailyBriefingMessageSchema = z.object({
  id: z.string().min(1),
  primary: z.string().min(1),
  supporting: z.string().optional(),
  tone: z.enum(['neutral', 'alert', 'calm']).optional(),
})
export type DailyBriefingMessagePayload = z.infer<typeof dailyBriefingMessageSchema>

export const dailyBriefingActionSchema = z.object({
  label: z.string().min(1),
  command: z.enum(HUB_COMMANDS).optional(),
})
export type DailyBriefingActionPayload = z.infer<typeof dailyBriefingActionSchema>

export const dailyBriefingEmailSchema = z.object({
  messages: z.array(dailyBriefingMessageSchema).min(1),
  actions: z.array(dailyBriefingActionSchema).optional(),
  greeting: z.string().optional(),
  scheduledAt: z.string().optional(),
})
export type DailyBriefingEmailRequest = z.infer<typeof dailyBriefingEmailSchema>
