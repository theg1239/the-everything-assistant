/**
 * queryVTOP tool input schema and the pure mapping between tool input, proxy request and tool
 * output. Kept free of server-only imports so it can be unit-tested and shared.
 *
 * Nothing here interprets text: flags are exact cli-top values (option indices, the materials
 * index grammar, dates, ids) and continuation choices are option ids the proxy validates.
 */
import * as z from 'zod'
import {
  VTOP_COMMANDS,
  isPendingVtopStatus,
  vtopParamsFor,
  type VtopProxyResult,
} from './vtop-proxy'

const vtopApplicationSchema = z.object({
  leaveCode: z
    .string()
    .optional()
    .describe(
      'leave: type code or label - HT1 (HOME TOWN), EY1 (EMERGENCY LEAVE), LG1 (LOCAL GUARDIAN), WP (WITH PARENT LEAVE), WV (WINTER VACATION), SV (SUMMER VACATION), EP (OFFICIAL LEAVES)'
    ),
  visitingPlace: z.string().optional().describe('leave: place being visited'),
  reason: z.string().optional().describe('leave: reason'),
  details: z.string().optional().describe('nightslip: what the late stay is for'),
  fromDate: z.string().optional().describe('leave/nightslip: start date YYYY-MM-DD'),
  fromTime: z.string().optional().describe('leave/nightslip: start time HH:MM (24h)'),
  toDate: z.string().optional().describe('leave/nightslip: end date YYYY-MM-DD'),
  toTime: z.string().optional().describe('leave/nightslip: end time HH:MM (24h)'),
  costCentreId: z
    .string()
    .optional()
    .describe('nightslip: cost centre id (offered by a needs_input step)'),
  appliedTo: z
    .string()
    .optional()
    .describe('nightslip: approver id (offered by a needs_input step)'),
  roomTypeId: z.string().optional().describe('nightslip: room type id'),
  buildingId: z.string().optional().describe('nightslip: building id'),
  venue: z.string().optional().describe('nightslip: venue'),
  eventId: z.string().optional().describe('nightslip: late-hour event id'),
})

const vtopOptionIndex = z.number().int().positive()

/** `--materials` grammar: option indices / ranges ("1,3-5"), or "0" / "all" for everything. */
export const VTOP_MATERIALS_GRAMMAR = /^(all|0|\d+(-\d+)?(,\d+(-\d+)?)*)$/

export const queryVTOPInputSchema = z.object({
  command: z
    .enum(VTOP_COMMANDS)
    .describe(
      'profile; marks/grades/attendance/timetable/exams (exam-schedule) - optional semester; today/tomorrow/dayafter (classes + whether attendance allows skipping); holiday; calendar (asks class group); cgpa; receipts; hostel; library-dues; msg (class-message, announcements); events (campus events, view only); leave (leave-status) and nightslip (status, or apply=true to submit); da (digital assignments: subject -> assignment, downloads the question paper); facility (sports/hostel facility registration); syllabus (download a course syllabus PDF); course-page (download course materials: semester -> course -> faculty -> materials); course-page-archive (same, legacy course page); course-allocation (faculty/slots offered for a curriculum course). When continuing a workflow, repeat the command of the call that returned the continuation.'
    ),
  continuation: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Continue a pending workflow: the `continuation` token from the previous queryVTOP result (status needs_selection / needs_input / needs_confirmation). Send it with `choice` and the same `command`, and no other parameters.'
    ),
  choice: z
    .union([z.string(), z.number().int(), z.boolean(), z.array(z.string())])
    .optional()
    .describe(
      'Answer to the pending step (with `continuation`). needs_selection: one `step.options[].id` (e.g. "3"); when step.multiple, an array of ids (["1","4"]), an id range ("1,3-5") or "all". needs_input: the raw value (or one of step.options[].id when options are listed). needs_confirmation: true to submit, false to cancel. Anything else is rejected with errorKind "invalid_input" and `validIds`.'
    ),
  semester: z
    .union([vtopOptionIndex, z.literal('list')])
    .optional()
    .describe(
      'Semester option index as VTOP lists it (1 = oldest). Omit for the latest semester; "list" returns every semester as a needs_selection step to pick from (e.g. for "last semester").'
    ),
  classGroup: vtopOptionIndex
    .optional()
    .describe('Class group option index (calendar/today/tomorrow/holiday).'),
  course: vtopOptionIndex
    .optional()
    .describe(
      'Course option index, only if already known from a step in this workflow; otherwise omit and pick from the needs_selection step.'
    ),
  faculty: vtopOptionIndex
    .optional()
    .describe('Faculty option index (course-page), same rule as `course`.'),
  materials: z
    .string()
    .regex(
      VTOP_MATERIALS_GRAMMAR,
      'materials must be option indices/ranges like "1,3-5", "0" or "all"'
    )
    .optional()
    .describe(
      'course-page materials: option indices/ranges like "1,3-5", or "all". Usually chosen via the materials step instead.'
    ),
  assignment: vtopOptionIndex
    .optional()
    .describe('da: assignment option index, same rule as `course`.'),
  facility: vtopOptionIndex
    .optional()
    .describe('facility: facility option index, same rule as `course`.'),
  category: vtopOptionIndex
    .optional()
    .describe('course-allocation: curriculum category option index, same rule as `course`.'),
  apply: z
    .boolean()
    .optional()
    .describe('leave/nightslip: submit a NEW application (fill `application`).'),
  application: vtopApplicationSchema
    .optional()
    .describe('Fields for leave/nightslip applications.'),
  fresh: z.boolean().optional().describe('Bypass the short-lived cache (user asked to refresh).'),
  username: z
    .string()
    .optional()
    .describe('Internal. Leave unset: the linked VTOP account is used.'),
  password: z
    .string()
    .optional()
    .describe('Internal. Never ask for or pass a password; leave unset.'),
  encryptedPassword: z.string().optional().describe('Internal legacy field. Leave unset.'),
  sessionKey: z.string().optional().describe('Internal legacy field. Leave unset.'),
})
export type QueryVTOPInput = z.infer<typeof queryVTOPInputSchema>

