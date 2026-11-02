'use server'

import { generateText, Output, type LanguageModelUsage } from 'ai'
import * as z from 'zod'
import { auth } from '@/lib/auth'
import { createVITTools } from '@/lib/tools'
import {
  getUserVTOPCredentials,
  getUserVTOPCredentialStatus,
} from '@/lib/server-vtop-credentials'
import type { VTOPCredentials } from '@/lib/vtop-credential-store'
import { mapWithConcurrency } from '@/lib/concurrency'
import { getHubCapability } from '@/lib/hub/capabilities'
import { vtopResultSchema, type VTOPFormattedResult } from '@/app/api/hub/vtop/schema'
import {
  getToolExecutor,
  HUB_DIRECT_TOOLS,
  RATE_LIMITED_DIRECT_TOOLS,
} from '@/app/api/chat/lib/tool-helpers'
import { parseHubCommandResult } from '@/lib/hub/parsers'
import type { RawVTOPResult } from '@/lib/hub/parsers/attendance'
import { defaultProviderOptions, languageModel } from '@/lib/ai'
import { enforceUserRateLimit } from '@/lib/user-rate-limiter'
import { saveTokenUsage } from '@/lib/db'
import { normalizeTokenUsage } from '@/lib/token-usage'
import { listVTOPSnapshots, upsertVTOPSnapshot } from '@/lib/vtop-snapshots'
import { toJsonValue } from '@/lib/json'
import { getModelConfig } from '@/lib/model-registry'
import {
  HUB_COMMANDS,
  type HubSyncBatchResult,
  type HubVTOPCommand,
  type PersonalHubState,
  type PersonalHubSnapshot,
  type VTOPCredentialPayload,
} from '@/types/hub'

/** Lenient read of a VTOP tool/proxy payload: wrong-typed fields become undefined. */
const rawVTOPResultSchema = z
  .object({
    success: z.boolean().optional().catch(undefined),
    command: z.string().optional().catch(undefined),
    data: z.unknown(),
    output: z.string().optional().catch(undefined),
    raw: z.boolean().optional().catch(undefined),
    message: z.string().optional().catch(undefined),
    structured_data: z.unknown(),
    meta: z.unknown(),
  })
  .loose()

