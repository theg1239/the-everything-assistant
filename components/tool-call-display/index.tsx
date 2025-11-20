'use client'

import React, { memo } from 'react'
import type { ToolInvocation } from '@/types/tools'

import { VtopCard } from './vtop-card'
import { RedditCard } from './reddit-card'
import { MessCard } from './mess-card'
import { PapersCard } from './papers-card'
import { DefaultCard } from './default-card'
import { PlacementCard } from './placement-card'
import { CourseCard } from './course-card'
import { SyllabusCard } from './syllabus-card'

interface ToolCallDisplayProps {
  toolCall: ToolInvocation
  retryToolCallId?: string
  onRetry?: (toolCallId: string) => void
}

const renderCard = (
  toolCall: ToolInvocation,
  retryToolCallId?: string,
  onRetry?: (id: string) => void
) => {
  const name = toolCall.toolName
  switch (name) {
    case 'queryVTOP':
      return <VtopCard toolCall={toolCall} retryToolCallId={retryToolCallId} onRetry={onRetry} />
    case 'searchRedditKnowledge':
    case 'searchRedditWithContext':
      return <RedditCard toolCall={toolCall} />
    case 'getMessMenu':
      return <MessCard toolCall={toolCall} />
    case 'findPastPapers':
      return <PapersCard toolCall={toolCall} />
    case 'getPlacementInfo':
      return <PlacementCard toolCall={toolCall} />
    case 'resolveCourseCode':
    case 'getCourseInfo':
      return <CourseCard toolCall={toolCall} />
    case 'getSyllabus':
      return <SyllabusCard toolCall={toolCall} />
    default:
      return <DefaultCard toolCall={toolCall} />
  }
}

const PureToolCallDisplay = ({ toolCall, retryToolCallId, onRetry }: ToolCallDisplayProps) => {
  if (toolCall?.result?.hidden) return null
  return <div className="space-y-2">{renderCard(toolCall, retryToolCallId, onRetry)}</div>
}

export const ToolCallDisplay = memo(function ToolCallDisplay(props: ToolCallDisplayProps) {
  return <PureToolCallDisplay {...props} />
})
