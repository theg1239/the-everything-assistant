/**
 * Schemas and a small client for the VTOP proxy (services/proxy-service).
 *
 * Client-safe: only zod + fetch. The proxy URL / API key are read from server env at call time,
 * so `callVtopProxy` must only be invoked server-side; components import the schemas and types.
 */
import * as z from 'zod'
import capabilityManifest from '@/hub-capabilities.json'
import type { JsonValue } from '@/types/tools'

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
)

/** Every command the proxy exposes (cli-top v2.12.1 parity + legacy aliases). */
export const VTOP_COMMANDS = [
  'profile',
  'marks',
  'grades',
  'attendance',
  'timetable',
  'today',
  'tomorrow',
  'dayafter',
  'holiday',
  'calendar',
  'receipts',
  'hostel',
  'cgpa',
  'exams',
  'exam-schedule',
  'library-dues',
  'nightslip',
  'leave',
  'leave-status',
  'msg',
  'class-message',
  'da',
  'facility',
  'events',
  'syllabus',
  'course-page',
  'course-page-archive',
  'course-allocation',
] as const
export type VtopCommand = (typeof VTOP_COMMANDS)[number]

export const VTOP_STATUSES = [
  'completed',
  'needs_selection',
  'needs_input',
  'needs_confirmation',
  'cancelled',
  'error',
] as const
export type VtopStatus = (typeof VTOP_STATUSES)[number]

export const vtopOptionSchema = z.object({
  id: z.string(),
  index: z.number().optional(),
  label: z.string(),
  description: z.string().optional(),
  values: z.record(z.string(), z.string()).optional(),
})
export type VtopOption = z.infer<typeof vtopOptionSchema>

/**
 * A pending workflow step. `options` is the full list VTOP offered; continue with option ids.
 * `cliQuery` echoes a search cli-top itself ran that did not identify a single option.
 */
export const vtopStepSchema = z.object({
  id: z.string(),
  kind: z.enum(['select', 'input', 'confirm']),
  label: z.string(),
  prompt: z.string().optional(),
  multiple: z.boolean().optional(),
  inputType: z.string().optional(),
  format: z.string().optional(),
  description: z.string().optional(),
  cliQuery: z.string().optional(),
  options: z.array(vtopOptionSchema).optional(),
  summary: z.record(z.string(), jsonValueSchema).optional(),
})
export type VtopStep = z.infer<typeof vtopStepSchema>

export const vtopFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string().optional(),
  size: z.number(),
  contentType: z.string().optional(),
  url: z.string(),
  expiresAt: z.string().optional(),
})
export type VtopFile = z.infer<typeof vtopFileSchema>

export const vtopBundleSchema = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number(),
  size: z.number(),
  url: z.string(),
  expiresAt: z.string().optional(),
})
export type VtopBundle = z.infer<typeof vtopBundleSchema>

export const vtopLinkSchema = z.object({ label: z.string(), url: z.string() })
export type VtopLink = z.infer<typeof vtopLinkSchema>

export const vtopProgressSchema = z.object({
  step: z.string(),
  label: z.string(),
  choice: z.string(),
  auto: z.boolean().optional(),
})
export type VtopProgress = z.infer<typeof vtopProgressSchema>

/** One proxy result (POST /vtop, /vtop/continue, MCP tool structuredContent). */
export const vtopProxyResultSchema = z
  .object({
    success: z.boolean(),
    status: z.enum(VTOP_STATUSES).optional(),
    command: z.string().nullish(),
    data: z.string().optional(),
    output: z.string().optional(),
    message: z.string().optional(),
    structured_data: jsonValueSchema.nullish(),
    messages: z.array(z.string()).optional(),
    links: z.array(vtopLinkSchema).optional(),
    files: z.array(vtopFileSchema).optional(),
    bundle: vtopBundleSchema.optional(),
    step: vtopStepSchema.optional(),
    continuation: z.string().optional(),
    progress: z.array(vtopProgressSchema).optional(),
    meta: jsonValueSchema.optional(),
    error: z.string().optional(),
    errorKind: z.string().optional(),
    retryable: z.boolean().optional(),
    requiresCredentials: z.boolean().optional(),
    field: z.string().optional(),
    /** On an `invalid_input` choice: the option ids that would have been accepted. */
    validIds: z.array(z.string()).optional(),
  })
  .loose()
export type VtopProxyResult = z.infer<typeof vtopProxyResultSchema>

