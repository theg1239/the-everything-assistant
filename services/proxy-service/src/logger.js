'use strict'

/**
 * Minimal logger. Call sites never pass credentials, argv, or cli-top output; in production
 * `debug` is a no-op so nothing derived from VTOP data is written.
 */
function createLogger(config, sink = console) {
  const quiet = config.nodeEnv === 'test' && process.env.PROXY_TEST_LOGS !== '1'
  const noop = () => {}
  return {
    info: quiet ? noop : (...args) => sink.log(...args),
    warn: quiet ? noop : (...args) => sink.warn(...args),
    error: quiet ? noop : (...args) => sink.error(...args),
    debug: config.verboseLogs && !config.isProduction ? (...args) => sink.log(...args) : noop,
  }
}

/** "21BCE0001" -> "21***01" */
function maskUser(value) {
  if (typeof value !== 'string' || !value) return 'unknown'
  if (value.length <= 4) return '***'
  return `${value.slice(0, 2)}***${value.slice(-2)}`
}

module.exports = { createLogger, maskUser }
