const safeJsonClone = (value: any) => {
  const seen = new WeakSet()
  try {
    const json = JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === 'function') return undefined
        if (typeof val === 'bigint') return Number(val)
        if (val && typeof val === 'object') {
          if (seen.has(val)) return undefined
          const ctor = (val as any)?.constructor?.name
          if (ctor && ['Response', 'Request', 'ReadableStream', 'Blob', 'FormData'].includes(ctor))
            return undefined
          seen.add(val)
        }
        return val
      },
      2
    )
    return JSON.parse(json)
  } catch (e) {
    console.warn('sanitizeToolInvocations: safe clone failed, returning empty object', e)
    return {}
  }
}

export function sanitizeToolInvocations(toolInvocations: any[]): any[] {
  if (!Array.isArray(toolInvocations)) {
    return toolInvocations
  }

  return toolInvocations.map(tool => {
    const sanitizedTool = safeJsonClone(tool)

    if (tool.toolName === 'queryVTOP' || tool.function?.name === 'queryVTOP') {
      if (sanitizedTool.args) {
        if (sanitizedTool.args.password) {
          delete sanitizedTool.args.password
        }
        if (sanitizedTool.args.username) {
          delete sanitizedTool.args.username
        }
      }

      if (sanitizedTool.function?.arguments) {
        try {
          const args =
            typeof sanitizedTool.function.arguments === 'string'
              ? JSON.parse(sanitizedTool.function.arguments)
              : sanitizedTool.function.arguments

          if (args.password) {
            delete args.password
          }
          if (args.username) {
            delete args.username
          }

          sanitizedTool.function.arguments =
            typeof sanitizedTool.function.arguments === 'string' ? JSON.stringify(args) : args
        } catch (e) {
          console.warn('Failed to parse function arguments for sanitization:', e)
        }
      }

      if (sanitizedTool.result && typeof sanitizedTool.result === 'object') {
        if (sanitizedTool.result.args) {
          if (sanitizedTool.result.args.password) {
            delete sanitizedTool.result.args.password
          }
          if (sanitizedTool.result.args.username) {
            delete sanitizedTool.result.args.username
          }
        }

        if (sanitizedTool.result.rawArgs) {
          delete sanitizedTool.result.rawArgs
        }
      }
    }

    return sanitizedTool
  })
}

export function sanitizeSingleToolInvocation(toolInvocation: any): any {
  return sanitizeToolInvocations([toolInvocation])[0]
}
