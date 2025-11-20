import { memo } from 'react'
import { Workflow } from 'lucide-react'

import { BaseProps } from './types'

export const DefaultCard = memo(function DefaultCard({ toolCall }: BaseProps) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Workflow className="h-4 w-4 text-muted-foreground" />
        <span>{toolCall.toolName}</span>
      </div>
      <pre className="text-xs whitespace-pre-wrap bg-muted p-2 rounded">{JSON.stringify(toolCall.result ?? toolCall.output ?? toolCall, null, 2)}</pre>
    </div>
  )
})
