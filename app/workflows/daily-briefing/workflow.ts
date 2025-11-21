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
import { sendDailyBriefingEmail } from '@/lib/email/resend'

type StoredPreferences = {
  dailyBriefing?: {
    emailEnabled?: boolean
    dismissTime?: string
    emailTime?: string
  }
}

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
    } catch (error: any) {
      stats.failures.push({
        userId: recipient.id,
        email: recipient.email,
        reason: error?.message || 'unknown error',
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

  return rows
    .filter(row => {
      const prefs = (row.preferences as StoredPreferences | null)?.dailyBriefing
      return Boolean(row.email && prefs?.emailEnabled)
    })
    .map(row => {
      const prefs = ((row.preferences as StoredPreferences | null)?.dailyBriefing ||
        {}) as NonNullable<StoredPreferences['dailyBriefing']>
      return {
        id: row.id,
        email: row.email as string,
        name: row.name,
        preferences: prefs,
      }
    })
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

  const normalized: PersonalHubSnapshot[] = snapshots.map(row => {
    const data = (row.data as any) || {}
    return {
      command: row.command,
      title: data.title || row.command,
      summary: data.summary || 'no summary available',
      formatted_content: data.formatted_content,
      structured_data: data.structured_data,
      meta: data.meta || null,
      fetchedAt: row.fetchedAt.toISOString(),
    }
  })

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
