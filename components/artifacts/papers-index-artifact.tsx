'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Copy } from 'lucide-react'

export default function PapersIndexArtifact({ data }: { data: any }) {
  const copy = async (text?: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(String(text))
    } catch {}
  }

  const stats = data?.stats
  return (
    <Card className="hover:shadow-md transition-shadow border-0">
      <CardContent className="p-4 space-y-3 border-0">
        {data?.message && (
          <div className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
            {data.message}
          </div>
        )}

        {data?.indexId && (
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-1 rounded bg-muted border border-border/50 font-mono break-all">
              {String(data.indexId)}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => copy(data.indexId)}
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> copy indexId
            </Button>
          </div>
        )}

        {(data?.course ||
          data?.examType ||
          data?.year ||
          typeof data?.totalIndexed !== 'undefined') && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
            {data.course && (
              <div>
                <span className="font-medium text-foreground/80">course:</span> {data.course}
              </div>
            )}
            {data.examType && (
              <div>
                <span className="font-medium text-foreground/80">exam:</span> {data.examType}
              </div>
            )}
            {data.year && (
              <div>
                <span className="font-medium text-foreground/80">year:</span> {data.year}
              </div>
            )}
            {typeof data.totalIndexed !== 'undefined' && (
              <div>
                <span className="font-medium text-foreground/80">indexed:</span> {data.totalIndexed}
              </div>
            )}
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {Object.entries(stats as Record<string, any>).map(([k, v]) => (
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
