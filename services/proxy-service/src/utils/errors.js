function sanitizeErrorForResponse(error, command) {
  const sanitizedError = {
    error: error.error || error.message || 'Command execution failed',
    command,
    timestamp: new Date().toISOString(),
  }

  if (error.args) {
    sanitizedError.args = error.args.map(arg => (arg === error.args[2] ? '***' : arg))
  }

  return sanitizedError
}

module.exports = {
  sanitizeErrorForResponse,
}
