import { memo } from 'react'
import { UtensilsCrossed } from 'lucide-react'

import { BaseProps } from './types'
import { Section } from './sections'

export const MessCard = memo(function MessCard({ toolCall }: BaseProps) {
  const result = toolCall.result || {}
  const today = result.data?.todayMenu
  const formatted = result.data?.formattedMenu || result.formattedMenu

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <UtensilsCrossed className="h-4 w-4 text-green-600" />
        <span>Mess menu</span>
      </div>

      {formatted ? (
        <div className="text-sm whitespace-pre-line">{formatted}</div>
      ) : today ? (
        <Section title="Today">
          <pre className="text-xs whitespace-pre-wrap bg-muted p-2 rounded">{JSON.stringify(today, null, 2)}</pre>
        </Section>
      ) : (
        <div className="text-sm text-muted-foreground">No menu data.</div>
      )}
    </div>
  )
})
