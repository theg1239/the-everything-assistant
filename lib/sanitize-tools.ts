/**
 * Utility functions for sanitizing tool invocations before storage
 * Removes sensitive information like passwords and usernames from tool calls
 */

/**
 * Sanitizes tool invocations by removing sensitive data before storage
 * @param toolInvocations - Raw tool invocations array
 * @returns Sanitized tool invocations with sensitive data removed
 */
export function sanitizeToolInvocations(toolInvocations: any[]): any[] {
  if (!Array.isArray(toolInvocations)) {
    return toolInvocations
  }

  return toolInvocations.map(tool => {
    // Create a deep copy to avoid mutating the original
    const sanitizedTool = JSON.parse(JSON.stringify(tool))

    // Sanitize queryVTOP tool specifically
    if (tool.toolName === 'queryVTOP' || tool.function?.name === 'queryVTOP') {
      // Remove sensitive data from args
      if (sanitizedTool.args) {
        if (sanitizedTool.args.password) {
          delete sanitizedTool.args.password
        }
        if (sanitizedTool.args.username) {
          delete sanitizedTool.args.username
        }
      }

      // Remove sensitive data from function.arguments if it exists
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
          // If parsing fails, leave as is
          console.warn('Failed to parse function arguments for sanitization:', e)
        }
      }

      // Remove sensitive data from result if it contains echoed args
      if (sanitizedTool.result && typeof sanitizedTool.result === 'object') {
        // Some results might echo back the args
        if (sanitizedTool.result.args) {
          if (sanitizedTool.result.args.password) {
            delete sanitizedTool.result.args.password
          }
          if (sanitizedTool.result.args.username) {
            delete sanitizedTool.result.args.username
          }
        }

        // Clean up any raw command output that might contain credentials
        if (sanitizedTool.result.rawArgs) {
          delete sanitizedTool.result.rawArgs
        }
      }
    }

    return sanitizedTool
  })
}

/**
 * Sanitizes a single tool invocation
 * @param toolInvocation - Single tool invocation object
 * @returns Sanitized tool invocation
 */
export function sanitizeSingleToolInvocation(toolInvocation: any): any {
  return sanitizeToolInvocations([toolInvocation])[0]
}
