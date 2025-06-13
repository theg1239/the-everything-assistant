'use client'

import type React from 'react'

import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ResponsiveCardProps {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  actions?: React.ReactNode
  className?: string
  expandable?: boolean
  initialExpanded?: boolean
  maxHeight?: number
}

export function ResponsiveCard({
  title,
  icon,
  children,
  actions,
  className,
  expandable = false,
  initialExpanded = false,
  maxHeight = 300,
}: ResponsiveCardProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  const [showFullContent, setShowFullContent] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | null>(null)

  const contentRef = (node: HTMLDivElement) => {
    if (node !== null) {
      setContentHeight(node.scrollHeight)
    }
  }

  const needsExpansion = contentHeight !== null && contentHeight > maxHeight

  return (
    <Card className={cn('overflow-hidden border-border bg-card', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-sm sm:text-base text-card-foreground">{title}</CardTitle>
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          ref={contentRef}
          className={cn(
            'transition-all duration-300',
            !showFullContent &&
              needsExpansion &&
              !isExpanded &&
              'max-h-[300px] overflow-hidden relative'
          )}
        >
          {children}

          {!showFullContent && needsExpansion && !isExpanded && (
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent" />
          )}
        </div>

        {needsExpansion && !showFullContent && (
          <div className="mt-2 flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show More
                </>
              )}
            </Button>

            {/* <Button variant="outline" size="sm" onClick={() => setShowFullContent(true)} className="text-xs ml-2">
              <ExternalLink className="h-3 w-3 mr-1" />
              View Full
            </Button> */}
          </div>
        )}

        {showFullContent && (
          <div className="mt-2 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFullContent(false)}
              className="text-xs"
            >
              Close Full View
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
