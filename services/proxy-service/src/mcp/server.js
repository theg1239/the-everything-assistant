'use strict'

const { randomUUID } = require('crypto')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js')
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js')
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js')
const { z } = require('zod')
const { resolvePassword } = require('../credentials')
const { absolutize } = require('../http/respond')
const { startLegacyWorkflow, continueLegacyWorkflow } = require('../workflows/course-page')

const SSE_MESSAGES_PATH = '/mcp/messages'

const WORKFLOW_HINT =
  'If the result status is needs_selection / needs_input / needs_confirmation, either ask the user or, when their request already identifies the answer, call vtop-continue with { continuation, choice } (choice = option id, several ids like "1,3-4" for multi-select, free text to match by name, or "confirm"/"cancel").'

function createMcpHandlers({ service, catalog, config, logger, requestContext }) {
  const oauthEnabled = process.env.MCP_OAUTH_ENABLED !== 'false'
  const credentialFields = oauthEnabled
    ? {}
    : {
        username: z.string().min(1).describe('VTOP registration number'),
        password: z.string().optional().describe('VTOP password'),
        encryptedPassword: z.string().optional().describe('DEPRECATED legacy cipher'),
        sessionKey: z.string().optional().describe('DEPRECATED legacy cipher key'),
      }

  function credentialsFor(input, extra) {
    const linked = extra && extra.authInfo && extra.authInfo.credentials
    const username = input.username || (linked && linked.username)
    if (input.password || input.encryptedPassword) {
      return { username, password: resolvePassword(input, { logger }) }
    }
    if (linked) return { username, password: resolvePassword(linked, { logger }) }
    return { username, password: resolvePassword({}, { logger }) }
  }

  function toToolResult(result) {
    const store = requestContext.getStore()
    const { httpStatus, ...body } = absolutize(result, (store && store.baseUrl) || config.publicBaseUrl)
    return {
      content: [{ type: 'text', text: JSON.stringify(body) }],
      structuredContent: body,
      isError: body.success === false,
    }
  }

  async function guarded(fn) {
    try {
      return toToolResult(await fn())
    } catch (error) {
      return toToolResult({ success: false, status: 'error', error: error.message, errorKind: error.kind || 'internal_error' })
    }
  }

  function registerTools(server) {
    const flagsSchema = z
      .preprocess(value => (Array.isArray(value) ? {} : value), z.record(z.string(), z.unknown()))
      .optional()
      .describe('Command flags (see params in the description)')
    const selectSchema = z
      .record(z.string(), z.string())
      .optional()
      .describe('Natural-language hints per step, e.g. { "course": "CSE1001", "faculty": "anuj", "materials": "module 2" }')

    for (const entry of catalog.list()) {
      if (entry.command === 'sync') continue
      const params = entry.params.length
        ? ` Params: ${entry.params.map(name => `${name} (${catalog.paramSpec(name).type})`).join(', ')}.`
        : ''
      const steps = entry.steps.length ? ` Steps: ${entry.steps.map(step => step.label).join(' -> ')}. ${WORKFLOW_HINT}` : ''
      const write = entry.writeWhen ? ` Setting ${entry.writeWhen}=true performs a write and requires confirmation.` : ''
      server.registerTool(
        entry.command,
        {
          title: entry.title,
          description: `${entry.description}${params}${steps}${write}`,
          inputSchema: z.object({
            ...credentialFields,
            flags: flagsSchema,
            select: selectSchema,
            confirm: z.boolean().optional().describe('Explicit user confirmation for write actions'),
            fresh: z.boolean().optional().describe('Bypass the short-lived result cache'),
          }),
        },
        (input, extra) =>
          guarded(async () => {
            const creds = credentialsFor(input, extra)
            return service.execute({
              command: entry.command,
              ...creds,
              flags: input.flags,
              select: input.select,
              confirm: input.confirm === true,
              fresh: input.fresh === true,
            })
          })
      )
    }

    server.registerTool(
      'vtop-continue',
      {
        title: 'continue a VTOP workflow',
        description: `Continue a multi-step VTOP command after a needs_* result. ${WORKFLOW_HINT}`,
        inputSchema: z.object({
          ...credentialFields,
          continuation: z.string().min(1),
          choice: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
          confirm: z.boolean().optional(),
        }),
      },
      (input, extra) =>
        guarded(async () => {
          const creds = credentialsFor(input, extra)
          return service.continueWorkflow({ continuation: input.continuation, choice: input.choice, confirm: input.confirm === true, ...creds })
        })
    )

    server.registerTool(
      'sync',
      {
        title: 'hub sync',
        description: 'Refresh several read-only commands with one VTOP login. Cached results are returned instantly.',
        inputSchema: z.object({
          ...credentialFields,
          commands: z.array(z.string()).optional(),
          flags: flagsSchema,
          fresh: z.boolean().optional(),
        }),
      },
      (input, extra) =>
        guarded(async () => {
          const creds = credentialsFor(input, extra)
          const result = await service.sync({ ...creds, commands: input.commands, flags: input.flags, fresh: input.fresh === true })
          return { ...result, success: result.success }
        })
    )

    // Legacy course-page workflow tools (kept for existing MCP clients).
    server.registerTool(
      'course-page-interactive',
      {
        title: 'course-page interactive (legacy)',
        description: `Deprecated: use course-page + vtop-continue. Runs the course materials workflow.`,
        inputSchema: z.object({
          ...credentialFields,
          step: z.string().optional(),
          flags: flagsSchema,
          sessionData: z.string().optional(),
        }),
      },
      (input, extra) =>
        guarded(async () => startLegacyWorkflow(service, { ...credentialsFor(input, extra), flags: input.flags, sessionData: input.sessionData }))
    )
    server.registerTool(
      'course-page-interactive-continue',
      {
        title: 'course-page interactive continue (legacy)',
        description: 'Deprecated: use vtop-continue.',
        inputSchema: z.object({
          ...credentialFields,
          sessionData: z.string(),
          selection: z.string(),
          step: z.string().optional(),
        }),
      },
      (input, extra) =>
        guarded(async () =>
          continueLegacyWorkflow(service, {
            ...credentialsFor(input, extra),
            sessionData: input.sessionData,
            selection: input.selection,
            step: input.step,
          })
        )
    )
  }

  function createServer() {
    const server = new McpServer({ name: 'vtop-mcp', version: config.version })
    registerTools(server)
    return server
  }

  const transports = new Map()
  const sseTransports = new Map()

  async function handlePostRequest(req, res) {
    const sessionId = req.headers['mcp-session-id']
    let transport = sessionId ? transports.get(sessionId) : undefined
    if (!transport) {
      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: expected initialize call or valid session' },
          id: (req.body && req.body.id) ?? null,
        })
        return
      }
      const server = createServer()
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: id => transports.set(id, transport),
      })
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId)
        server.close().catch(() => {})
      }
      await server.connect(transport)
    }
    await transport.handleRequest(req, res, req.body)
  }

  async function handleSessionSideRequest(req, res) {
    const sessionId = req.headers['mcp-session-id']
    const transport = sessionId ? transports.get(sessionId) : undefined
    if (!transport) return res.status(404).send('Invalid or missing MCP session')
    await transport.handleRequest(req, res)
    if (req.method.toUpperCase() === 'DELETE') {
      transports.delete(sessionId)
      await transport.close()
    }
  }

  async function handleSseStream(req, res) {
    const transport = new SSEServerTransport(SSE_MESSAGES_PATH, res)
    sseTransports.set(transport.sessionId, transport)
    transport.onclose = () => sseTransports.delete(transport.sessionId)
    await createServer().connect(transport)
  }

  async function handleMcpRequest(req, res) {
    const method = req.method.toUpperCase()
    if (method === 'GET' && !req.headers['mcp-session-id'] && (req.headers.accept || '').includes('text/event-stream')) {
      return handleSseStream(req, res)
    }
    if (method === 'POST') return handlePostRequest(req, res)
    if (method === 'GET' || method === 'DELETE') return handleSessionSideRequest(req, res)
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: `Method ${req.method} not allowed` }, id: null })
  }

  async function handleSseMessagePost(req, res) {
    const transport = sseTransports.get(req.query.sessionId)
    if (!transport) return res.status(404).send('Unknown SSE session')
    await transport.handlePostMessage(req, res, req.body)
  }

  async function closeMcpSessions() {
    const open = [...transports.values(), ...sseTransports.values()]
    transports.clear()
    sseTransports.clear()
    const results = await Promise.allSettled(open.map(transport => transport.close()))
    results
      .filter(result => result.status === 'rejected')
      .forEach(result => logger.warn('[mcp] error closing session during shutdown:', result.reason))
    return open.length
  }

  return { handleMcpRequest, handleSseMessagePost, closeMcpSessions }
}

module.exports = { createMcpHandlers }
