const express = require('express')
const path = require('path')
const fs = require('fs')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const { randomUUID } = require('crypto')
const {
  capabilityManifest,
  COMMAND_MAPPING,
  INTERACTIVE_COMMANDS,
  BINARY_PATH,
  CLI_TIMEOUT,
  GLOBAL_RATE_LIMIT,
  VTOP_RATE_LIMIT,
  ALLOWED_ORIGINS,
} = require('./src/config')
const { runCommand } = require('./src/cli-runner')
const { sanitizeErrorForResponse } = require('./src/utils/errors')
const { normalizeResultPayload } = require('./src/utils/shape')
const { normalizeFlagsForCommand } = require('./src/utils/flags')
const { resolvePassword } = require('./src/utils/credentials')
const { handleMcpRequest, handleSseMessagePost } = require('./src/mcp/server')
const {
  executeInteractiveCoursePageWorkflow,
  getNextStep,
  tempFiles,
} = require('./src/workflows/course-page')
require('dotenv').config()

const app = express()

const maskIdentifier = value => {
  if (!value || typeof value !== 'string') return 'unknown'
  if (value.length <= 4) return value
  return `${value.slice(0, 2)}***${value.slice(-2)}`
}

const scrubFlags = flags => {
  if (!flags) return {}
  const copy = { ...flags }
  if (copy.password) copy.password = '***'
  if (copy.encryptedPassword) copy.encryptedPassword = '***'
  return copy
}

const logRequest = (scope, id, message, meta = undefined) => {
  const prefix = `[${scope}:${id}]`
  if (meta !== undefined) {
    console.log(prefix, message, meta)
  } else {
    console.log(prefix, message)
  }
}

const logError = (scope, id, message, error) => {
  const prefix = `[${scope}:${id}]`
  console.error(prefix, message, error)
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
)

app.use(express.json({ limit: '10mb' }))

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: GLOBAL_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(globalLimiter)

const allowedOrigins = ALLOWED_ORIGINS

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id')
  res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})

const vtopLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: VTOP_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
})

app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`)
  next()
})

const SUPPORTED_COMMANDS = capabilityManifest().map(capability => capability.command)

app.get('/health', (req, res) => {
  const binaryExists = fs.existsSync(BINARY_PATH)
  res.json({
    status: binaryExists ? 'ok' : 'missing-binary',
    binary: BINARY_PATH,
    commands: SUPPORTED_COMMANDS.length,
  })
})

app.post('/vtop', vtopLimiter, async (req, res) => {
  const requestId = randomUUID().slice(0, 8)
  const startedAt = Date.now()
  const { command, username, password, encryptedPassword, sessionKey, flags } = req.body

  if (!command || !username) {
    return res.status(400).json({
      error: 'Missing required fields: command, username',
    })
  }

  if (!SUPPORTED_COMMANDS.includes(command)) {
    return res.status(400).json({
      error: 'Unsupported command',
      supportedCommands: SUPPORTED_COMMANDS,
    })
  }

  let finalPassword
  try {
    finalPassword = resolvePassword({ password, encryptedPassword, sessionKey })
  } catch (error) {
    return res.status(400).json({
      error: error.message || 'Failed to resolve credentials',
    })
  }

  const { sanitizedFlags } = normalizeFlagsForCommand(command, flags || {})
  logRequest(
    'vtop',
    requestId,
    `command=${command} user=${maskIdentifier(username)} flags=${JSON.stringify(scrubFlags(
      sanitizedFlags
    ))} encrypted=${Boolean(encryptedPassword)} password=${Boolean(password)}`
  )

  try {
    const result = await runCommand(username, finalPassword, command, sanitizedFlags)
    const shaped = normalizeResultPayload(result, command, sanitizedFlags)
    logRequest(
      'vtop',
      requestId,
      `success command=${command} duration=${Date.now() - startedAt}ms`,
      { keys: Object.keys(shaped) }
    )

    if (!shaped.success) {
      const statusCode = shaped.requiresCredentials ? 401 : 400
      return res.status(statusCode).json(shaped)
    }

    res.json(shaped)
  } catch (error) {
    logError('vtop', requestId, `failed command=${command}`, error.error || error.message || error)
    const sanitizedError = sanitizeErrorForResponse(error, command)
    return res.status(500).json(sanitizedError)
  }
})

app.post('/vtop-interactive', vtopLimiter, async (req, res) => {
  const requestId = randomUUID().slice(0, 8)
  const startedAt = Date.now()
  const { command, step, username, password, encryptedPassword, sessionKey, flags, sessionData } =
    req.body

  if (!command || !step || !username) {
    return res.status(400).json({
      error: 'Missing required fields: command, step, username',
    })
  }

  let finalPassword
  try {
    finalPassword = resolvePassword({ password, encryptedPassword, sessionKey })
  } catch (error) {
    return res.status(400).json({
      error: error.message || 'Failed to resolve credentials',
    })
  }

  logRequest(
    'vtop-interactive',
    requestId,
    `command=${command} step=${step} user=${maskIdentifier(username)} flags=${JSON.stringify(
      scrubFlags(flags)
    )}`
  )

  try {
    const { sanitizedFlags } = normalizeFlagsForCommand(command, flags || {})
    const result = await executeInteractiveCoursePageWorkflow(
      username,
      finalPassword,
      step,
      sanitizedFlags,
      sessionData
    )
    logRequest(
      'vtop-interactive',
      requestId,
      `success command=${command} step=${step} duration=${Date.now() - startedAt}ms`
    )
    res.json(result)
  } catch (error) {
    logError(
      'vtop-interactive',
      requestId,
      `failed command=${command} step=${step}`,
      error.error || error.message || error
    )
    const sanitizedError = sanitizeErrorForResponse(error, `${command}-${step}`)
    return res.status(500).json(sanitizedError)
  }
})

app.post('/vtop-interactive-continue', vtopLimiter, async (req, res) => {
  const requestId = randomUUID().slice(0, 8)
  const startedAt = Date.now()
  const { sessionData, selection, step } = req.body

  if (!sessionData || !selection || !step) {
    return res.status(400).json({
      error: 'Missing required fields: sessionData, selection, step',
    })
  }

  let parsedSession
  try {
    parsedSession = JSON.parse(sessionData)
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid session data format',
    })
  }

  if (!parsedSession.username) {
    return res.status(400).json({
      error: 'Invalid session: missing username',
    })
  }

  let nextStep = getNextStep(step)
  let updatedFlags = { ...parsedSession.flags }

  if (step === 'semester') {
    updatedFlags.semester = parseInt(selection)
  } else if (step === 'course') {
    updatedFlags.course = parseInt(selection)
  } else if (step === 'faculty') {
    updatedFlags.faculty = parseInt(selection)
  } else if (step === 'materials') {
    updatedFlags.materialSelection = selection
    nextStep = 'download'
  }

  const password = req.body.password || req.body.encryptedPassword
  if (!password) {
    return res.status(400).json({
      error: 'Password required to continue workflow',
    })
  }

  logRequest(
    'vtop-interactive',
    requestId,
    `continue from ${step} -> ${nextStep} selection=${selection} user=${maskIdentifier(
      parsedSession.username
    )}`
  )

  try {
    const result = await executeInteractiveCoursePageWorkflow(
      parsedSession.username,
      password,
      nextStep,
      updatedFlags,
      JSON.stringify(parsedSession)
    )
    logRequest(
      'vtop-interactive',
      requestId,
      `continue success step=${step} duration=${Date.now() - startedAt}ms`
    )
    res.json(result)
  } catch (error) {
    logError(
      'vtop-interactive',
      requestId,
      `continue failed step=${step}`,
      error.error || error.message || error
    )
    const sanitizedError = sanitizeErrorForResponse(error, `${step}-continue`)
    return res.status(500).json(sanitizedError)
  }
})

app.get('/download/:fileId', (req, res) => {
  const { fileId } = req.params

  const fileInfo = tempFiles.get(fileId)
  if (!fileInfo) {
    return res.status(404).json({ error: 'File not found or expired' })
  }

  if (Date.now() > fileInfo.expiry) {
    tempFiles.delete(fileId)
    return res.status(410).json({ error: 'File has expired' })
  }

  if (!fs.existsSync(fileInfo.path)) {
    tempFiles.delete(fileId)
    return res.status(404).json({ error: 'File no longer available' })
  }

  res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`)
  res.setHeader('Content-Type', 'application/octet-stream')

  const fileStream = fs.createReadStream(fileInfo.path)
  fileStream.pipe(res)

  fileStream.on('error', error => {
    console.error('Error streaming file:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error downloading file' })
    }
  })
})

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: require('./package.json').version,
    environment: process.env.NODE_ENV || 'development',
  })
})

