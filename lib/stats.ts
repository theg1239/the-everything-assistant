import { prisma } from '@/lib/prisma'
import * as z from 'zod'

/** Raw SQL aggregates come back as number / bigint / Decimal / string depending on the driver. */
const sqlNumber = z.unknown().transform(value => Number(value || 0))
const sqlDate = z.union([z.date(), z.string()])

export async function getTotalUsers() {
  return prisma.user.count()
}

export async function getMessagesInLast30Minutes() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
  return prisma.message.count({
    where: {
      created_at: {
        gte: thirtyMinutesAgo,
      },
    },
  })
}

export type HourlyHeat = { ts: number; date: string; totalTokens: number }
export type DailyPeak = { day: string; peakHour: number; peakTokens: number }
export type DailyPeaks = { perDay: DailyPeak[]; aggregatedPeakHour: number }
export type ModelTotals = { model: string; totalTokens: number; count: number }
export type UserTotals = { userId: string | null; totalTokens: number; count: number }
export type MovingAvg = { day: string; avg: number }

function clampDays(days: number, min = 1, max = 365) {
  if (!Number.isFinite(days)) return min
  return Math.max(min, Math.min(max, Math.floor(days)))
}

function parseDateInput(input: unknown): Date | null {
  if (input == null) return null

  if (typeof input === 'number') {
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? null : d
  }

  if (typeof input === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(`${input}T00:00:00.000Z`)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(input)) return new Date(`${input}:00:00.000Z`)
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? null : d
  }

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : new Date(input)
  }

  return null
}

function getRange(days: number) {
  const _days = clampDays(days)
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - _days)
  return { from, to }
}

/*
 * Raw SQL is only used for time bucketing (`date_trunc`), which Prisma's query API can't express.
 * Identifiers follow prisma/schema.prisma: model `TokenUsage` is `@@map("token_usage")`; its
 * `createdAt` / `totalTokens` / `userId` / `model` fields are unmapped, so the columns keep those
 * (case-sensitive, hence quoted) names.
 */

export async function getHourlyHeatmap(days = 14): Promise<HourlyHeat[]> {
  const { from, to } = getRange(days)

  const rawRows: unknown = await prisma.$queryRaw`
    SELECT date_trunc('hour', "createdAt") AS "bucket", SUM("totalTokens") AS "totalTokens"
    FROM "token_usage"
    WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
    GROUP BY "bucket"
    ORDER BY "bucket" ASC
  `
  const rows = z.array(z.object({ bucket: sqlDate, totalTokens: sqlNumber })).parse(rawRows)

  return rows.flatMap((r): HourlyHeat[] => {
    const d = parseDateInput(r.bucket)
    if (!d) return []
    return [{ ts: d.getTime(), date: d.toISOString(), totalTokens: r.totalTokens }]
  })
}

export async function getDailyPeakHours(days = 30): Promise<DailyPeaks> {
  const heat = await getHourlyHeatmap(days)

  const byDay: Record<string, { hour: number; totalTokens: number }[]> = {}
  for (const h of heat) {
    const d = new Date(h.ts)
    if (Number.isNaN(d.getTime())) continue
    const day = d.toISOString().slice(0, 10)
    const hour = d.getUTCHours()
    const hours = (byDay[day] ??= [])
    hours.push({ hour, totalTokens: h.totalTokens })
  }

  const perDay: DailyPeak[] = Object.entries(byDay)
    .map(([day, arr]) => {
      arr.sort((a, b) => b.totalTokens - a.totalTokens)
      return {
        day,
        peakHour: arr[0]?.hour ?? 0,
        peakTokens: arr[0]?.totalTokens ?? 0,
      }
    })
    .sort((a, b) => a.day.localeCompare(b.day))

  const hourAgg: Record<number, number> = {}
  for (const r of perDay) {
    hourAgg[r.peakHour] = (hourAgg[r.peakHour] || 0) + r.peakTokens
  }
  const aggregatedPeakHour =
    Object.keys(hourAgg).length === 0
      ? 0
      : Number(
          Object.keys(hourAgg).reduce((best, cur) =>
            (hourAgg[Number(cur)] ?? 0) > (hourAgg[Number(best)] ?? 0) ? cur : best
          )
        )

  return { perDay, aggregatedPeakHour }
}

