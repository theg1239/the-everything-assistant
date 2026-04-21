/**
 * Shared chat-related types. `AppUIMessage` already exists in
 * `lib/ai-message-conversion.ts` and is the source of truth for EA's current
 * chat backend; this file re-exports it alongside Scira-style helpers so
 * downstream code (ExamCooker port included) can import from a single stable
 * path when we later extract the chat UI into its own package.
 */

export type {
  AppUIMessage as ChatMessage,
  AppUITools as ChatTools,
  LegacyMessage,
  LegacyMessageMetadata as ChatMetadata,
  LegacyToolInvocation,
  LegacyAttachment,
} from '@/lib/ai-message-conversion'

export type {
  GroupConfig,
  GroupId,
} from '@/lib/search/group-config'
