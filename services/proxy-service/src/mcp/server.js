const { randomUUID } = require('crypto')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js')
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js')
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js')
const { z } = require('zod')
const pkg = require('../../package.json')
const { capabilityManifest } = require('../config')
const { runCommand } = require('../cli-runner')
const { normalizeResultPayload } = require('../utils/shape')
const { normalizeFlagsForCommand } = require('../utils/flags')
const { resolvePassword } = require('../utils/credentials')
const {
  executeInteractiveCoursePageWorkflow,
  getNextStep,
} = require('../workflows/course-page')

function coerceFlags(flags) {
  if (!flags) return {}
  if (Array.isArray(flags)) return {}
  if (typeof flags === 'object') return flags
  return {}
}

function createServer() {
  const instance = new McpServer({
    name: 'vtop-mcp',
    version: pkg.version,
  })

  registerTools(instance)
  return instance
}

const server = createServer()
const transports = new Map()
const sseTransports = new Map()
const SSE_MESSAGES_PATH = '/mcp/messages'

function registerTools(targetServer) {
  const manifest = capabilityManifest()

  const flagsSchema = z
    .preprocess(value => {
      if (!value) return value
      if (Array.isArray(value)) {
        return {}
      }
      return value
    }, z.record(z.any()))

  const baseFields = {
    username: z.string().min(1, 'username required'),
    password: z.string().optional(),
    encryptedPassword: z.string().optional(),
    sessionKey: z.string().optional(),
    flags: flagsSchema.optional(),
  }

  const ensurePassword = data => Boolean(data.password || (data.encryptedPassword && data.sessionKey))

  const baseObjectSchema = z.object(baseFields)
  const baseInputSchema = baseObjectSchema.refine(ensurePassword, 'Provide password or encryptedPassword + sessionKey')

  manifest.forEach(capability => {
    targetServer.registerTool(
      capability.command,
      {
        title: capability.title || capability.command,
        description: capability.description || `Execute ${capability.command} via VTOP proxy`,
        inputSchema: baseInputSchema,
      },
      async ({ username, password, encryptedPassword, sessionKey, flags }) => {
        const finalPassword = resolvePassword({ password, encryptedPassword, sessionKey })
        const normalizedFlagsInput = coerceFlags(flags)
        const { sanitizedFlags } = normalizeFlagsForCommand(capability.command, normalizedFlagsInput)
        const result = await runCommand(username, finalPassword, capability.command, sanitizedFlags)
        const shaped = normalizeResultPayload(result, capability.command, sanitizedFlags)

        if (!shaped.success) {
          throw new Error(shaped.error || `Failed to execute ${capability.command}`)
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(shaped, null, 2) }],
          structuredContent: shaped,
        }
      }
    )
  })

  registerInteractiveTools(targetServer, baseObjectSchema, ensurePassword)
}

function registerInteractiveTools(targetServer, baseSchema, ensurePassword) {
  const workflowSteps = ['semester', 'course', 'faculty', 'materials', 'download']
  const interactiveInput = baseSchema
    .extend({
      step: z.enum(workflowSteps).optional(),
      sessionData: z.string().optional(),
    })
    .refine(ensurePassword, 'Provide password or encryptedPassword + sessionKey')

  const continueInput = z
    .object({
      sessionData: z.string(),
      selection: z.string(),
      step: z.enum(['semester', 'course', 'faculty', 'materials']),
      password: z.string().optional(),
      encryptedPassword: z.string().optional(),
      sessionKey: z.string().optional(),
    })
    .refine(ensurePassword, 'Provide password or encryptedPassword + sessionKey')

  targetServer.registerTool(
    'course-page-interactive',
    {
      title: 'course-page interactive',
      description: 'Run the multi-step course materials workflow with automatic prompts.',
      inputSchema: interactiveInput,
    },
    async ({
      username,
      password,
      encryptedPassword,
      sessionKey,
      step = 'semester',
      flags,
      sessionData,
    }) => {
      const finalPassword = resolvePassword({ password, encryptedPassword, sessionKey })
      const normalizedFlagsInput = coerceFlags(flags)
      const { sanitizedFlags } = normalizeFlagsForCommand('course-page', normalizedFlagsInput)
      const result = await executeInteractiveCoursePageWorkflow(
        username,
        finalPassword,
        step,
        sanitizedFlags,
        sessionData
      )

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    }
  )

  targetServer.registerTool(
    'course-page-interactive-continue',
    {
      title: 'course-page interactive continue',
      description: 'Advance the interactive workflow after the user selects an option.',
      inputSchema: continueInput,
    },
    async ({ sessionData, selection, step, password, encryptedPassword, sessionKey }) => {
      let parsedSession
      try {
        parsedSession = JSON.parse(sessionData)
      } catch (error) {
        throw new Error('Invalid sessionData JSON')
      }

      if (!parsedSession?.username) {
        throw new Error('Session missing username')
      }

      const finalPassword = resolvePassword({ password, encryptedPassword, sessionKey })
      const updatedFlags = { ...(parsedSession.flags || {}) }
      let nextStep = getNextStep(step)

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

      const result = await executeInteractiveCoursePageWorkflow(
        parsedSession.username,
        finalPassword,
        nextStep,
        updatedFlags,
        sessionData
      )

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }
    }
  )
}