export async function getTopModels(limit = 10): Promise<ModelTotals[]> {
  const rows = await prisma.tokenUsage.groupBy({
    by: ['model'],
    _sum: { totalTokens: true },
    _count: { _all: true },
    orderBy: { _sum: { totalTokens: 'desc' } },
    take: limit,
  })
  return rows.map(r => ({
    model: r.model ?? 'unknown',
    totalTokens: r._sum.totalTokens ?? 0,
    count: r._count._all,
  }))
}

export async function getTokensPerUser(limit = 50): Promise<UserTotals[]> {
  const rows = await prisma.tokenUsage.groupBy({
    by: ['userId'],
    where: { userId: { not: null } },
    _sum: { totalTokens: true },
    _count: { _all: true },
    orderBy: { _sum: { totalTokens: 'desc' } },
    take: limit,
  })
  return rows.map(r => ({
    userId: r.userId,
    totalTokens: r._sum.totalTokens ?? 0,
    count: r._count._all,
  }))
}

export async function getMovingAverages(windowDays = 7): Promise<MovingAvg[]> {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 90)

  const rawRows: unknown = await prisma.$queryRaw`
    SELECT date_trunc('day', "createdAt") AS "day", SUM("totalTokens") AS "totalTokens"
    FROM "token_usage"
    WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
    GROUP BY "day"
    ORDER BY "day" ASC
  `
  const buckets = z
    .array(z.object({ day: sqlDate, totalTokens: sqlNumber }))
    .parse(rawRows)
    .flatMap(r => {
      const d = parseDateInput(r.day)
      return d ? [{ day: d.toISOString().slice(0, 10), totalTokens: r.totalTokens }] : []
    })
    .sort((a, b) => a.day.localeCompare(b.day))

  return buckets.map((bucket, i) => {
    const slice = buckets.slice(Math.max(0, i - windowDays + 1), i + 1)
    const avg = Math.round(slice.reduce((s, x) => s + x.totalTokens, 0) / slice.length)
    return { day: bucket.day, avg }
  })
}

export type ToolCallStat = { toolName: string; count: number }

/**
 * Invocation count per tool, most used first. Tool invocations are stored as a JSONB array of
 * `{ toolName, ... }` objects in `messages.tool_invocations` (see `saveMessage` in lib/db.ts);
 * the array is unnested and grouped in the database so only the per-tool totals come back.
 * Non-array values and entries without a string `toolName` are skipped (mirrors `readToolInvocations`).
 */
export async function getToolCallStats(limit = 50): Promise<ToolCallStat[]> {
  const rawRows: unknown = await prisma.$queryRaw`
    SELECT "inv"->>'toolName' AS "toolName", count(*) AS "count"
    FROM (
      SELECT jsonb_array_elements(
        CASE WHEN jsonb_typeof("tool_invocations") = 'array'
          THEN "tool_invocations"
          ELSE '[]'::JSONB
        END
      ) AS "inv"
      FROM "messages"
      WHERE "tool_invocations" IS NOT NULL
    ) AS "invocations"
    WHERE jsonb_typeof("inv"->'toolName') = 'string' AND "inv"->>'toolName' <> ''
    GROUP BY "toolName"
    ORDER BY "count" DESC, "toolName" ASC
    LIMIT ${limit}
  `
  return z.array(z.object({ toolName: z.string(), count: sqlNumber })).parse(rawRows)
}

export async function getDetailedUsageStats() {
  const [lifetimeBuckets, hourlyHeatmap, dailyPeaks, topModels, tokensPerUser, movingAverages] =
    await Promise.all([
      (await import('./db')).getTokenUsageLifetimeBuckets('day'),
      getHourlyHeatmap(14),
      getDailyPeakHours(30),
      getTopModels(10),
      getTokensPerUser(25),
      getMovingAverages(7),
    ])

  return { lifetimeBuckets, hourlyHeatmap, dailyPeaks, topModels, tokensPerUser, movingAverages }
}