/**
 * Exact cli-top flags for a new run, keeping only params the command accepts (the rest are
 * reported back as `ignoredFlags`). Values are passed through unchanged; nothing is matched.
 */
export function buildVtopFlags(input: QueryVTOPInput) {
  const allowed = new Set(vtopParamsFor(input.command))
  const flags: Record<string, string | number | boolean> = {}
  const ignored: string[] = []
  const put = (name: string, value: string | number | boolean | undefined) => {
    if (value === undefined || value === '') return
    if (allowed.has(name)) flags[name] = value
    else ignored.push(name)
  }

  put('semester', input.semester)
  put('classGroup', input.classGroup)
  put('course', input.course)
  put('faculty', input.faculty)
  put('materials', input.materials)
  put('assignment', input.assignment)
  put('facility', input.facility)
  put('category', input.category)
  if (input.apply) put('apply', true)
  for (const [name, value] of Object.entries(input.application ?? {})) put(name, value)

  return { flags, ignored: [...new Set(ignored)] }
}

const VTOP_NEXT_ACTION: Record<string, string> = {
  needs_selection:
    'Pick from step.options by id: call queryVTOP with the same command, this continuation and choice = the option id (step.multiple: array of ids, "1,3-5" or "all").',
  needs_input:
    'Call queryVTOP with the same command, this continuation and choice = the value (one of step.options[].id when options are listed).',
  needs_confirmation:
    'Show step.summary; once the user explicitly agrees, call queryVTOP with the same command, this continuation and choice = true (false cancels).',
}

/** Proxy result -> queryVTOP tool output (keeps the legacy fields existing renderers read). */
export function toQueryVTOPResult(
  command: string,
  result: VtopProxyResult,
  ignored: string[] = []
) {
  const status = result.status ?? (result.success ? 'completed' : 'error')
  const pending = isPendingVtopStatus(status)
  const files = result.files ?? []
  return {
    success: result.success,
    command: result.command || command,
    status,
    message: result.message || result.error || `VTOP ${command} ${status}`,
    data: pending
      ? (result.step?.prompt ?? result.message ?? '')
      : (result.data ?? result.output ?? ''),
    structured_data: pending ? null : (result.structured_data ?? null),
    raw: false,
    meta: result.meta ?? null,
    ...(result.step ? { step: result.step } : {}),
    ...(result.continuation ? { continuation: result.continuation } : {}),
    ...(result.progress?.length ? { progress: result.progress } : {}),
    ...(files.length
      ? {
          files,
          downloadInfo: {
            filesDownloaded: files.length,
            totalFiles: files.length,
            servedFiles: files.map(file => ({
              name: file.name,
              size: file.size,
              downloadUrl: file.url,
              expiry: file.expiresAt,
            })),
          },
        }
      : {}),
    ...(result.bundle ? { bundle: result.bundle } : {}),
    ...(result.links?.length ? { links: result.links } : {}),
    ...(pending ? { type: 'vtop-workflow', nextAction: VTOP_NEXT_ACTION[status] } : {}),
    ...(result.success
      ? {}
      : {
          error: result.error || 'VTOP request failed',
          errorKind: result.errorKind,
          retryable: result.retryable ?? false,
          requiresCredentials: result.requiresCredentials ?? false,
          ...(result.field ? { field: result.field } : {}),
          ...(result.validIds?.length ? { validIds: result.validIds } : {}),
        }),
    ...(ignored.length ? { ignoredFlags: ignored } : {}),
  }
}

/** Window event the workflow card dispatches; the chat interface answers it with a direct call. */
export const VTOP_WORKFLOW_CHOICE_EVENT = 'vtopWorkflowChoice'

/**
 * A choice made in the workflow card: continue `continuation` with `choice` (option id(s),
 * input value, or confirm boolean). `display` is the user-visible message recorded in the chat.
 */
export const vtopWorkflowChoiceSchema = z.object({
  command: z.enum(VTOP_COMMANDS),
  continuation: z.string().min(1),
  choice: z.union([z.string(), z.number().int(), z.boolean(), z.array(z.string())]),
  display: z.string().min(1),
})
export type VtopWorkflowChoice = z.infer<typeof vtopWorkflowChoiceSchema>
