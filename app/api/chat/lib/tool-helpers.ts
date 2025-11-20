import type { JsonValue } from '@/types/tools'

export function getToolOutputPayload(tool: any) {
  if (!tool) return null
  return tool.result ?? tool.output ?? null
}

export function getToolInputPayload(tool: any) {
  if (!tool) return undefined
  return tool.args ?? tool.input ?? undefined
}

export function inferLegacyToolState(tool: any, output: any): 'result' | 'error' {
  const state = typeof tool?.state === 'string' ? tool.state : ''

  if (output && typeof output === 'object') {
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

