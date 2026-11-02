import type { ToolSet } from 'ai'

import { isRecord } from '@/lib/json'

export { isRecord }

export type UnknownRecord = Record<string, unknown>

/** Reads `record[key]` when it is a non-empty string. */
export const readString = (record: UnknownRecord | null | undefined, key: string) => {
  const value = record?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * The output of a tool call/result/invocation, whichever shape it comes in:
 * legacy invocations use `result`, AI SDK tool results use `output`.
 */
export function getToolOutput(tool: unknown): unknown {
  if (!isRecord(tool)) return null
  return tool.result ?? tool.output ?? null
}

/** `getToolOutput` when the output is an object (most of our tools return one). */
export function getToolOutputPayload(tool: unknown): UnknownRecord | null {
  const output = getToolOutput(tool)
  return isRecord(output) ? output : null
}

/** The input of a tool call: legacy invocations use `args`, AI SDK calls use `input`. */
export function getToolInputPayload(tool: unknown): UnknownRecord | undefined {
  if (!isRecord(tool)) return undefined
  const input = tool.args ?? tool.input
  return isRecord(input) ? input : undefined
}

export function inferLegacyToolState(tool: unknown, output: unknown): 'result' | 'error' {
  const state = isRecord(tool) && typeof tool.state === 'string' ? tool.state : ''

  if (isRecord(output)) {
    if ('success' in output && output.success === false) {
      return 'error'
    }
    return 'result'
  }

  if (state.includes('error')) {
    return 'error'
  }

  if (state.includes('output')) {
    return 'result'
  }

  return 'error'
}

/**
 * A `ToolSet` from a tool map whose entries may be absent (e.g. `createVITTools`
 * only adds `webSearch`/`webExtract` when configured, so they type as optional).
 */
export function toToolSet(tools: Record<string, ToolSet[string] | undefined>): ToolSet {
  const toolSet: ToolSet = {}
  for (const [name, tool] of Object.entries(tools)) {
    if (tool) toolSet[name] = tool
  }
  return toolSet
}

/**
 * Runs a tool from a tool set by name outside of a model call (direct tool
 * calls, hub actions). Returns `undefined` when the tool does not exist or has
 * no `execute`. The input is passed through as-is; tools validate their own
 * inputs where it matters.
 */
export function getToolExecutor(
  tools: Record<string, ToolSet[string] | undefined>,
  toolName: string
) {
  const tool = Object.hasOwn(tools, toolName) ? tools[toolName] : undefined
  const execute = tool?.execute
  if (typeof execute !== 'function') return undefined

  return async (input: unknown, toolCallId: string = `${toolName}-${Date.now()}`) => {
    const output: unknown = await execute(input, { toolCallId, messages: [], context: {} })
    return output
  }
}
