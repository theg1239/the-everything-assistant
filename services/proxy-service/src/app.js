'use strict'

const fs = require('fs')
const path = require('path')
const express = require('express')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { randomUUID } = require('crypto')
const { AsyncLocalStorage } = require('async_hooks')

const { Catalog, ValidationError, FORMATS } = require('./catalog')
const { CliRunner } = require('./cli/runner')
const { LatestJsonCache } = require('./cli/latest-json')
const { ProxyError, kindInfo } = require('./cli/errors')
const { Scheduler } = require('./scheduler')
const { TtlCache, SingleFlight } = require('./cache')
const { FileStore } = require('./files/store')
const { TokenSealer } = require('./workflow/token')
const { VtopService } = require('./service')
const { resolvePassword } = require('./credentials')
const { requireApiKey } = require('./http/auth')
const { startLegacyWorkflow, continueLegacyWorkflow } = require('./workflows/course-page')
const { createLogger, maskUser } = require('./logger')
const { absolutize } = require('./http/respond')

const requestContext = new AsyncLocalStorage()

/** Absolute base URL for links in responses (PROXY_PUBLIC_URL wins over the request's Host). */
function baseUrlFor(config, req) {
  if (config.publicBaseUrl) return config.publicBaseUrl
  if (!req) return ''
  return `${req.protocol}://${req.get('host')}`
}

function finalize(result, base) {
  const { httpStatus, ...body } = absolutize(result, base)
  return { status: httpStatus || (body.success === false ? kindInfo(body.errorKind).status : 200), body }
}

function errorBody(error) {
  const kind = error instanceof ProxyError || error instanceof ValidationError ? error.kind : 'internal_error'
  const info = kindInfo(kind)
  const message = kind === 'internal_error' ? info.message : error.message || info.message
  return {
    status: info.status,
    body: {
      success: false,
      status: 'error',
      error: message,
      errorKind: kind,
      retryable: info.retryable,
      requiresCredentials: info.requiresCredentials,
      message,
      ...(error.field ? { field: error.field } : {}),
      ...(error.validIds ? { validIds: error.validIds } : {}),
    },
  }
}

/**
 * Builds the proxy (Express app + services). `start()` binds the port and warms caches;
 * `stop()` releases timers. Graceful process shutdown lives in index.js.
 */
