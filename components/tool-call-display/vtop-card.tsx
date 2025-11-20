import { memo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

import { BaseProps } from './types'
import { Section } from './sections'

type VtopResult = {
  command?: string
  success?: boolean
  formatted_content?: string
  summary?: string
  error?: string
  requiresCredentials?: boolean
}

export const VtopCard = memo(function VtopCard({ toolCall, retryToolCallId, onRetry }: BaseProps) {
  const payload = toolCall.result as VtopResult
  const command = payload?.command || toolCall.args?.command
  const isError = payload?.success === false || toolCall.state === 'error'

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        {isError ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : null}
        <span>VTOP • {command || 'data'}</span>
      </div>

      <Section hidden={!payload?.formatted_content}>
        <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: payload?.formatted_content || '' }} />
      </Section>

      {!isError && payload?.summary ? (
        <div className="text-sm text-muted-foreground">{payload.summary}</div>
      ) : null}

      {isError ? (
        <div className="flex items-center justify-between text-sm text-amber-700">
          <span>{payload?.error || 'Failed to retrieve VTOP data.'}</span>
          {onRetry && toolCall.toolCallId ? (
            <button
              className="inline-flex items-center gap-1 text-amber-700 hover:underline"
              onClick={() => onRetry(toolCall.toolCallId!)}
              disabled={retryToolCallId === toolCall.toolCallId}
            >
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
