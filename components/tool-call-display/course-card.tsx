import { memo } from 'react'
import { BookOpen } from 'lucide-react'

import { BaseProps } from './types'
import { Section } from './sections'

export const CourseCard = memo(function CourseCard({ toolCall }: BaseProps) {
  const result = toolCall.result || {}
  const matches = result.matches || []
  const results = result.results || []
  const list = matches.length ? matches : results

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <BookOpen className="h-4 w-4 text-sky-600" />
        <span>Course lookup</span>
      </div>

      {list.length ? (
        <Section title="Matches">
          <ul className="space-y-1 text-sm">
            {list.slice(0, 8).map((m: any, idx: number) => (
              <li key={idx} className="flex justify-between gap-2">
                <span className="font-medium">{m.code || m.CODE}</span>
                <span className="text-muted-foreground truncate">{m.name || m.title || m.TITLE}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <div className="text-sm text-muted-foreground">No courses found.</div>
      )}
    </div>
  )
})

