'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createVITTools } from '@/lib/tools'
import {
  getFormattedVTOPCredentials as getServerFormattedVTOPCredentials,
  hasVTOPCredentials,
} from '@/lib/server-vtop-credentials'
import { vtopResultSchema } from '@/app/api/hub/vtop/schema'
import { parseHubCommandResult } from '@/lib/hub/parsers'
import type { RawVTOPResult } from '@/lib/hub/parsers/attendance'
import { rateLimitedAI } from '@/lib/rate-limited-ai'
import { saveTokenUsage } from '@/lib/db'
import { listVTOPSnapshots, upsertVTOPSnapshot } from '@/lib/vtop-snapshots'
import type {
  HubVTOPCommand,
  PersonalHubState,
  PersonalHubSnapshot,
  VTOPCredentialPayload,
} from '@/types/hub'
import type { z } from 'zod'

type VTOPFormattedResult = z.infer<typeof vtopResultSchema>

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
const MODEL_NAME = 'gemini-flash-latest'

async function requireUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    throw new Error('Unauthorized')
  }
  return session.user.id
}

async function buildHubState(userId: string): Promise<PersonalHubState> {
  const [linked, rows] = await Promise.all([hasVTOPCredentials(), listVTOPSnapshots(userId)])
  ;('')
  const snapshots: PersonalHubSnapshot[] = rows.map((row: any) => {
    const data = row.data as VTOPFormattedResult | null
    return {
      command: row.command,
      title: data?.title || row.command,
      summary: data?.summary || 'no summary available',
      formatted_content: data?.formatted_content,
      structured_data: data?.structured_data,
      meta: data?.meta || null,
      fetchedAt: row.fetchedAt.toISOString(),
    }
  })
  const lastSyncedAt = rows.length
    ? rows.reduce(
        (latest, row) => (row.fetchedAt > latest ? row.fetchedAt : latest),
        rows[0].fetchedAt
      )
    : null
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
  const payload: Record<string, any> = { username: creds.username }
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
  raw: RawVTOPResult
): Promise<VTOPFormattedResult> {
  let object: z.infer<typeof vtopResultSchema> | null = parseHubCommandResult(command, raw)
  let usage: any = null

  if (!object) {
    const prompt = [
      'You format VTOP portal JSON into a structured digest for the personalized hub.',
      `Command: ${command}`,
      'Return valid JSON that matches the provided schema. Preserve all critical data points.',
      'Raw JSON:',
      JSON.stringify(raw || {}, null, 2),
    ].join('\n')

    const response = await rateLimitedAI.google.generateObject(
      {
        model: await rateLimitedAI.google.model(MODEL_NAME),
        schema: vtopResultSchema,
        prompt,
      },
      userId
    )

    object = response.object as z.infer<typeof vtopResultSchema> | null
    usage = response.usage

    if (!object) {
      throw new Error('Failed to format VTOP response')
    }
  }

  await upsertVTOPSnapshot(userId, command, object)

  if (usage) {
    await saveTokenUsage({
      userId,
      chatId: null,
      model: MODEL_NAME,
      stepIndex: null,
      promptTokens: usage.promptTokens || 0,
      completionTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || (usage.promptTokens || 0) + (usage.completionTokens || 0),
      meta: { type: 'hub-vtop', command },
    })
  }

  return object as VTOPFormattedResult
}

async function executeVTOPCommand(
  userId: string,
  command: HubVTOPCommand,
  extras: Record<string, any> = {},
  credentials?: VTOPCredentialPayload
): Promise<VTOPFormattedResult> {
  const tools = createVITTools(userId)
  const vtop = (tools as any)['queryVTOP']
  if (!vtop || typeof vtop.execute !== 'function') {
    throw new Error('VTOP tool is unavailable')
  }

  const creds = await resolveVTOPCredentials(credentials)

  const args: Record<string, any> = {
    command,
    username: creds.username,
    ...extras,
  }

  Object.assign(args, buildCredentialPayload(creds))

  const raw = await vtop.execute(args, { toolCallId: `vtop-${Date.now()}`, messages: [] })
  return formatAndPersistVTOPResult(userId, command, raw)
}

export async function refreshVTOPSnapshotAction(
  command: HubVTOPCommand,
  extras: Record<string, any> = {},
  credentials?: VTOPCredentialPayload
): Promise<PersonalHubSnapshot> {
  const userId = await requireUser()
  const snapshot = await executeVTOPCommand(userId, command, extras, credentials)
  return {
    command,
    title: snapshot.title,
    summary: snapshot.summary,
    formatted_content: snapshot.formatted_content,
    structured_data: snapshot.structured_data,
    meta: snapshot.meta || null,
    fetchedAt: new Date().toISOString(),
  }
}

type ProxySyncResultEntry = {
  command: string
  success: boolean
  result?: RawVTOPResult
  error?: any
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

  const payload = await response.json()
  const results = Array.isArray(payload?.results) ? payload.results : []
  return results as ProxySyncResultEntry[]
}

export async function syncCoreHubSnapshots(commands: HubVTOPCommand[] = [...HUB_CORE_COMMANDS]) {
  const userId = await requireUser()
  const creds = await resolveVTOPCredentials()

  try {
    const entries = await runProxySyncBatch(commands, creds)
    for (const entry of entries) {
      const command = entry.command as HubVTOPCommand
      if (!commands.includes(command)) continue
      if (!entry.success || !entry.result) {
        console.error('[hub/actions] sync skipped', command, entry.error || 'unknown error')
        continue
      }
      try {
        await formatAndPersistVTOPResult(userId, command, entry.result)
      } catch (error) {
        console.error('[hub/actions] failed to store sync result', command, error)
      }
    }
  } catch (error) {
    console.error('[hub/actions] batch sync failed, falling back to sequential refresh:', error)
    await Promise.allSettled(
      commands.map(async command => {
        try {
          await executeVTOPCommand(userId, command, {}, creds)
        } catch (fallbackError) {
          console.error('[hub/actions] fallback refresh failed', command, fallbackError)
        }
      })
    )
  }

  return buildHubState(userId)
}

export async function loadPersonalHubState() {
  const userId = await requireUser()
  return buildHubState(userId)
}

export async function runHubToolAction(toolName: string, args: Record<string, any> = {}) {
  const userId = await requireUser()
  const tools = createVITTools(userId)
  const tool = (tools as any)[toolName]
  if (!tool || typeof tool.execute !== 'function') {
    throw new Error(`Unknown hub tool: ${toolName}`)
  }
  return tool.execute(args)
}
