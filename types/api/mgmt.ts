import * as z from 'zod'

/** Response schemas for the admin-only `app/api/(mgmt)/**` routes, as they arrive over JSON. */

/** A `TokenUsage` row from `/api/usage` (`createdAt` serialized; `meta` dropped). */
export const usageLogSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  chatId: z.string().nullable(),
  model: z.string().nullable(),
  stepIndex: z.number().nullable(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  totalTokens: z.number(),
  createdAt: z.string(),
})

const tokenTotalsSchema = z.object({
  totalPromptTokens: z.number(),
  totalCompletionTokens: z.number(),
  totalTokens: z.number(),
  count: z.number(),
})

/** `getTokenUsageSummary()` */
export const tokenUsageSummarySchema = tokenTotalsSchema.extend({
  from: z.string(),
  to: z.string(),
})

/** `getTokenUsageAllTimeSummary()` */
export const tokenUsageAllTimeSummarySchema = tokenTotalsSchema

/** `getTokenUsageLifetimeBuckets()` */
export const lifetimeBucketSchema = z.object({
  ts: z.number(),
  date: z.string(),
  totalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  count: z.number(),
})

/** `getDetailedUsageStats()` */
export const detailedUsageStatsSchema = z.object({
  lifetimeBuckets: z.array(lifetimeBucketSchema),
  hourlyHeatmap: z.array(z.object({ ts: z.number(), date: z.string(), totalTokens: z.number() })),
  dailyPeaks: z.object({
    perDay: z.array(z.object({ day: z.string(), peakHour: z.number(), peakTokens: z.number() })),
    aggregatedPeakHour: z.number(),
  }),
  topModels: z.array(z.object({ model: z.string(), totalTokens: z.number(), count: z.number() })),
  tokensPerUser: z.array(
    z.object({ userId: z.string().nullable(), totalTokens: z.number(), count: z.number() })
  ),
  movingAverages: z.array(z.object({ day: z.string(), avg: z.number() })),
})

/** `GET /api/usage` */
export const usageResponseSchema = z.object({
  recent: z.array(usageLogSchema),
  summary: tokenUsageSummarySchema,
  summaryAllTime: tokenUsageAllTimeSummarySchema,
  lifetimeBuckets: z.array(lifetimeBucketSchema),
  detailedStats: detailedUsageStatsSchema,
})

/** `GET /api/stats` */
export const statsResponseSchema = z.object({
  totalUsers: z.number(),
  messagesInLast30Minutes: z.number(),
  /** Top tools by invocation count (`getToolCallStats()`). */
  toolCallStats: z.array(z.object({ toolName: z.string(), count: z.number() })),
  /** Not returned by `/api/stats` today; the statistics panel renders it when present. */
  detailedStats: detailedUsageStatsSchema.optional(),
})

/** `GET /api/chat-messages/[chatId]` (filtered to user/assistant turns server-side). */
export const chatViewerDataSchema = z.object({
  chatId: z.string(),
  user: z
    .object({ id: z.string(), name: z.string().nullable(), email: z.string().nullable() })
    .nullable(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      createdAt: z.string(),
    })
  ),
})

/** `GET /api/users` */
export const mgmtUsersResponseSchema = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      createdAt: z.string(),
    })
  ),
})

/** `GET /api/user-messages` (all roles, unfiltered). */
export const mgmtUserMessagesResponseSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      chatId: z.string(),
      role: z.string(),
      content: z.string(),
      createdAt: z.string(),
    })
  ),
})

/** `POST /api/hub/send-briefing` (success body). */
export const sendBriefingResponseSchema = z.object({
  ok: z.literal(true),
  user: z.object({ id: z.string(), email: z.string(), name: z.string().nullable() }),
  briefing: z.object({
    greeting: z.string(),
    messages: z.number(),
    actions: z.number(),
    scheduledAt: z.string().nullable(),
    referenceTime: z.string(),
  }),
})
