'use client'

import type { UIMessagePart, UIDataTypes } from 'ai'
import { isToolUIPart, getToolName } from 'ai'
import { TextPart } from './text-part'
import { ReasoningPart } from './reasoning-part'
import { ToolPart, type ToolPartState } from './tool-part'
import { SourceUrlPart } from './source-url-part'
import type { AppUITools } from '@/lib/ai-message-conversion'

export type AppUIMessagePart = UIMessagePart<UIDataTypes, AppUITools>

type OverrideRenderer = (args: {
  toolName: string
  state: ToolPartState
  input?: unknown
  output?: unknown
  errorText?: string
}) => React.ReactNode | null

export interface MessagePartRendererProps {
  part: AppUIMessagePart
  messageId: string
  partIndex: number
  isStreaming?: boolean
  /**
   * Optional map of tool-name -> custom renderer. Registered tools can fully
   * replace the default `ToolPart` shell (e.g. a search-results grid or an
   * interactive quiz).
   */
  toolRenderers?: Record<string, OverrideRenderer>
}

/**
 * Single switch that routes an AI-SDK UI message part to the right component.
 * Modeled on Scira's `MessagePartRenderer` but trimmed to the subset EA +
 * ExamCooker need: text, reasoning, tool calls, and source-url citations.
 */
export function MessagePartRenderer({
  part,
  messageId,
  partIndex,
  isStreaming,
  toolRenderers,
}: MessagePartRendererProps) {
  const partId = `${messageId}-${partIndex}`

  if (part.type === 'text') {
    const text = (part as { text?: string }).text ?? ''
    return <TextPart id={partId} text={text} isStreaming={isStreaming} />
  }

  if (part.type === 'reasoning') {
    const text = (part as { text?: string }).text ?? ''
    return <ReasoningPart id={partId} text={text} isStreaming={isStreaming} />
  }

  if (part.type === 'source-url') {
    const url = (part as { url?: string }).url
    const title = (part as { title?: string }).title
    if (!url) return null
    return <SourceUrlPart url={url} title={title} />
  }

  if (isToolUIPart(part)) {
    const toolName = getToolName(part as Parameters<typeof getToolName>[0])
    const state = (part as { state?: string }).state as ToolPartState | undefined
    const input = (part as { input?: unknown }).input
    const output = (part as { output?: unknown }).output
    const errorText = (part as { errorText?: string }).errorText

    if (toolRenderers && toolName in toolRenderers && state) {
      const rendered = toolRenderers[toolName]({
        toolName,
        state,
        input,
        output,
        errorText,
      })
      if (rendered) return <>{rendered}</>
    }

    return (
      <ToolPart
        toolName={toolName}
        state={state ?? 'input-available'}
        input={input}
        output={output}
        errorText={errorText}
      />
    )
  }

  // Unhandled parts (file, step-start, etc.) fall through silently. Individual
  // surfaces can extend this renderer if they need to show them.
  return null
}
