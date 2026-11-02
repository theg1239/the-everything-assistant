import * as z from 'zod'
import type { Prisma } from '@/prisma/generated/client'
import { prisma } from '@/lib/prisma'
import { listVTOPSnapshots } from '@/lib/vtop-snapshots'
import {
  buildDailyBriefingContext,
  buildGreeting,
  deriveTerseName,
  type DailyBriefingMessage,
  type DailyBriefingAction,
} from '@/lib/hub/daily-briefing'
import type { PersonalHubSnapshot } from '@/types/hub'
import type { JsonValue } from '@/types/tools'
import { sendDailyBriefingEmail } from '@/lib/email/resend'

const storedPreferencesSchema = z.object({
  dailyBriefing: z
    .object({
      emailEnabled: z.boolean().optional(),
      dismissTime: z.string().optional(),
      emailTime: z.string().optional(),
    })
    .optional(),
})

type StoredPreferences = z.infer<typeof storedPreferencesSchema>

type RecipientRecord = {
  id: string
  email: string
  name?: string | null
  preferences: StoredPreferences['dailyBriefing']
}

export type DailyBriefingWorkflowInput = {
  userIds?: string[]
  referenceTime?: string
  dryRun?: boolean
}

export type DailyBriefingWorkflowResult = {
  totalAudience: number
  attempted: number
  delivered: number
  skipped: number
  failures: { userId: string; email: string; reason: string }[]
  dryRun: boolean
  referenceTime: string
}

export async function dailyBriefingWorkflow(
  input: DailyBriefingWorkflowInput = {}
): Promise<DailyBriefingWorkflowResult> {
  'use workflow'

  const referenceTime = input.referenceTime || new Date().toISOString()
  const recipientList = await fetchBriefingAudienceStep({ userIds: input.userIds })

  const stats: DailyBriefingWorkflowResult = {
    totalAudience: recipientList.length,
    attempted: 0,
    delivered: 0,
    skipped: 0,
    failures: [],
    dryRun: Boolean(input.dryRun),
    referenceTime,
  }

  for (const recipient of recipientList) {
    stats.attempted += 1
    try {
      const briefing = await buildBriefingPacketStep({
        userId: recipient.id,
        referenceTime,
      })

      if (!briefing || briefing.messages.length === 0) {
        stats.skipped += 1
        continue
      }

      if (!stats.dryRun) {
        await deliverBriefingEmailStep({
          to: recipient.email,
          greeting: briefing.greeting,
          messages: briefing.messages,
          actions: briefing.actions,
        })
      }

      stats.delivered += 1
    } catch (error) {
      stats.failures.push({
        userId: recipient.id,
        email: recipient.email,
        reason: errorMessage(error) || 'unknown error',
      })
    }
  }

  return stats
}

async function fetchBriefingAudienceStep({
  userIds,
}: {
  userIds?: string[]
}): Promise<RecipientRecord[]> {
  'use step'

  const where: Prisma.UserWhereInput = {
    email: { not: null },
  }

  if (userIds && userIds.length > 0) {
    where.id = { in: userIds }
  }

  const rows = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      preferences: true,
    },
  })

  return rows.flatMap(row => {
    const prefs = readDailyBriefingPreferences(row.preferences)
    if (!row.email || !prefs?.emailEnabled) return []
    return [
      {
        id: row.id,
        email: row.email,
        name: row.name,
        preferences: prefs,
      },
    ]
  })
}

function readDailyBriefingPreferences(
  preferences: Prisma.JsonValue
): StoredPreferences['dailyBriefing'] {
  const parsed = storedPreferencesSchema.safeParse(preferences)
  return parsed.success ? parsed.data.dailyBriefing : undefined
}

function errorMessage(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error
    if (typeof message === 'string') return message
  }
  return undefined
}

function isJsonObject(value: Prisma.JsonValue | undefined): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Prisma's JSON objects allow `undefined` members; DB values never contain them, so drop any. */
function toJsonValue(value: Prisma.JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (isJsonObject(value)) return toJsonRecord(value)
  return value
}

function toJsonRecord(value: Prisma.JsonObject): Record<string, JsonValue> {
  const record: Record<string, JsonValue> = {}
  for (const [key, member] of Object.entries(value)) {
    if (member !== undefined) record[key] = toJsonValue(member)
  }
  return record
}

/** Normalises a snapshot's JSON `data` column into the hub snapshot shape. */
function toHubSnapshot(row: { command: string; data: Prisma.JsonValue; fetchedAt: Date }): PersonalHubSnapshot {
  const data = isJsonObject(row.data) ? row.data : {}
  const { title, summary, formatted_content, structured_data, meta } = data
  return {
    command: row.command,
    title: typeof title === 'string' && title ? title : row.command,
    summary: typeof summary === 'string' && summary ? summary : 'no summary available',
    formatted_content: typeof formatted_content === 'string' ? formatted_content : undefined,
    structured_data: structured_data === undefined ? undefined : toJsonValue(structured_data),
    meta: isJsonObject(meta) ? toJsonRecord(meta) : null,
    fetchedAt: row.fetchedAt.toISOString(),
  }
}

async function buildBriefingPacketStep({
  userId,
  referenceTime,
}: {
  userId: string
  referenceTime: string
}) {
  'use step'

  const snapshots = await listVTOPSnapshots(userId)
  if (!snapshots.length) return null

  const normalized: PersonalHubSnapshot[] = snapshots.map(toHubSnapshot)

  const reference = new Date(referenceTime)
  if (Number.isNaN(reference.getTime())) {
    reference.setTime(Date.now())
  }

  const context = buildDailyBriefingContext(normalized, reference)
  if (!context.messages.length) {
    return null
  }

  const profileSnapshot = normalized.find(snapshot => snapshot.command === 'profile')
  const greeting = buildGreeting(reference, deriveTerseName(profileSnapshot))

  return {
    greeting,
    messages: context.messages,
    actions: context.actions,
  }
}

async function deliverBriefingEmailStep(input: {
  to: string
  greeting: string
  messages: DailyBriefingMessage[]
  actions: DailyBriefingAction[]
}) {
  'use step'

  await sendDailyBriefingEmail({
    to: input.to,
    greeting: input.greeting,
    messages: input.messages,
    actions: input.actions,
  })
}
