'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, ExternalLink, Building2, Target, ChevronRight, Link as LinkIcon } from 'lucide-react'

interface RegistrationResult {
  success?: boolean
  message?: string
  registrationUrl?: string
  event?: {
    id: string
    name: string
    type: string
    category: string
    club?: string
    tagline?: string
    startDate?: string
    endDate?: string
  }
  ambiguous?: boolean
  alternatives?: Array<{
    id: string
    name: string
    type?: string
    category?: string
    startDate?: string
  }>
  matches?: Array<{
    id: string
    name: string
    type?: string
    category?: string
    startDate?: string
  }>
  error?: string
}

const formatDate = (d?: string) => {
  if (!d) return ''
  try {
    const date = new Date(d)
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return d
  }
}

export default function GravitasEventRegistrationArtifact({ data }: { data: RegistrationResult }) {
  const base = 'https://gravitas.vit.ac.in/events'
  const alts = data.alternatives || data.matches || []

  if (data.success === false) {
    return (
      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="p-4">
          <div className="text-sm text-destructive font-medium">
            {data.error || data.message || 'Failed to resolve registration link.'}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/60 w-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold text-card-foreground">Search Results</CardTitle>
            {data.message && (
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {data.message}
              </div>
            )}
          </div>
          {data.registrationUrl && (
            <Badge variant="secondary" className="shrink-0 hidden sm:inline-flex">1 item</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {data.event && data.registrationUrl && (
          <div className="rounded-md border p-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-card-foreground break-words">
                  {data.event.name}
                </div>
                {data.event.tagline && (
                  <div className="text-xs text-muted-foreground italic mt-0.5 break-words">
                    "{data.event.tagline}"
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" />
                    <span>{data.event.type}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="break-words">{data.event.club}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5 px-2">
                    {data.event.category}
                  </Badge>
                </div>
                {(data.event.startDate || data.event.endDate) && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      {formatDate(data.event.startDate)}{data.event.endDate ? (
                        <>
                          <span className="mx-1">–</span>
                          {formatDate(data.event.endDate)}
                        </>
                      ) : null}
                    </span>
                  </div>
                )}
              </div>
              <div className="w-full sm:w-auto flex flex-col gap-2 sm:items-end items-stretch">
                <Button
                  size="sm"
                  className="h-8 w-full sm:w-auto"
                  onClick={() => window.open(data.registrationUrl!, '_blank')}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Open Registration
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full sm:w-auto"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(data.registrationUrl!)
                    } catch {}
                  }}
                >
                  <LinkIcon className="h-3.5 w-3.5 mr-1" />
                  Copy Link
                </Button>
              </div>
            </div>
          </div>
        )}

        {!data.registrationUrl && data.success && (
          <div className="text-sm text-muted-foreground">
            {data.message || 'Select an event to get the registration link.'}
          </div>
        )}

        {Array.isArray(alts) && alts.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Other matches</div>
            <div className="space-y-2">
              {alts.map(alt => (
                <div
                  key={alt.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded border p-2"
                >
                  <div className="min-w-0 w-full">
                    <div className="text-sm font-medium break-words">{alt.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {alt.type && <Badge variant="secondary" className="h-5 px-2 text-[10px]">{alt.type}</Badge>}
                      {alt.category && (
                        <Badge variant="outline" className="h-5 px-2 text-[10px]">
                          {alt.category}
                        </Badge>
                      )}
                      {alt.startDate && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(alt.startDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full sm:w-auto"
                    onClick={() => window.open(`${base}/${alt.id}`, '_blank')}
                  >
                    Get Link
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