const toRawVTOPResult = (value: unknown): RawVTOPResult | null => {
  const parsed = rawVTOPResultSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** `POST {VTOP_PROXY_URL}/sync` response; malformed entries are dropped. */
const proxySyncEntrySchema = z.object({
  command: z.string(),
  success: z.boolean(),
  result: z.unknown(),
  error: z.unknown(),
  errorKind: z.string().optional().catch(undefined),
})

/** Proxy error kinds that mean the stored VTOP login is missing or was rejected. */
const CREDENTIAL_ERROR_KINDS = new Set(['missing_credentials', 'invalid_credentials', 'login_failed'])

const parseProxySyncResults = (value: unknown) => {
  const results =
    typeof value === 'object' && value !== null && 'results' in value ? value.results : undefined
  if (!Array.isArray(results)) return []
  return results.flatMap(entry => {
    const parsed = proxySyncEntrySchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

/** Snapshot rows store a `VTOPFormattedResult`; tolerate partial/legacy rows. */
const storedSnapshotSchema = vtopResultSchema.partial()

const isHubVTOPCommand = (
  command: string,
  commands: readonly HubVTOPCommand[]
): command is HubVTOPCommand => commands.some(candidate => candidate === command)

const HUB_CORE_COMMANDS: HubVTOPCommand[] = [
  'profile',
  'timetable',
  'attendance',
  'marks',
  'cgpa',
  'exams',
  'da',
]

/**
 * Snapshot formatting/persisting (and the per-command fallback refresh, each a VTOP proxy call
 * plus possibly an LLM call) run in parallel, capped so a long client-supplied command list
 * can't fan out unbounded proxy/model calls or exhaust the DB pool.
 */
const HUB_SYNC_CONCURRENCY = 4

const vtopProxyBaseUrl = () =>
  (process.env.VTOP_PROXY_URL || 'http://localhost:3001').replace(/\/+$/, '')

/**
 * Headers for direct VTOP proxy calls: the proxy requires `Authorization: Bearer <key>`. Same
 * env vars as `callVtopProxy` in lib/vtop-proxy.ts (whose header helper isn't exported).
 * Throws in production when the key is missing, instead of sending a request the proxy rejects.
 */
function vtopProxyHeaders(): Record<string, string> {
  const key = process.env.VTOP_PROXY_API_KEY || process.env.PROXY_API_KEY
  if (!key && process.env.NODE_ENV === 'production') {
    throw new Error('VTOP_PROXY_API_KEY is not configured: the VTOP proxy requires it')
  }
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  }
}

async function requireUser() {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }
  return session.user.id
}

async function buildHubState(userId: string): Promise<PersonalHubState> {
  // Status by user id: the caller already ran auth(), which isn't memoised in server actions.
  const [{ linked }, rows] = await Promise.all([
    getUserVTOPCredentialStatus(userId),
    listVTOPSnapshots(userId),
  ])
  const snapshots: PersonalHubSnapshot[] = rows.map(row => {
    const parsed = storedSnapshotSchema.safeParse(row.data)
    const data = parsed.success ? parsed.data : null
    return {
      command: row.command,
      title: data?.title || row.command,
      summary: data?.summary || 'no summary available',
      formatted_content: data?.formatted_content,
      structured_data: toJsonValue(data?.structured_data),
      meta: data?.meta || null,
      fetchedAt: row.fetchedAt.toISOString(),
    }
  })
  const lastSyncedAt = rows.reduce<Date | null>(
    (latest, row) => (!latest || row.fetchedAt > latest ? row.fetchedAt : latest),
    null
  )
  return {
    isLinked: linked,
    lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
    snapshots,
  }
}

/** The user's server-stored VTOP credentials (plaintext password, sent to the proxy as-is). */
async function resolveVTOPCredentials(userId: string): Promise<VTOPCredentials> {
  const credentials = await getUserVTOPCredentials(userId)
  if (!credentials) {
    throw new Error('VTOP credentials are not linked')
  }
  return credentials
}

async function formatAndPersistVTOPResult(
  userId: string,
  command: HubVTOPCommand,
  raw: unknown
): Promise<VTOPFormattedResult> {
  const rawResult = toRawVTOPResult(raw)
  let object: VTOPFormattedResult | null = rawResult
    ? parseHubCommandResult(command, rawResult)
    : null
  let usage: LanguageModelUsage | null = null
  let modelConfig: ReturnType<typeof getModelConfig> | null = null

  if (!object) {
    const prompt = [
      'You format VTOP portal JSON into a structured digest for the personalized hub.',
      `Command: ${command}`,
      'Return valid JSON that matches the provided schema. Preserve all critical data points.',
      'Raw JSON:',
      JSON.stringify(raw || {}, null, 2),
    ].join('\n')

    modelConfig = getModelConfig('hubVtop')

    await enforceUserRateLimit(userId)
    const response = await generateText({
      model: languageModel('hubVtop'),
      providerOptions: defaultProviderOptions,
      output: Output.object({ schema: vtopResultSchema }),
      prompt,
    })

    object = response.output
    usage = response.usage

    if (!object) {
      throw new Error('Failed to format VTOP response')
    }
  }

  // Independent rows (snapshot, usage log): written together, one round trip instead of two.
  const usageTotals = usage ? normalizeTokenUsage(usage) : null
  await Promise.all([
    upsertVTOPSnapshot(userId, command, object),
    usageTotals
      ? saveTokenUsage({
          userId,
          chatId: null,
          model: modelConfig?.modelId ?? getModelConfig('hubVtop').modelId,
          stepIndex: null,
          inputTokens: usageTotals.inputTokens,
          outputTokens: usageTotals.outputTokens,
          totalTokens: usageTotals.totalTokens,
          meta: { type: 'hub-vtop', command },
        })
      : undefined,
  ])

  return object
}

async function executeVTOPCommand(
  userId: string,
  command: HubVTOPCommand,
  extras: Record<string, unknown> = {},
  credentials?: VTOPCredentials
): Promise<VTOPFormattedResult> {
  const executeVtop = getToolExecutor(createVITTools(userId), 'queryVTOP')
  if (!executeVtop) {
    throw new Error('VTOP tool is unavailable')
  }

  const creds = credentials ?? (await resolveVTOPCredentials(userId))

  const args: Record<string, unknown> = {
    command,
    ...extras,
    username: creds.username,
    password: creds.password,
  }

  const raw = await executeVtop(args, `vtop-${Date.now()}`)
  return formatAndPersistVTOPResult(userId, command, raw)
}

/**
 * `_legacyCredentials` (browser-held, deprecated `encryptedPassword` form) is accepted for
 * signature compatibility with existing clients but ignored: the proxy is always called with
 * the user's server-stored credentials (legacy cookies are migrated server-side).
 */
export async function refreshVTOPSnapshotAction(
  command: HubVTOPCommand,
  extras: Record<string, unknown> = {},
  _legacyCredentials?: VTOPCredentialPayload
): Promise<PersonalHubSnapshot> {
  const userId = await requireUser()
  const snapshot = await executeVTOPCommand(userId, command, extras)
  return {
    command,
    title: snapshot.title,
    summary: snapshot.summary,
    formatted_content: snapshot.formatted_content,
    structured_data: toJsonValue(snapshot.structured_data),
    meta: snapshot.meta || null,
    fetchedAt: new Date().toISOString(),
  }
}

async function runProxySyncBatch(
  commands: HubVTOPCommand[],
  creds: VTOPCredentials,
  headers: Record<string, string>
) {
  const response = await fetch(`${vtopProxyBaseUrl()}/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: creds.username, password: creds.password, commands }),
  })

  if (!response.ok) {
    throw new Error(`proxy sync failed: ${response.status}`)
  }

  const payload: unknown = await response.json()
  return parseProxySyncResults(payload)
}

export async function syncCoreHubSnapshots(requested: HubVTOPCommand[] = [...HUB_CORE_COMMANDS]) {
  const userId = await requireUser()
  // Server actions receive client-controlled input: keep only known, batch-syncable commands.
  const commands = [...new Set(requested)].filter(isBatchSyncCommand)
  // Fails here (not in the fallback below) when the proxy key is missing in production.
  const proxyHeaders = vtopProxyHeaders()
  const creds = await resolveVTOPCredentials(userId)

  let updatedCount = 0

  try {
    const entries = await runProxySyncBatch(commands, creds, proxyHeaders)
    console.log('[hub/actions] sync batch returned', entries.length, 'entries')

    // Each entry formats (maybe an LLM call) and upserts its own snapshot row: independent.
    await mapWithConcurrency(entries, HUB_SYNC_CONCURRENCY, async entry => {
      const command = entry.command
      if (!isHubVTOPCommand(command, commands)) return
      if (!entry.success || !entry.result) {
        console.error('[hub/actions] sync skipped', command, entry.error || 'unknown error')
        return
      }
      try {
        await formatAndPersistVTOPResult(userId, command, entry.result)
        updatedCount++
        console.log('[hub/actions] persisted sync result for', command)
      } catch (error) {
        console.error('[hub/actions] failed to store sync result', command, error)
      }
    })

    if (updatedCount === 0 && entries.length === 0) {
      console.log('[hub/actions] no batch results, falling back to sequential refresh')
      throw new Error('Empty batch results')
    }
  } catch (error) {
    console.error('[hub/actions] batch sync failed, falling back to sequential refresh:', error)
    await mapWithConcurrency(commands, HUB_SYNC_CONCURRENCY, async command => {
      try {
        await executeVTOPCommand(userId, command, {}, creds)
        updatedCount++
      } catch (fallbackError) {
        console.error('[hub/actions] fallback refresh failed', command, fallbackError)
      }
    })
  }

  console.log('[hub/actions] sync complete, updated', updatedCount, 'snapshots')
  return buildHubState(userId)
}

/**
 * Commands the proxy's `/sync` accepts (`sync: true` in hub-capabilities.json). `/sync` rejects
 * the whole request if any command isn't batch-syncable, so filter before sending.
 */
const isBatchSyncCommand = (value: string): value is HubVTOPCommand => {
  const command = HUB_COMMANDS.find(candidate => candidate === value)
  return command !== undefined && getHubCapability(command)?.sync === true
}

const proxyErrorSchema = z
  .object({
    error: z.string().optional().catch(undefined),
    errorKind: z.string().optional().catch(undefined),
    requiresCredentials: z.boolean().optional().catch(undefined),
  })
  .loose()

/**
 * Refreshes several hub snapshots with ONE proxy `/sync` call (one VTOP login), instead of
 * the client calling `refreshVTOPSnapshotAction` per command — server actions from one client
 * run one at a time, so that was up to N sequential round trips. Never throws for VTOP-side
 * failures: credential problems come back as `requiresCredentials` so the UI can prompt a
 * re-link, other per-command failures as `failed`.
 */
export async function syncHubSnapshotsBatch(requested: readonly string[]): Promise<HubSyncBatchResult> {
  const userId = await requireUser()
  const commands = [...new Set(requested)].filter(isBatchSyncCommand)
  const result = (partial: Omit<HubSyncBatchResult, 'state'>) =>
    buildHubState(userId).then(state => ({ state, ...partial }))

  if (!commands.length) return result({ updated: [], failed: [], requiresCredentials: false })

  // Fails here (clear server error) when the proxy key is missing in production.
  const proxyHeaders = vtopProxyHeaders()
  const creds = await getUserVTOPCredentials(userId)
  if (!creds) return result({ updated: [], failed: [], requiresCredentials: true })

  let response: Response
  try {
    response = await fetch(`${vtopProxyBaseUrl()}/sync`, {
      method: 'POST',
      headers: proxyHeaders,
      body: JSON.stringify({ username: creds.username, password: creds.password, commands }),
    })
  } catch (error) {
    console.error('[hub/actions] batch sync request failed', error)
    const failed = commands.map(command => ({ command, error: 'VTOP proxy unreachable' }))
    return result({ updated: [], failed, requiresCredentials: false })
  }
  const payload: unknown = await response.json().catch(() => null)
  const topLevel = proxyErrorSchema.safeParse(payload)
  const topLevelCredentialError =
    topLevel.success &&
    (topLevel.data.requiresCredentials === true ||
      CREDENTIAL_ERROR_KINDS.has(topLevel.data.errorKind ?? ''))

  if (!response.ok) {
    const info = topLevel
    const requiresCredentials = topLevelCredentialError
    const error = (info.success && info.data.error) || `proxy sync failed: ${response.status}`
    console.error('[hub/actions] batch sync failed', response.status, info.success ? info.data.errorKind : null)
    return result({
      updated: [],
      failed: requiresCredentials ? [] : commands.map(command => ({ command, error })),
      requiresCredentials,
    })
  }

  const entries = parseProxySyncResults(payload)
  // One login serves the whole batch: a credential failure on any entry (or at the top level
  // of a 200 response) means the stored login is bad, so prompt a re-link instead.
  if (topLevelCredentialError || entries.some(entry => CREDENTIAL_ERROR_KINDS.has(entry.errorKind ?? ''))) {
    return result({ updated: [], failed: [], requiresCredentials: true })
  }
  const updated: HubVTOPCommand[] = []
  const failed: HubSyncBatchResult['failed'] = []
  // Formatting may call the model and each entry upserts its own row: independent, bounded.
  await mapWithConcurrency(commands, HUB_SYNC_CONCURRENCY, async command => {
    const entry = entries.find(candidate => candidate.command === command)
    if (!entry || !entry.success || entry.result === undefined) {
      failed.push({ command, error: typeof entry?.error === 'string' ? entry.error : 'no result' })
      return
    }
    try {
      await formatAndPersistVTOPResult(userId, command, entry.result)
      updated.push(command)
    } catch (error) {
      console.error('[hub/actions] failed to store sync result', command, error)
      failed.push({ command, error: 'failed to store result' })
    }
  })

  return result({ updated, failed, requiresCredentials: false })
}

export async function loadPersonalHubState() {
  const userId = await requireUser()
  return buildHubState(userId)
}

export async function runHubToolAction(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const userId = await requireUser()
  const execute = HUB_DIRECT_TOOLS.has(toolName)
    ? getToolExecutor(createVITTools(userId), toolName)
    : undefined
  if (!execute) {
    throw new Error(`Unknown hub tool: ${toolName}`)
  }
  if (RATE_LIMITED_DIRECT_TOOLS.has(toolName)) {
    await enforceUserRateLimit(userId)
  }
  return execute(args)
}
