import type { TokenUsage } from '@/prisma/generated/client'
import type {
  getTokenUsageAllTimeSummary,
  getTokenUsageLifetimeBuckets,
  getTokenUsageSummary,
} from '@/lib/db'
import type {
  getDetailedUsageStats,
  getMessagesInLast30Minutes,
  getToolCallStats,
  getTotalUsers,
} from '@/lib/stats'

/** A `TokenUsage` row as it arrives over JSON from `/api/usage` (dates serialized). */
export type UsageLog = Omit<TokenUsage, 'createdAt' | 'meta'> & { createdAt: string }

export type TokenUsageSummary = Awaited<ReturnType<typeof getTokenUsageSummary>>
export type TokenUsageAllTimeSummary = Awaited<ReturnType<typeof getTokenUsageAllTimeSummary>>
export type LifetimeBucket = Awaited<ReturnType<typeof getTokenUsageLifetimeBuckets>>[number]
export type DetailedUsageStats = Awaited<ReturnType<typeof getDetailedUsageStats>>

/** Response body of `GET /api/usage`. */
export interface UsageResponse {
  recent: UsageLog[]
  summary: TokenUsageSummary
  summaryAllTime: TokenUsageAllTimeSummary
  lifetimeBuckets: LifetimeBucket[]
  detailedStats: DetailedUsageStats
}

/** Response body of `GET /api/stats`. */
export interface StatsResponse {
  totalUsers: Awaited<ReturnType<typeof getTotalUsers>>
  messagesInLast30Minutes: Awaited<ReturnType<typeof getMessagesInLast30Minutes>>
  toolCallStats: Awaited<ReturnType<typeof getToolCallStats>>
  /** Not returned by `/api/stats` today; the statistics panel renders it when present. */
  detailedStats?: DetailedUsageStats
}

export type MgmtUser = {
  id: string
  email?: string | null
  name?: string | null
}

export type ChatViewerMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type ChatViewerData = {
  chatId: string
  user: { id: string; name: string | null; email: string | null } | null
  messages: ChatViewerMessage[]
}

export type BroadcastSlideField = 'title' | 'text' | 'image'

export type MgmtTab = 'overview' | 'tokens' | 'broadcasts' | 'stats' | 'users'

export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback
