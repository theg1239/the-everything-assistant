import { createVITTools } from '@/lib/tools'
import type { LegacyMessage } from '@/lib/ai-message-conversion'
import type { JsonValue } from '@/types/tools'

import { parseVTOPData } from './vtop-parser'
import type { ToolCallPayload } from './request'

export type DirectToolCallResult = {
  toolCallId: string
  toolName: string
  args?: Record<string, JsonValue>
  result: any
  state: string
}

export async function executeDirectToolCall(params: {
  directToolCall: ToolCallPayload
  messages: LegacyMessage[]
  userId: string
}): Promise<{ result: DirectToolCallResult | null; executed: boolean }> {
  const { directToolCall, messages, userId } = params

  const tools = createVITTools(userId)
  const tool = tools[directToolCall.toolName as keyof typeof tools]

  if (!tool || typeof tool.execute !== 'function') {
    console.error('Direct tool call - tool not found:', directToolCall.toolName)
    return {
      executed: true,
      result: {
        toolCallId: directToolCall.toolCallId || Date.now().toString(),
        toolName: directToolCall.toolName,
        args: directToolCall.args,
        result: {
          success: false,
          error: 'Tool not found',
          timestamp: new Date().toISOString(),
        },
        state: 'error',
      },
    }
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
    type ToolExecutionOptions = {
      toolCallId: string
      messages: LegacyMessage[]
    }
    type ToolExecute = (
      args: Record<string, JsonValue>,
      options: ToolExecutionOptions
    ) => Promise<Record<string, JsonValue> | JsonValue | null>

    const execute = tool.execute as unknown as ToolExecute
    const toolArgs: Record<string, JsonValue> =
      (directToolCall.args && Object.keys(directToolCall.args).length > 0
        ? directToolCall.args
        : {}) ?? {}

    const executionOptions = {
      toolCallId: directToolCall.toolCallId || Date.now().toString(),
      messages,
    }

    const rawResult = (await execute(toolArgs, executionOptions)) ?? null
    const resultObject =
      rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)
        ? (rawResult as Record<string, JsonValue>)
        : null

    const structuredResult =
      resultObject && ('success' in resultObject || 'data' in resultObject)
        ? (resultObject as Record<string, any>)
        : null

    if (
      directToolCall.toolName === 'queryVTOP' &&
      structuredResult &&
      structuredResult.success !== false &&
      structuredResult.data
    ) {
      try {
        const command = (structuredResult.command ?? directToolCall.args?.command) as string

        const userContext =
          messages && messages.length > 0
            ? messages
                .filter((m: any) => m.role === 'user')
                .slice(-3)
                .map((m: any) => m.content)
                .join(' | ')
            : ''

        const parsedData = await parseVTOPData(structuredResult, command, userContext, userId)

        Object.assign(structuredResult, {
          parsedData,
          formatted_content: (parsedData as any).formatted_content,
          structured_data: (parsedData as any).structured_data,
          summary: (parsedData as any).summary,
        })

        return {
          executed: true,
          result: {
            toolCallId: directToolCall.toolCallId || Date.now().toString(),
            toolName: directToolCall.toolName,
            args: directToolCall.args,
            result: structuredResult,
            state: 'result',
          },
        }
      } catch (parseError) {
        console.error('Failed to parse VTOP data:', parseError)
        return {
          executed: true,
          result: {
            toolCallId: directToolCall.toolCallId || Date.now().toString(),
            toolName: directToolCall.toolName,
            args: directToolCall.args,
            result: structuredResult ?? rawResult,
            state: 'result',
          },
        }
      }
    }

    return {
      executed: true,
      result: {
        toolCallId: directToolCall.toolCallId || Date.now().toString(),
        toolName: directToolCall.toolName,
        args: directToolCall.args,
        result: structuredResult ?? rawResult,
        state: 'result',
      },
    }
  } catch (error: any) {
    console.error('Direct tool call failed:', error)
    return {
      executed: true,
      result: {
        toolCallId: directToolCall.toolCallId || Date.now().toString(),
        toolName: directToolCall.toolName,
        args: directToolCall.args,
        result: {
          success: false,
          error: error.message || 'Tool execution failed',
          timestamp: new Date().toISOString(),
        },
        state: 'error',
      },
    }
  }
}