function createProxy(config, { logger = createLogger(config) } = {}) {
  const catalog = Catalog.fromFile(config.manifestPath)
  const latestJson = new LatestJsonCache({
    upstream: config.latestJsonUpstream,
    refreshMs: config.latestJsonRefreshMs,
    maxStaleMs: config.latestJsonMaxStaleMs,
    enabled: config.latestJsonCache,
    logger,
  })
  const runner = new CliRunner({ config, latestJson, logger })
  const scheduler = new Scheduler({
    maxConcurrent: config.maxConcurrent,
    perKeyConcurrency: config.perUserConcurrency,
    maxQueue: config.maxQueue,
    perKeyMaxQueue: config.perUserMaxQueue,
    queueTimeoutMs: config.queueTimeoutMs,
  })
  const files = new FileStore({
    dir: config.fileStoreDir,
    ttlSeconds: config.fileTtlSeconds,
    maxBytes: config.fileStoreMaxBytes,
    secret: config.tokenSecret,
    logger,
  })
  const tokens = new TokenSealer({ secret: config.tokenSecret, ttlSeconds: config.workflowTtlSeconds })
  const service = new VtopService({
    config,
    catalog,
    runner,
    scheduler,
    cache: new TtlCache({ maxEntries: config.cacheMaxEntries }),
    flight: new SingleFlight(),
    files,
    tokens,
    logger,
  })

  const app = express()
  app.disable('x-powered-by')
  if (config.trustProxy) app.set('trust proxy', config.trustProxy)

  let shuttingDown = false
  app.use((req, res, next) => {
    if (!shuttingDown) return next()
    res.set('Connection', 'close')
    res.status(503).json({ success: false, error: 'Server is shutting down', errorKind: 'busy' })
  })

  // Children read the cached kill-switch document from here (loopback only; before rate limits).
  app.get('/internal/cli-top/latest.json', latestJson.handler())

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(express.json({ limit: '1mb' }))
  app.use(rateLimit({ windowMs: 60_000, limit: config.globalRateLimit, standardHeaders: true, legacyHeaders: false }))
  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && config.allowedOrigins.includes(origin)) res.header('Access-Control-Allow-Origin', origin)
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, X-Proxy-Key')
    res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
  app.use((req, res, next) => {
    const started = Date.now()
    req.id = randomUUID().slice(0, 8)
    res.on('finish', () => logger.info(`[http:${req.id}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`))
    next()
  })

  const auth = requireApiKey(config)
  const vtopLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.vtopRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests', errorKind: 'rate_limited' },
  })

  const abortOnClose = (req, res) => {
    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })
    return controller.signal
  }
  const credentialsFrom = body => ({ username: body.username, password: resolvePassword(body, { logger }) })
  const handle = fn => async (req, res) => {
    try {
      const result = await fn(req, res)
      if (result === undefined) return
      const { status, body } = finalize(result, baseUrlFor(config, req))
      res.status(status).json(body)
    } catch (error) {
      if (!(error instanceof ProxyError || error instanceof ValidationError)) logger.error(`[http:${req.id}] unhandled`, error)
      const { status, body } = errorBody(error)
      res.status(status).json(body)
    }
  }
  const logRun = (req, command, username) => logger.info(`[http:${req.id}] command=${command} user=${maskUser(username)}`)

  // ------------------------------------------------------------------ public
  app.get('/health', (req, res) => {
    const binary = fs.existsSync(config.binaryPath)
    const cli = latestJson.status()
    const authConfigured = Boolean(config.apiKey) || config.authDisabled
    const decommissioned = cli.killSwitch === 2 || cli.killSwitch === 3
    res.status(binary ? 200 : 503).json({
      status: !binary ? 'missing-binary' : decommissioned || !authConfigured ? 'degraded' : 'ok',
      version: config.version,
      binary,
      commands: catalog.names().length,
      auth: config.authDisabled ? 'disabled (development)' : config.apiKey ? 'shared-secret' : 'NOT CONFIGURED',
      cli,
      queue: { running: scheduler.stats().running, queued: scheduler.stats().queued },
      uptimeSeconds: Math.round(process.uptime()),
    })
  })

  app.get('/commands', (req, res) => {
    const list = catalog.list()
    res.json({
      commands: list.map(entry => entry.command),
      mapping: Object.fromEntries(list.map(entry => [entry.command, entry.cliCommand])),
      interactive: Object.fromEntries(list.filter(e => e.interactive).map(e => [e.cliCommand, e.interactive])),
      catalog: list.map(entry => ({
        command: entry.command,
        cliCommand: entry.cliCommand,
        title: entry.title,
        description: entry.description,
        group: entry.group,
        kind: entry.kind,
        writeWhen: entry.writeWhen || null,
        cacheTtlSeconds: entry.cacheTtlSeconds,
        sync: entry.sync,
        params: entry.params.map(name => ({
          name,
          type: catalog.paramSpec(name).type,
          format: FORMATS[catalog.paramSpec(name).type],
          description: catalog.paramSpec(name).description,
        })),
        steps: entry.steps,
      })),
      version: config.version,
      workflow: {
        start: 'POST /vtop { command, username, password, flags?, confirm?, fresh? }',
        continue: 'POST /vtop/continue { continuation, choice, password, username? }',
        choice: {
          select: 'option id ("2"), array of ids (["1","3"]); multiple only: range over ids ("1,3-5") or "all"',
          input: 'raw value in step.format; when step.options is non-empty, one of step.options[].id',
          confirm: 'boolean (false cancels)',
        },
        statuses: ['completed', 'needs_selection', 'needs_input', 'needs_confirmation', 'cancelled', 'error'],
      },
    })
  })

  // Signed, expiring download links (the signature is the authorisation).
  app.get('/files/bundle/:id/:name', files.bundleHandler())
  app.get('/files/:id/:name', files.fileHandler())
  app.get('/download/:fileId', (req, res) =>
    res.status(410).json({ success: false, error: 'This download link has expired. Run the command again for a fresh link.' })
  )

  // ------------------------------------------------------------------ authenticated API
  app.post(
    '/vtop',
    auth,
    vtopLimiter,
    handle(async (req, res) => {
      const body = req.body || {}
      if (typeof body.command !== 'string' || !catalog.get(body.command) || body.command === 'sync') {
        return {
          ...errorBody(new ProxyError('unsupported_command', `Unsupported command: ${String(body.command || '')}`)).body,
          supportedCommands: catalog.names().filter(name => name !== 'sync'),
          httpStatus: 400,
        }
      }
      const creds = credentialsFrom(body)
      logRun(req, body.command, creds.username)
      return service.execute({
        command: body.command,
        ...creds,
        flags: body.flags,
        select: body.select,
        confirm: body.confirm === true,
        fresh: body.fresh === true || /no-cache/i.test(req.get('cache-control') || ''),
        signal: abortOnClose(req, res),
      })
    })
  )

  app.post(
    '/vtop/continue',
    auth,
    vtopLimiter,
    handle(async (req, res) => {
      const body = req.body || {}
      const password = resolvePassword(body, { logger })
      return service.continueWorkflow({
        continuation: body.continuation,
        choice: body.choice,
        username: body.username,
        password,
        signal: abortOnClose(req, res),
      })
    })
  )

  const syncHandler = async (req, res) => {
    const body = req.body || {}
    const stream = req.query.stream === '1' || /application\/x-ndjson/.test(req.get('accept') || '')
    let creds
    try {
      creds = credentialsFrom(body)
    } catch (error) {
      const { status, body: payload } = errorBody(error)
      return res.status(status).json(payload)
    }
    logRun(req, 'sync', creds.username)
    const base = baseUrlFor(config, req)
    const signal = abortOnClose(req, res)
    if (!stream) {
      try {
        const result = await service.sync({ ...creds, commands: body.commands, flags: body.flags, fresh: body.fresh === true, signal })
        const status = result.errorKind ? kindInfo(result.errorKind).status : 200
        return res.status(status).json(absolutize(result, base))
      } catch (error) {
        const { status, body: payload } = errorBody(error)
        return res.status(status).json(payload)
      }
    }
    res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
    res.flushHeaders()
    const line = payload => res.write(`${JSON.stringify(payload)}\n`)
    try {
      const result = await service.sync({
        ...creds,
        commands: body.commands,
        flags: body.flags,
        fresh: body.fresh === true,
        signal,
        onEntry: entry => line({ type: 'entry', ...absolutize(entry, base) }),
      })
      line({ type: 'done', success: result.success, durationMs: result.durationMs, ...(result.errorKind ? { error: result.error, errorKind: result.errorKind } : {}) })
    } catch (error) {
      line({ type: 'error', ...errorBody(error).body })
    }
    res.end()
  }
  app.post('/sync', auth, vtopLimiter, syncHandler)
  app.post('/vtop-sync', auth, vtopLimiter, syncHandler)

  // Legacy course-page interactive API.
  app.post(
    '/vtop-interactive',
    auth,
    vtopLimiter,
    handle(async req => {
      const body = req.body || {}
      const creds = credentialsFrom(body)
      logRun(req, 'course-page(legacy)', creds.username)
      return startLegacyWorkflow(service, { ...creds, flags: body.flags })
    })
  )
  app.post(
    '/vtop-interactive-continue',
    auth,
    vtopLimiter,
    handle(async req => {
      const body = req.body || {}
      if (!body.sessionData || body.selection === undefined || body.selection === '') {
        throw new ValidationError('Missing required fields: sessionData, selection', 'sessionData')
      }
      const password = resolvePassword(body, { logger })
      return continueLegacyWorkflow(service, {
        username: body.username,
        password,
        sessionData: body.sessionData,
        selection: body.selection,
      })
    })
  )

  app.get('/stats', auth, (req, res) => res.json({ ...service.stats(), cli: latestJson.status() }))

  // ------------------------------------------------------------------ MCP (OAuth-protected)
  const { setupMcpOAuth } = require('./oauth')
  const oauth = setupMcpOAuth(app)
  const mcp = require('./mcp/server').createMcpHandlers({ service, catalog, config, logger, requestContext, baseUrlFor })
  const protectMcp = oauth && oauth.authMiddleware ? [oauth.authMiddleware] : config.authDisabled ? [] : [auth]
  app.all('/mcp', ...protectMcp, (req, res) =>
    requestContext.run({ baseUrl: baseUrlFor(config, req) }, () => mcp.handleMcpRequest(req, res)).catch(error => {
      logger.error('[mcp] handler error', error)
      if (!res.headersSent) res.status(500).json({ error: 'MCP handler failed' })
    })
  )
  app.post('/mcp/messages', ...protectMcp, (req, res) =>
    requestContext.run({ baseUrl: baseUrlFor(config, req) }, () => mcp.handleSseMessagePost(req, res)).catch(error => {
      logger.error('[mcp] SSE message error', error)
      if (!res.headersSent) res.status(500).send('SSE message handler failed')
    })
  )

  app.get('/', (req, res) => res.sendFile('index.html', { root: path.join(__dirname, '..', 'public') }))

  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'Invalid JSON body', errorKind: 'invalid_input' })
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ success: false, error: 'Request body too large', errorKind: 'invalid_input' })
    }
    logger.error('Unhandled error', err)
    res.status(500).json({ success: false, error: 'Internal server error', errorKind: 'internal_error' })
  })
  app.use((req, res) => res.status(404).json({ success: false, error: 'Not found', message: `Path ${req.path} not found` }))

  return {
    app,
    service,
    catalog,
    latestJson,
    files,
    scheduler,
    closeMcpSessions: () => mcp.closeMcpSessions(),
    setShuttingDown() {
      shuttingDown = true
    },
    async start(port = config.port, host) {
      await files.init()
      const server = await new Promise((resolve, reject) => {
        const srv = app.listen(port, host, error => (error ? reject(error) : resolve(srv)))
      })
      const address = server.address()
      latestJson.setLocalUrl(`http://127.0.0.1:${address.port}/internal/cli-top/latest.json`)
      await latestJson.start()
      return server
    },
    stop() {
      latestJson.stop()
      files.stop()
    },
  }
}

module.exports = { createProxy, finalize }
