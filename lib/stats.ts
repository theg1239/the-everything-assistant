import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

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

  const d = new Date(input as any)
  return Number.isNaN(d.getTime()) ? null : d
}

function getRange(days: number) {
  const _days = clampDays(days)
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - _days)
  return { from, to }
}

export async function getHourlyHeatmap(days = 14): Promise<HourlyHeat[]> {
  const { from, to } = getRange(days)

  try {
    const rows: Array<{ bucket: Date | string; totalTokens: any }> = await prisma.$queryRaw`
      SELECT date_trunc('hour', "createdAt") AS bucket, SUM("totalTokens") AS "totalTokens"
      FROM "TokenUsage"
      WHERE "createdAt" >= ${from.toISOString()} AND "createdAt" <= ${to.toISOString()}
      GROUP BY bucket
      ORDER BY bucket ASC
    `

    return rows
      .map(r => {
        const d = parseDateInput(r.bucket)
        if (!d) return null
        return {
          ts: d.getTime(),
          date: d.toISOString(),
          totalTokens: Number(r.totalTokens || 0),
        }
      })
      .filter(Boolean) as HourlyHeat[]
  } catch {
    const all = await prisma.tokenUsage.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true, totalTokens: true },
    })

    const map: Record<string, number> = {}
    for (const r of all) {
      const d = new Date(r.createdAt)
      if (Number.isNaN(d.getTime())) continue
      const key = d.toISOString().slice(0, 13) // 'YYYY-MM-DDTHH'
      map[key] = (map[key] || 0) + Number(r.totalTokens || 0)
    }

    return Object.entries(map)
      .map(([k, v]) => {
        const d = parseDateInput(`${k}:00:00.000Z`)
        if (!d) return null
        return { ts: d.getTime(), date: d.toISOString(), totalTokens: v }
      })
      .filter(Boolean)
      .sort((a, b) => a!.ts - b!.ts) as HourlyHeat[]
  }
}

export async function getDailyPeakHours(days = 30): Promise<DailyPeaks> {
  const heat = await getHourlyHeatmap(days)

  const byDay: Record<string, { hour: number; totalTokens: number }[]> = {}
  for (const h of heat) {
    const d = new Date(h.ts)
    if (Number.isNaN(d.getTime())) continue
    const day = d.toISOString().slice(0, 10)
    const hour = d.getUTCHours()
    byDay[day] = byDay[day] || []
    byDay[day].push({ hour, totalTokens: h.totalTokens })
  }

  const perDay: DailyPeak[] = Object.keys(byDay)
    .map(day => {
      const arr = byDay[day]
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
            hourAgg[Number(cur)] > hourAgg[Number(best)] ? cur : best
          )
        )

  return { perDay, aggregatedPeakHour }
}

export async function getTopModels(limit = 10): Promise<ModelTotals[]> {
  try {
    const rows: Array<{ model: string | null; totalTokens: any; count: any }> =
      await prisma.$queryRaw`
      SELECT "model", SUM("totalTokens") AS "totalTokens", COUNT(*) AS "count"
      FROM "TokenUsage"
      GROUP BY "model"
      ORDER BY "totalTokens" DESC
      LIMIT ${limit}
    `
    return rows.map(r => ({
      model: r.model ?? 'unknown',
      totalTokens: Number(r.totalTokens || 0),
      count: Number(r.count || 0),
    }))
  } catch {
    const rows = await prisma.tokenUsage.groupBy({
      by: ['model'],
      _sum: { totalTokens: true },
      _count: { _all: true },
      orderBy: { _sum: { totalTokens: 'desc' } },
      take: limit,
    })
    return rows.map(r => ({
      model: r.model ?? 'unknown',
      totalTokens: Number(r._sum.totalTokens || 0),
      count: Number(r._count._all || 0),
    }))
  }
}

export async function getTokensPerUser(limit = 50): Promise<UserTotals[]> {
  try {
    const rows: Array<{ userId: string | null; totalTokens: any; count: any }> =
      await prisma.$queryRaw`
      SELECT "userId", SUM("totalTokens") AS "totalTokens", COUNT(*) AS "count"
      FROM "TokenUsage"
      WHERE "userId" IS NOT NULL
      GROUP BY "userId"
      ORDER BY "totalTokens" DESC
      LIMIT ${limit}
    `
    return rows.map(r => ({
      userId: r.userId,
      totalTokens: Number(r.totalTokens || 0),
      count: Number(r.count || 0),
    }))
  } catch {
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
      totalTokens: Number(r._sum.totalTokens || 0),
      count: Number(r._count._all || 0),
    }))
  }
}

export async function getMovingAverages(windowDays = 7): Promise<MovingAvg[]> {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 90)

  const computeMA = (buckets: { day: string; totalTokens: number }[]) => {
    const ma: MovingAvg[] = []
    for (let i = 0; i < buckets.length; i++) {
      const slice = buckets.slice(Math.max(0, i - windowDays + 1), i + 1)
      const avg = slice.length
        ? Math.round(slice.reduce((s, x) => s + x.totalTokens, 0) / slice.length)
        : 0
      ma.push({ day: buckets[i].day, avg })
    }
    return ma
  }

  try {
    const rows: Array<{ day: Date | string; totalTokens: any }> = await prisma.$queryRaw`
      SELECT date_trunc('day', "createdAt") AS day, SUM("totalTokens") AS "totalTokens"
      FROM "TokenUsage"
      WHERE "createdAt" >= ${from.toISOString()} AND "createdAt" <= ${to.toISOString()}
      GROUP BY day
      ORDER BY day ASC
    `
    const buckets = rows
      .map(r => ({
        day: (parseDateInput(r.day) ?? new Date(0)).toISOString().slice(0, 10),
        totalTokens: Number(r.totalTokens || 0),
      }))
      .sort((a, b) => a.day.localeCompare(b.day))
    return computeMA(buckets)
  } catch {
    const rows = await prisma.tokenUsage.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true, totalTokens: true },
    })
    const map: Record<string, number> = {}
    for (const r of rows) {
      const k = new Date(r.createdAt).toISOString().slice(0, 10)
      map[k] = (map[k] || 0) + Number(r.totalTokens || 0)
    }
    const buckets = Object.keys(map)
      .sort()
      .map(k => ({ day: k, totalTokens: map[k] }))
    return computeMA(buckets)
  }
}

export async function getToolCallStats() {
  const messagesWithTools = await prisma.message.findMany({
    where: {
      tool_invocations: {
        not: Prisma.JsonNull,
      },
    },
    select: {
      tool_invocations: true,
    },
  })
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
