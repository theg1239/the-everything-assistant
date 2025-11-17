const { cleanVTOPOutput } = require('./text')

function derivePrintableOutput(result, command) {
  if (!result) return ''

  if (typeof result.output === 'string' && result.output.trim().length > 0) {
    return result.output
  }

  if (typeof result.data === 'string' && result.data.trim().length > 0) {
    return result.data
  }

  if (result.structured_data) {
    try {
      return JSON.stringify(result.structured_data)
    } catch (error) {
      console.warn('[shape] failed to stringify structured payload:', error.message)
    }
  }

  if (typeof result === 'string') {
    return result
  }

  if (result.raw && typeof result.raw === 'string') {
    return result.raw
  }

  if (result.stdout && typeof result.stdout === 'string') {
    return result.stdout
  }

  if (result.stderr && typeof result.stderr === 'string') {
    return result.stderr
  }

  if (result.outputBlob && typeof result.outputBlob === 'string') {
    return result.outputBlob
  }

  return cleanVTOPOutput('', command)
}

function normalizeResultPayload(result, command, flags = {}) {
  if (!result || typeof result !== 'object') {
    return {
      success: false,
      error: 'Invalid CLI response',
      command,
    }
  }

  const printable = derivePrintableOutput(result, command)
  const structured =
    result.structured_data ||
    result.StructuredRaw ||
    (typeof result.data === 'object' && !Array.isArray(result.data) ? result.data : null)

  const meta = result.meta || {
    version: result.version || null,
    requestedAt: result.requested_at || null,
    completedAt: result.completed_at || null,
    durationMs: result.duration_ms || null,
    regNo: result.reg_no || null,
    flags: result.flags || flags || null,
  }

  return {
    success: result.success !== false,
    error: result.error,
    command: result.command || command,
    data: printable,
    output: printable,
    raw: Boolean(result.raw),
    structured_data: structured,
    message: result.message,
    meta,
    requiresCredentials: Boolean(result.requiresCredentials),
  }
}

module.exports = {
  normalizeResultPayload,
  derivePrintableOutput,
}
