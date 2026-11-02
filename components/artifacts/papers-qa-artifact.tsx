'use client'

import { Card, CardContent } from '@/components/ui/card'
import { OptimizedMarkdown } from '@/components/optimized-markdown'
import { asArray, asRecord, asString, asText } from './artifact-data'

export default function PapersQAArtifact({ data }: { data: unknown }) {
  const record = asRecord(data)
  const question = record.question
  const answer = record.answer
  const sources = asArray(record.sources)
  const meta = record.indexMeta ? asRecord(record.indexMeta) : undefined
  const metaCourse = asText(meta?.course)
  const metaExamType = asText(meta?.examType)
  const metaYear = asText(meta?.year)
  const metaTotalPapers = asText(meta?.totalPapers)

  return (
    <Card className="hover:shadow-md transition-shadow border-0">
      <CardContent className="p-4 space-y-4 border-0">
        {Boolean(question) && (
          <div className="text-xs text-muted-foreground">
            Q:{' '}
            <OptimizedMarkdown
              id="question"
              content={typeof question === 'string' ? question : JSON.stringify(question, null, 2)}
            />
          </div>
        )}

        {Boolean(answer) && (
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
              {sources.map((rawSource, idx) => {
                const source = asRecord(rawSource)
                return (
                  <a
                    key={idx}
                    href={asString(source.url) || asString(source.link) || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="block p-2 rounded border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-colors text-xs break-words"
                  >
                    {asText(source.title) || asText(source.url) || asText(source.link) || 'source'}
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {meta && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
            {metaCourse && (
              <div>
                <span className="font-medium text-foreground/80">course:</span> {metaCourse}
              </div>
            )}
            {metaExamType && (
              <div>
                <span className="font-medium text-foreground/80">exam:</span> {metaExamType}
              </div>
            )}
            {metaYear && (
              <div>
                <span className="font-medium text-foreground/80">year:</span> {metaYear}
              </div>
            )}
            {metaTotalPapers && (
              <div>
                <span className="font-medium text-foreground/80">papers:</span> {metaTotalPapers}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
