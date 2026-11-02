'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Copy } from 'lucide-react'
import { asRecord, asText, isRecord } from './artifact-data'

export default function PapersIndexArtifact({ data }: { data: unknown }) {
  const record = asRecord(data)
  const message = asText(record.message)
  const indexId = record.indexId
  const course = asText(record.course)
  const examType = asText(record.examType)
  const year = asText(record.year)
  const totalIndexed = record.totalIndexed

  const copy = async (text?: unknown) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(String(text))
    } catch {}
  }

  const stats = record.stats
  return (
    <Card className="hover:shadow-md transition-shadow border-0">
      <CardContent className="p-4 space-y-3 border-0">
        {message && (
          <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
            {message}
          </div>
        )}

        {Boolean(indexId) && (
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-1 rounded bg-muted border border-border/50 font-mono break-all">
              {String(indexId)}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => copy(indexId)}
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> copy indexId
            </Button>
          </div>
        )}

        {(course || examType || year || typeof totalIndexed !== 'undefined') && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
            {course && (
              <div>
                <span className="font-medium text-foreground/80">course:</span> {course}
              </div>
            )}
            {examType && (
              <div>
                <span className="font-medium text-foreground/80">exam:</span> {examType}
              </div>
            )}
            {year && (
              <div>
                <span className="font-medium text-foreground/80">year:</span> {year}
              </div>
            )}
            {typeof totalIndexed !== 'undefined' && (
              <div>
                <span className="font-medium text-foreground/80">indexed:</span>{' '}
                {asText(totalIndexed)}
              </div>
            )}
          </div>
        )}

        {isRecord(stats) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {Object.entries(stats).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <Badge variant="outline" className="text-[11px] capitalize">
                  {k.replace(/_/g, ' ')}
                </Badge>
                <span className="text-muted-foreground">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
