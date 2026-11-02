import { createVITTools } from '@/lib/tools'
import type { LegacyMessage } from '@/lib/ai-message-conversion'
import type { JsonValue } from '@/types/tools'

import { parseVTOPData } from './vtop-parser'
import type { ToolCallPayload } from './request'
import { getToolExecutor, isRecord, readString } from './tool-helpers'

export type DirectToolCallResult = {
  toolCallId: string
  toolName: string
  args?: Record<string, JsonValue>
  result: unknown
  state: 'result' | 'error'
}

/** Joins the last three user messages, used as context for the VTOP parser. */
export const recentUserContext = (messages: LegacyMessage[]) =>
  messages
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => m.content)
    .join(' | ')

export async function executeDirectToolCall(params: {
  directToolCall: ToolCallPayload
  messages: LegacyMessage[]
  userId: string
}): Promise<{ result: DirectToolCallResult | null; executed: boolean }> {
  const { directToolCall, messages, userId } = params

  const toolCallId = directToolCall.toolCallId || Date.now().toString()
  const toResult = (result: unknown, state: DirectToolCallResult['state']) => ({
    executed: true,
    result: {
      toolCallId,
      toolName: directToolCall.toolName,
      args: directToolCall.args,
      result,
      state,
    },
  })

  const execute = getToolExecutor(createVITTools(userId), directToolCall.toolName)

  if (!execute) {
    console.error('Direct tool call - tool not found:', directToolCall.toolName)
    return toResult(
      { success: false, error: 'Tool not found', timestamp: new Date().toISOString() },
      'error'
    )
  }

  if (
    directToolCall.toolName === 'getFacultyInfo' &&
    directToolCall.args &&
    directToolCall.args.facultyName &&
    !directToolCall.args.includeCourses
  ) {
    directToolCall.args.includeCourses = true
  }

  try {
    const toolArgs: Record<string, JsonValue> =
      directToolCall.args && Object.keys(directToolCall.args).length > 0 ? directToolCall.args : {}

    const rawResult = (await execute(toolArgs, toolCallId)) ?? null
    const structuredResult =
      isRecord(rawResult) && ('success' in rawResult || 'data' in rawResult) ? rawResult : null

    if (
      directToolCall.toolName === 'queryVTOP' &&
      structuredResult &&
      structuredResult.success !== false &&
      structuredResult.data
    ) {
      try {
        const command =
          readString(structuredResult, 'command') ??
          (typeof directToolCall.args?.command === 'string' ? directToolCall.args.command : '')

        const parsedData = await parseVTOPData(
          structuredResult,
          command,
          recentUserContext(messages),
          userId
        )

        Object.assign(structuredResult, {
          parsedData,
          formatted_content: parsedData.formatted_content,
          structured_data: parsedData.structured_data,
          summary: parsedData.summary,
        })
      } catch (parseError) {
        console.error('Failed to parse VTOP data:', parseError)
      }
      return toResult(structuredResult, 'result')
    }

    return toResult(structuredResult ?? rawResult, 'result')
  } catch (error) {
    console.error('Direct tool call failed:', error)
    return toResult(
      {
        success: false,
        error: (error instanceof Error && error.message) || 'Tool execution failed',
        timestamp: new Date().toISOString(),
      },
      'error'
    )
  }
}
