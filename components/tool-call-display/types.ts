import type { ToolInvocation } from '@/types/tools'

export type ToolCall = ToolInvocation & {
  toolName: string
  toolCallId?: string
  state?: string
  result?: any
}

export type BaseProps = {
  toolCall: ToolCall
  retryToolCallId?: string
  onRetry?: (toolCallId: string) => void
  isLastFailed?: boolean
}

