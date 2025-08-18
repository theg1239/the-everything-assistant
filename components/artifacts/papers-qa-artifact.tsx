'use client'

import { Card, CardContent } from '@/components/ui/card'
import { OptimizedMarkdown } from '@/components/ui/optimized-markdown'

export default function PapersQAArtifact({ data }: { data: any }) {
  const answer = data?.answer
  const sources = Array.isArray(data?.sources) ? data.sources : []
  const meta = data?.indexMeta

  return (
    <Card className="hover:shadow-md transition-shadow border-0">
      <CardContent className="p-4 space-y-4 border-0">
        {data?.question && (
          <div className="text-xs text-muted-foreground">
            Q:{' '}
            <OptimizedMarkdown
              id="question"
              content={
                typeof data.question === 'string'
                  ? data.question
                  : JSON.stringify(data.question, null, 2)
              }
            />
          </div>
        )}

        {answer && (
          <div className="p-3 rounded border border-border/40 bg-card/40">
            <div className="text-sm leading-relaxed break-words">
              <OptimizedMarkdown
                id="answer"
                content={typeof answer === 'string' ? answer : JSON.stringify(answer, null, 2)}
              />
            </div>
          </div>
        )}

        {sources.length > 0 && (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              sources
            </div>
            <div className="space-y-1">
              {sources.map((s: any, idx: number) => (
                <a
                  key={idx}
                  href={s?.url || s?.link || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="block p-2 rounded border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-colors text-xs break-words"
                >
                  {s?.title || s?.url || s?.link || 'source'}
                </a>
              ))}
            </div>
          </div>
        )}

        {meta && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
            {meta.course && (
              <div>
                <span className="font-medium text-foreground/80">course:</span> {meta.course}
              </div>
            )}
            {meta.examType && (
              <div>
                <span className="font-medium text-foreground/80">exam:</span> {meta.examType}
              </div>
            )}
            {meta.year && (
              <div>
                <span className="font-medium text-foreground/80">year:</span> {meta.year}
              </div>
            )}
            {meta.totalPapers && (
              <div>
                <span className="font-medium text-foreground/80">papers:</span> {meta.totalPapers}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
