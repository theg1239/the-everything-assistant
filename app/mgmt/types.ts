import type * as z from 'zod'
import type {
  chatViewerDataSchema,
  detailedUsageStatsSchema,
  lifetimeBucketSchema,
  statsResponseSchema,
  tokenUsageAllTimeSummarySchema,
  tokenUsageSummarySchema,
  usageLogSchema,
  usageResponseSchema,
} from '@/types/api/mgmt'

/** A `TokenUsage` row as it arrives over JSON from `/api/usage` (dates serialized). */
export type UsageLog = z.infer<typeof usageLogSchema>

export type TokenUsageSummary = z.infer<typeof tokenUsageSummarySchema>
export type TokenUsageAllTimeSummary = z.infer<typeof tokenUsageAllTimeSummarySchema>
export type LifetimeBucket = z.infer<typeof lifetimeBucketSchema>
export type DetailedUsageStats = z.infer<typeof detailedUsageStatsSchema>

/** Response body of `GET /api/usage`. */
export type UsageResponse = z.infer<typeof usageResponseSchema>

/** Response body of `GET /api/stats`. */
export type StatsResponse = z.infer<typeof statsResponseSchema>

export type MgmtUser = {
  id: string
  email?: string | null
  name?: string | null
}

export type ChatViewerData = z.infer<typeof chatViewerDataSchema>

export type BroadcastSlideField = 'title' | 'text' | 'image'

export type MgmtTab = 'overview' | 'tokens' | 'broadcasts' | 'stats' | 'users'

export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback
