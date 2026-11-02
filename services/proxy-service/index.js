'use strict'

const fs = require('fs')
const { loadConfig } = require('./src/config')
const { createProxy } = require('./src/app')
const { createLogger } = require('./src/logger')
const { terminateActiveChildren } = require('./src/child-processes')

const SHUTDOWN_TIMEOUT_MS = 10_000

const config = loadConfig()
const logger = createLogger(config)

function startupChecks() {
  if (!fs.existsSync(config.binaryPath)) {
    logger.error(`cli-top executable not found at ${config.binaryPath} (set BINARY_PATH)`)
    process.exit(1)
  }
  if (!config.apiKey && !config.authDisabled) {
    logger.error(
      '[auth] PROXY_API_KEY is not set: every VTOP endpoint will answer 503 until it is configured' +
        (config.isProduction ? '' : ' (or set PROXY_AUTH_DISABLED=true for local development)')
    )
  }
  if (config.authOptOutRequestedInProduction) {
    logger.error('[auth] PROXY_AUTH_DISABLED is ignored in production')
  }
  if (config.authDisabled) logger.warn('[auth] API authentication DISABLED (development only)')
  if (config.tokenSecretEphemeral) {
    logger.warn('[tokens] PROXY_TOKEN_SECRET not set: workflow tokens and download links will not survive restarts or work across instances')
  }
}

startupChecks()

let proxy
try {
  proxy = createProxy(config, { logger })
} catch (error) {
  // e.g. MCP OAuth enabled without MCP_OAUTH_CONSENT_SECRET, or an invalid manifest.
  logger.error('Failed to initialise proxy:', error.message)
  process.exit(1)
}

let server
proxy
  .start(config.port)
  .then(srv => {
    server = srv
    logger.info(`Proxy Service running on port ${config.port} (${config.nodeEnv})`)
  })
  .catch(error => {
    logger.error(`Failed to start Proxy Service on port ${config.port}:`, error)
    process.exit(1)
  })

function closeHttpServer() {
  if (!server) return Promise.resolve()
  return new Promise(resolve => {
    server.close(error => {
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') logger.warn('Error closing HTTP server:', error.message)
      resolve()
    })
    server.closeIdleConnections()
  })
}

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) {
    logger.info(`${signal} received again; shutdown already in progress`)
    return
  }
  shuttingDown = true
  proxy.setShuttingDown()
  logger.info(`${signal} received, shutting down gracefully`)

  const forceExit = setTimeout(() => {
    logger.error(`Graceful shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms; forcing exit`)
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  forceExit.unref()

  try {
    const httpClosed = closeHttpServer()
    const [children, mcpSessions] = await Promise.all([
      terminateActiveChildren({ graceMs: 3000, killWaitMs: 1000 }),
      proxy.closeMcpSessions(),
    ])
    logger.info(
      `Terminated ${children.total} CLI process(es) (${children.forced} force-killed); closed ${mcpSessions} MCP session(s)`
    )
    // In-flight requests settle once their CLI children are gone; drop any sockets still open after that.
    const lingering = setTimeout(() => server && server.closeAllConnections(), 2000)
    await httpClosed
    clearTimeout(lingering)
    proxy.stop()
    logger.info('Process terminated')
    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