/** Error bodies from the proxy (auth failures, validation errors, legacy shapes). */
export const vtopProxyErrorSchema = z
  .object({
    error: z.string().optional(),
    errorKind: z.string().optional(),
    message: z.string().optional(),
    retryable: z.boolean().optional(),
    requiresCredentials: z.boolean().optional(),
    field: z.string().optional(),
    validIds: z.array(z.string()).optional(),
  })
  .loose()

const manifestEntrySchema = z
  .object({ command: z.string(), params: z.array(z.string()).optional() })
  .loose()

/** Allowed flag names per command, from the shared hub-capabilities.json manifest. */
const PARAMS_BY_COMMAND: ReadonlyMap<string, readonly string[]> = new Map(
  z
    .array(manifestEntrySchema)
    .parse(capabilityManifest)
    .map(entry => [entry.command, entry.params ?? []])
)

export function vtopParamsFor(command: string): readonly string[] {
  return PARAMS_BY_COMMAND.get(command) ?? []
}

/**
 * Credentials sent to the proxy: plaintext `password` over the authenticated channel, or the
 * DEPRECATED legacy `encryptedPassword` (+ `sessionKey`, or `cipher:::key`) form.
 */
export type VtopCredentialFields = { username: string } & (
  | { password: string }
  | { encryptedPassword: string; sessionKey?: string }
)

/** POST /vtop: start a command with exact cli-top flags (option indices, dates, ids). */
export type VtopRunRequest = VtopCredentialFields & {
  command: VtopCommand
  flags?: Record<string, string | number | boolean>
  confirm?: boolean
  fresh?: boolean
}

/**
 * Answer to a pending step: option id(s) for select steps (an id, ids, or for `multiple` steps
 * the "1,3-5" id-range grammar / "all"), the raw value for input steps, a boolean to confirm.
 * The proxy rejects anything else with `invalid_input` + `validIds`.
 */
export type VtopChoice = string | number | boolean | Array<string | number>

/** POST /vtop/continue */
export type VtopContinueRequest = VtopCredentialFields & {
  continuation: string
  choice: VtopChoice
}

/** Failure of the HTTP call itself (network / non-JSON). Proxy-reported errors are results. */
export class VtopProxyUnavailableError extends Error {
  override name = 'VtopProxyUnavailableError'
}

function proxyBaseUrl() {
  return (process.env.VTOP_PROXY_URL || 'http://localhost:3001').replace(/\/+$/, '')
}

function proxyHeaders(): Record<string, string> {
  const key = process.env.VTOP_PROXY_API_KEY || process.env.PROXY_API_KEY
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  }
}

/**
 * POSTs to the proxy and validates the body. HTTP error statuses still carry a result body
 * (`success: false`, `errorKind`, ...), which is returned rather than thrown.
 */
export async function callVtopProxy(
  path: '/vtop' | '/vtop/continue',
  body: VtopRunRequest | VtopContinueRequest,
  { timeoutMs = 330_000 }: { timeoutMs?: number } = {}
): Promise<VtopProxyResult> {
  let response: Response
  try {
    response = await fetch(`${proxyBaseUrl()}${path}`, {
      method: 'POST',
      headers: proxyHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new VtopProxyUnavailableError(
      error instanceof Error ? error.message : 'VTOP proxy request failed'
    )
  }
  const payload: unknown = await response.json().catch(() => null)
  const parsed = vtopProxyResultSchema.safeParse(payload)
  if (parsed.success) return parsed.data
  const errorBody = vtopProxyErrorSchema.safeParse(payload)
  const detail = errorBody.success ? errorBody.data : {}
  return {
    success: false,
    status: 'error',
    error: detail.error || detail.message || `VTOP proxy responded with HTTP ${response.status}`,
    errorKind: detail.errorKind || (response.ok ? 'protocol_error' : `http_${response.status}`),
    retryable: detail.retryable ?? response.status >= 500,
    requiresCredentials: detail.requiresCredentials ?? response.status === 401,
    ...(detail.field ? { field: detail.field } : {}),
    ...(detail.validIds ? { validIds: detail.validIds } : {}),
  }
}

export const isPendingVtopStatus = (status: VtopStatus | undefined) =>
  status === 'needs_selection' || status === 'needs_input' || status === 'needs_confirmation'

export const formatBytes = (size: number) =>
  size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB`
    : size >= 1024
      ? `${Math.round(size / 1024)} KB`
      : `${size} B`
