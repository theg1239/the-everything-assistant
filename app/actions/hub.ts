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
]

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
    ? rows.reduce((latest, row) => (row.fetchedAt > latest ? row.fetchedAt : latest), rows[0].fetchedAt)
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

  const args = {
    command,
    username: creds.username,
    password: creds.encryptedPassword,
    ...extras,
  }

  const raw = await vtop.execute(args, { toolCallId: `vtop-${Date.now()}`, messages: [] })

  let object: z.infer<typeof vtopResultSchema> | null = parseHubCommandResult(command, raw)
  let usage: any = null
  const MODEL_NAME = 'gemini-2.5-flash'

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
      totalTokens:
        usage.totalTokens || (usage.promptTokens || 0) + (usage.completionTokens || 0),
      meta: { type: 'hub-vtop', command },
    })
  }

  return object as VTOPFormattedResult
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

export async function syncCoreHubSnapshots(commands: HubVTOPCommand[] = [...HUB_CORE_COMMANDS]) {
  const userId = await requireUser()
  for (const command of commands) {
    try {
      await executeVTOPCommand(userId, command)
    } catch (error) {
      console.error('[hub/actions] failed to refresh', command, error)
    }
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
