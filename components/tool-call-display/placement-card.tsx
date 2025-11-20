import { memo } from 'react'
import { Briefcase } from 'lucide-react'

import { BaseProps } from './types'
import { Section, KeyValueList } from './sections'

export const PlacementCard = memo(function PlacementCard({ toolCall }: BaseProps) {
  const result = toolCall.result || {}
  const stats = result.stats || result.data || {}
  const summary = result.summary || result.message

  const companies: Array<{ name: string; offers?: number; ctc?: string }> = result.companies || []

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Briefcase className="h-4 w-4 text-indigo-600" />
        <span>Placements</span>
      </div>

      {summary ? <div className="text-sm leading-relaxed">{summary}</div> : null}

      <Section hidden={!companies.length} title="Top companies">
        <ul className="space-y-1 text-sm">
          {companies.slice(0, 6).map(company => (
            <li key={company.name} className="flex justify-between gap-2">
              <span className="truncate">{company.name}</span>
              <span className="text-xs text-muted-foreground">
                {company.offers ? `${company.offers} offers` : ''}
                {company.ctc ? ` · ${company.ctc}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        hidden={!
          (stats.totalOffers || stats.highestCTC || stats.averageCTC || stats.medianCTC)
        }
        title="Stats"
      >
        <KeyValueList
          compact
          items={[
            { label: 'Total offers', value: stats.totalOffers ?? '—' },
            { label: 'Highest CTC', value: stats.highestCTC ?? stats.highest_ctc ?? '—' },
            { label: 'Average CTC', value: stats.averageCTC ?? stats.avg_ctc ?? '—' },
            { label: 'Median CTC', value: stats.medianCTC ?? stats.median_ctc ?? '—' },
          ]}
        />
      </Section>
    </div>
  )
})

