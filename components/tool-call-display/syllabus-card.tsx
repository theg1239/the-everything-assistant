import { memo } from 'react'
import { FileText } from 'lucide-react'

import { BaseProps } from './types'

export const SyllabusCard = memo(function SyllabusCard({ toolCall }: BaseProps) {
  const result = toolCall.result || {}
  const fileUrl = result.fileUrl
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FileText className="h-4 w-4 text-emerald-600" />
        <span>Syllabus</span>
      </div>
      <div className="text-sm">
        {result.title || result.code || 'Syllabus file'}
        {fileUrl ? (
          <div className="mt-2">
            <a className="text-primary hover:underline" href={fileUrl} target="_blank" rel="noreferrer">
              Download PDF
            </a>
          </div>
        ) : (
          <div className="text-muted-foreground">No file link available.</div>
        )}
      </div>
    </div>
  )
})