async function handleMcpRequest(req, res) {
  const method = req.method.toUpperCase()
  const wantsSse =
    method === 'GET' &&
    !req.headers['mcp-session-id'] &&
    req.headers.accept?.includes('text/event-stream')

  if (wantsSse) {
    return handleSseStream(req, res)
  }

  if (method === 'POST') {
    return handlePostRequest(req, res)
  }
  if (method === 'GET' || method === 'DELETE') {
    return handleSessionSideRequest(req, res)
  }

  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: `Method ${req.method} not allowed`,
    },
    id: null,
  })
}

async function handlePostRequest(req, res) {
  const sessionId = req.headers['mcp-session-id']
  let transport = sessionId ? transports.get(sessionId) : undefined

  if (!transport) {
    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: expected initialize call or valid session',
        },
        id: req.body?.id ?? null,
      })
      return
    }

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: newSessionId => {
        transports.set(newSessionId, transport)
      },
    })

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId)
      }
    }

    await server.connect(transport)
  }

  try {
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    console.error('[mcp] streamable transport error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: req.body?.id ?? null,
      })
    }
  }
}

async function handleSessionSideRequest(req, res) {
  const sessionId = req.headers['mcp-session-id']
  const transport = sessionId ? transports.get(sessionId) : undefined

  if (!transport) {
    res.status(404).send('Invalid or missing MCP session')
    return
  }

  try {
    await transport.handleRequest(req, res)
  } catch (error) {
    console.error('[mcp] session request error:', error)
    if (!res.headersSent) {
      res.status(500).send('MCP session handling failed')
    }
  }

  if (req.method.toUpperCase() === 'DELETE') {
    transport.close()
    transports.delete(sessionId)
  }
}

async function handleSseStream(req, res) {
  const transport = new SSEServerTransport(SSE_MESSAGES_PATH, res)
  sseTransports.set(transport.sessionId, transport)

  transport.onclose = () => {
    sseTransports.delete(transport.sessionId)
  }

  try {
    const sseServer = createServer()
    await sseServer.connect(transport)
  } catch (error) {
    console.error('[mcp] SSE stream error:', error)
    sseTransports.delete(transport.sessionId)
    if (!res.headersSent) {
      res.status(500).send('Failed to start SSE transport')
    }
  }
}

async function handleSseMessagePost(req, res) {
  const { sessionId } = req.query
  if (!sessionId || !sseTransports.has(sessionId)) {
    res.status(404).send('Unknown SSE session')
    return
  }

  const transport = sseTransports.get(sessionId)
  try {
    await transport.handlePostMessage(req, res, req.body)
  } catch (error) {
    console.error('[mcp] SSE message error:', error)
    if (!res.headersSent) {
      res.status(500).send('Failed to handle SSE message')
    }
  }
}

module.exports = {
  handleMcpRequest,
  handleSseMessagePost,
}