app.get('/commands', (req, res) => {
  const manifest = capabilityManifest()
  const mapping = Object.fromEntries(COMMAND_MAPPING())
  const interactive = Object.fromEntries(INTERACTIVE_COMMANDS())
  res.json({
    commands: SUPPORTED_COMMANDS,
    mapping,
    interactive,
    description: 'Available VTOP commands with interactive handling support',
    version: require('./package.json').version,
    supportedFlags: {
      semester: 'Semester number for semester-specific commands',
      course: 'Course selection number for course-specific commands',
      faculty: 'Faculty selection number for faculty-specific commands',
      classGroup: 'Class group selection number for calendar commands',
      fuzzyIndex: 'Fuzzy search index for course-page commands',
    },
  })
})

app.all('/mcp', async (req, res) => {
  try {
    await handleMcpRequest(req, res)
  } catch (error) {
    console.error('[mcp] handler error:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP handler failed', message: error.message })
    }
  }
})

app.post('/mcp/messages', async (req, res) => {
  try {
    await handleSseMessagePost(req, res)
  } catch (error) {
    console.error('[mcp] SSE message handler error:', error)
    if (!res.headersSent) {
      res.status(500).send('SSE message handler failed')
    }
  }
})

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
  })
})

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Path ${req.path} not found`,
  })
})

const PORT = process.env.PORT || 3001

function performStartupChecks() {
  console.log(`CLI Path: ${BINARY_PATH}`)

  if (!fs.existsSync(BINARY_PATH)) {
    console.error(`CLI executable not found at: ${BINARY_PATH}`)
    console.error('Please ensure the executable is available in the correct location.')
    process.exit(1)
  }

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(BINARY_PATH, '755')
      console.log('Executable permissions set for CLI tool')
    } catch (chmodErr) {
      console.warn('Could not set executable permissions:', chmodErr.message)
    }
  }

  console.log('CLI executable found and configured')
}

performStartupChecks()

const server = app.listen(PORT, () => {
  console.log(`Proxy Service running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  server.close(() => {
    console.log('Process terminated')
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully')
  server.close(() => {
    console.log('Process terminated')
  })
})
