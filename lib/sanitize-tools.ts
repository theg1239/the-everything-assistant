import type { JsonValue } from '@/types/tools'
import { isJsonObject, isRecord, toJsonValue, type JsonObject } from './json'

const UNCLONEABLE_CONSTRUCTORS = ['Response', 'Request', 'ReadableStream', 'Blob', 'FormData']

const safeJsonClone = (value: unknown): JsonValue => {
  const seen = new WeakSet<object>()
  try {
    const json = JSON.stringify(
      value,
      (_key, val: unknown) => {
        if (typeof val === 'function') return undefined
        if (typeof val === 'bigint') return Number(val)
        if (val && typeof val === 'object') {
          if (seen.has(val)) return undefined
          const ctor: unknown = val.constructor?.name
          if (typeof ctor === 'string' && UNCLONEABLE_CONSTRUCTORS.includes(ctor)) return undefined
          seen.add(val)
        }
        return val
      },
      2
    )
    return toJsonValue(JSON.parse(json)) ?? {}
  } catch (e) {
    console.warn('sanitizeToolInvocations: safe clone failed, returning empty object', e)
    return {}
  }
}

const stripCredentials = (args: JsonObject) => {
  delete args.password
  delete args.username
}

/** Legacy/OpenAI-style invocations name the tool via `toolName` or `function.name`. */
export function isQueryVtopInvocation(tool: unknown): boolean {
  if (!isRecord(tool)) return false
  return (
    tool.toolName === 'queryVTOP' || (isRecord(tool.function) && tool.function.name === 'queryVTOP')
  )
}

/** Clones tool invocations to plain JSON and strips VTOP credentials from `queryVTOP` calls. */
export function sanitizeToolInvocations(toolInvocations: readonly unknown[]): JsonValue[] {
  if (!Array.isArray(toolInvocations)) {
    return []
  }

  return toolInvocations.map(tool => {
    const sanitizedTool = safeJsonClone(tool)

    if (!isQueryVtopInvocation(tool) || !isJsonObject(sanitizedTool)) {
      return sanitizedTool
    }

    if (isJsonObject(sanitizedTool.args)) {
      stripCredentials(sanitizedTool.args)
    }

    const fn = sanitizedTool.function
    if (isJsonObject(fn) && fn.arguments) {
      try {
        const rawArguments = fn.arguments
        const args =
          typeof rawArguments === 'string' ? toJsonValue(JSON.parse(rawArguments)) : rawArguments

        if (isJsonObject(args)) {
          stripCredentials(args)
        }

        if (args !== undefined) {
          fn.arguments = typeof rawArguments === 'string' ? JSON.stringify(args) : args
        }
      } catch (e) {
        console.warn('Failed to parse function arguments for sanitization:', e)
      }
    }

    const result = sanitizedTool.result
    if (isJsonObject(result)) {
      if (isJsonObject(result.args)) {
        stripCredentials(result.args)
      }
      delete result.rawArgs
    }

    return sanitizedTool
  })
}

export function sanitizeSingleToolInvocation(toolInvocation: unknown): JsonValue | undefined {
  return sanitizeToolInvocations([toolInvocation])[0]
}
