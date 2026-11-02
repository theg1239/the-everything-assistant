'use server'

import { generateText, Output, type LanguageModelUsage } from 'ai'
import * as z from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createVITTools } from '@/lib/tools'
import {
  getFormattedVTOPCredentials as getServerFormattedVTOPCredentials,
  hasVTOPCredentials,
} from '@/lib/server-vtop-credentials'
import { vtopResultSchema, type VTOPFormattedResult } from '@/app/api/hub/vtop/schema'
import { getToolExecutor } from '@/app/api/chat/lib/tool-helpers'
import { parseHubCommandResult } from '@/lib/hub/parsers'
import type { RawVTOPResult } from '@/lib/hub/parsers/attendance'
import { defaultProviderOptions, languageModel } from '@/lib/ai'
import { enforceUserRateLimit } from '@/lib/user-rate-limiter'
import { saveTokenUsage } from '@/lib/db'
import { normalizeTokenUsage } from '@/lib/token-usage'
import { listVTOPSnapshots, upsertVTOPSnapshot } from '@/lib/vtop-snapshots'
import { toJsonValue } from '@/lib/json'
import { getModelConfig } from '@/lib/model-registry'
import type {
  HubVTOPCommand,
  PersonalHubState,
  PersonalHubSnapshot,
  VTOPCredentialPayload,
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
})

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

const VTOP_PROXY_URL = process.env.VTOP_PROXY_URL || 'http://localhost:3001'
async function requireUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }
  return session.user.id
}

async function buildHubState(userId: string): Promise<PersonalHubState> {
  const [linked, rows] = await Promise.all([hasVTOPCredentials(), listVTOPSnapshots(userId)])
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

async function resolveVTOPCredentials(
  provided?: VTOPCredentialPayload
): Promise<VTOPCredentialPayload> {
  if (provided?.username && provided?.encryptedPassword) {
    return provided
  }
  const fallback = await getServerFormattedVTOPCredentials()
  if (!fallback) {
    throw new Error('VTOP credentials are not linked')
  }
  return fallback
}

function buildCredentialPayload(creds: VTOPCredentialPayload) {
  const payload: Record<string, string | undefined> = { username: creds.username }
  if (creds.encryptedPassword?.includes(':::')) {
    const [encryptedPassword, sessionKey] = creds.encryptedPassword.split(':::')
    payload.encryptedPassword = encryptedPassword
    payload.sessionKey = sessionKey
  } else {
    payload.password = creds.encryptedPassword
  }
  return payload
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

  await upsertVTOPSnapshot(userId, command, object)

  if (usage) {
    const usageTotals = normalizeTokenUsage(usage)
    const modelIdForUsage = modelConfig?.modelId ?? getModelConfig('hubVtop').modelId
    await saveTokenUsage({
      userId,
      chatId: null,
      model: modelIdForUsage,
      stepIndex: null,
      inputTokens: usageTotals.inputTokens,
      outputTokens: usageTotals.outputTokens,
      totalTokens: usageTotals.totalTokens,
      meta: { type: 'hub-vtop', command },
    })
  }

  return object
}

async function executeVTOPCommand(
  userId: string,
  command: HubVTOPCommand,
  extras: Record<string, unknown> = {},
  credentials?: VTOPCredentialPayload
): Promise<VTOPFormattedResult> {
  const executeVtop = getToolExecutor(createVITTools(userId), 'queryVTOP')
  if (!executeVtop) {
    throw new Error('VTOP tool is unavailable')
  }

  const creds = await resolveVTOPCredentials(credentials)

  const args: Record<string, unknown> = {
    command,
    username: creds.username,
    ...extras,
    ...buildCredentialPayload(creds),
  }

  const raw = await executeVtop(args, `vtop-${Date.now()}`)
  return formatAndPersistVTOPResult(userId, command, raw)
}

export async function refreshVTOPSnapshotAction(
  command: HubVTOPCommand,
  extras: Record<string, unknown> = {},
  credentials?: VTOPCredentialPayload
): Promise<PersonalHubSnapshot> {
  const userId = await requireUser()
  const snapshot = await executeVTOPCommand(userId, command, extras, credentials)
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

async function runProxySyncBatch(commands: HubVTOPCommand[], creds: VTOPCredentialPayload) {
  const body = {
    ...buildCredentialPayload(creds),
    commands,
  }

  const response = await fetch(`${VTOP_PROXY_URL}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`proxy sync failed: ${response.status}`)
  }

  const payload: unknown = await response.json()
  return parseProxySyncResults(payload)
}

export async function syncCoreHubSnapshots(commands: HubVTOPCommand[] = [...HUB_CORE_COMMANDS]) {
  const userId = await requireUser()
  const creds = await resolveVTOPCredentials()

  let updatedCount = 0

  try {
    const entries = await runProxySyncBatch(commands, creds)
    console.log('[hub/actions] sync batch returned', entries.length, 'entries')

    for (const entry of entries) {
      const command = entry.command
      if (!isHubVTOPCommand(command, commands)) continue
      if (!entry.success || !entry.result) {
        console.error('[hub/actions] sync skipped', command, entry.error || 'unknown error')
        continue
      }
      try {
        await formatAndPersistVTOPResult(userId, command, entry.result)
        updatedCount++
        console.log('[hub/actions] persisted sync result for', command)
      } catch (error) {
        console.error('[hub/actions] failed to store sync result', command, error)
      }
    }

    if (updatedCount === 0 && entries.length === 0) {
      console.log('[hub/actions] no batch results, falling back to sequential refresh')
      throw new Error('Empty batch results')
    }
  } catch (error) {
    console.error('[hub/actions] batch sync failed, falling back to sequential refresh:', error)
    await Promise.allSettled(
      commands.map(async command => {
        try {
          await executeVTOPCommand(userId, command, {}, creds)
          updatedCount++
        } catch (fallbackError) {
          console.error('[hub/actions] fallback refresh failed', command, fallbackError)
        }
      })
    )
  }

  console.log('[hub/actions] sync complete, updated', updatedCount, 'snapshots')
  return buildHubState(userId)
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
  const execute = getToolExecutor(createVITTools(userId), toolName)
  if (!execute) {
    throw new Error(`Unknown hub tool: ${toolName}`)
  }
  return execute(args)
}
