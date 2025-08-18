export function sanitizeToolInvocations(toolInvocations: any[]): any[] {
  if (!Array.isArray(toolInvocations)) {
    return toolInvocations
  }

  return toolInvocations.map(tool => {
    const sanitizedTool = JSON.parse(JSON.stringify(tool))

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
