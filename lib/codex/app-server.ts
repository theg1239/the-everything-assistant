import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Writable } from 'node:stream'
import { asSchema, type FlexibleSchema } from 'ai'
import * as z from 'zod'
import {
  invalidateChatgptStatus,
  isCodexConfigured,
  readCachedChatgptConnected,
  rememberChatgptConnected,
} from './status-cache'

export { invalidateChatgptStatus, isCodexConfigured } from './status-cache'

/** Any non-null object (arrays included), for reading untrusted JSON-RPC/proxy payloads. */
const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readObject = (value: unknown): Record<string, unknown> | null =>
  isObjectRecord(value) ? value : null

type JsonRpcError = {
  code?: number
  message: string
  data?: unknown
}

type JsonRpcRequest = {
  id: number
  method: string
  params?: unknown
}

type JsonRpcResponse = {
  id: number
  result?: unknown
  error?: JsonRpcError
}

type JsonRpcNotification = {
  method: string
  params?: unknown
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

type AccountRateLimitWindow = {
  usedPercent: number | null
  remainingPercent: number | null
  windowDurationMins: number | null
  resetsAt: number | null
}

type AccountPlanUsage = {
  limitId: string | null
  limitName: string | null
  planType: string | null
  primary: AccountRateLimitWindow | null
  secondary: AccountRateLimitWindow | null
  hasCredits: boolean | null
  unlimitedCredits: boolean | null
  creditsBalance: string | null
}

type JsonRpcServerRequest = {
  id: number
  method: string
  params?: unknown
}

class JsonRpcConnection extends EventEmitter {
  private buffer = ''
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()

  constructor(
    private readonly stdin: Writable,
    stdout: NodeJS.ReadableStream,
    stderr?: NodeJS.ReadableStream
  ) {
    super()

    stdout.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      this.handleChunk(text)
    })

    stdout.on('end', () => {
      this.dispose(new Error('codex app-server closed stdout'))
      this.emit('close')
    })

    stdout.on('error', (error: Error) => {
      this.dispose(error)
      this.emit('error', error)
    })

    stderr?.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      const trimmed = text.trim()
      if (trimmed) {
        this.emit('stderr', trimmed)
      }
    })
  }

  sendRequest(method: string, params?: unknown, timeoutMs = 30_000): Promise<unknown> {
    const id = this.nextId++
    this.writeMessage({ id, method, params } satisfies JsonRpcRequest)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`codex app-server request timed out: ${method}`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timer })
    })
  }

  sendNotification(method: string, params?: unknown): void {
    this.writeMessage({ method, params } satisfies JsonRpcNotification)
  }

  sendResponse(id: number, result?: unknown, error?: JsonRpcError): void {
    this.writeMessage({ id, result, error } satisfies JsonRpcResponse)
  }

  dispose(error?: Error): void {
    if (!this.pending.size) return
    const reason = error ?? new Error('codex app-server connection closed')
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer)
      pending.reject(reason)
      this.pending.delete(id)
    }
  }

  private handleChunk(text: string): void {
    this.buffer += text
    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)
      if (line) {
        this.handleLine(line)
      }
      newlineIndex = this.buffer.indexOf('\n')
    }
  }

  private handleLine(line: string): void {
    let payload: unknown
    try {
      payload = JSON.parse(line)
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
      return
    }

    const message = readObject(payload)
    if (!message) {
      return
    }

    if (typeof message.id === 'number' && typeof message.method === 'string') {
      this.emit('serverRequest', {
        id: message.id,
        method: message.method,
        params: message.params,
      } satisfies JsonRpcServerRequest)
      return
    }

    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (!pending) {
        return
      }
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      const errorMessage = readObject(message.error)?.message
      if (typeof errorMessage === 'string' && errorMessage) {
        pending.reject(new Error(errorMessage))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (typeof message.method === 'string') {
      this.emit('notification', {
        method: message.method,
        params: message.params,
      } satisfies JsonRpcNotification)
    }
  }

  private writeMessage(message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): void {
    this.stdin.write(`${JSON.stringify(message)}\n`)
  }
}

const parseJsonArgs = (value: string | undefined): string[] | null => {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : null
  } catch {
    return null
  }
}

const parseSpaceArgs = (value: string | undefined): string[] => {
  if (!value) {
    return []
  }
  return value
    .split(/\s+/u)
    .map(item => item.trim())
    .filter(Boolean)
}

const sanitizeCodexArgsForReadOnly = (args: string[], source: string): string[] => {
  const sanitized: string[] = []

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === undefined) continue
    const lower = arg.toLowerCase()

    const dropCurrentAndMaybeValue = (reason: string) => {
      console.warn(`[codex-app-server] removed ${arg} from ${source} (${reason})`)
      const next = args[i + 1]
      if (next && !next.startsWith('-')) {
        i += 1
      }
    }

    if (
      lower === '--dangerously-bypass-approvals-and-sandbox' ||
      lower === '--yolo' ||
      lower === '--full-auto'
    ) {
      console.warn(`[codex-app-server] removed ${arg} from ${source} (unsafe execution mode)`)
      continue
    }

    if (lower === '--sandbox' || lower === '-s') {
      dropCurrentAndMaybeValue('sandbox is hard-enforced as read-only by app-server wrapper')
      continue
    }

    if (
      lower.startsWith('--sandbox=') ||
      lower === '--ask-for-approval' ||
      lower.startsWith('--ask-for-approval=') ||
      lower === '-a'
    ) {
      dropCurrentAndMaybeValue(
        'approval policy is hard-enforced as never by app-server wrapper'
      )
      continue
    }

    sanitized.push(arg)
  }

  return sanitized
}

const sanitizePathSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_')

const readString = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const readNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const readBoolean = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)

const readAuthMode = (value: unknown): ChatgptStatus['authMode'] =>
  value === 'apiKey' || value === 'chatgpt' || value === 'chatgptAuthTokens' ? value : null

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

const parseRateLimitWindow = (value: unknown): AccountRateLimitWindow | null => {
  const window = readObject(value)
  if (!window) return null

  const usedPercentRaw = readNumber(window.usedPercent) ?? readNumber(window.used_percent)
  const usedPercent = usedPercentRaw === null ? null : clampPercent(usedPercentRaw)
  const windowDurationMins =
    readNumber(window.windowDurationMins) ?? readNumber(window.window_duration_mins)
  const resetsAt = readNumber(window.resetsAt) ?? readNumber(window.resets_at)

  if (usedPercent === null && windowDurationMins === null && resetsAt === null) {
    return null
  }

  return {
    usedPercent,
    remainingPercent: usedPercent === null ? null : clampPercent(100 - usedPercent),
    windowDurationMins,
    resetsAt,
  }
}

const parsePlanUsageSnapshot = (value: unknown): AccountPlanUsage | null => {
  const snapshot = readObject(value)
  if (!snapshot) return null

  const primary = parseRateLimitWindow(snapshot.primary)
  const secondary = parseRateLimitWindow(snapshot.secondary)
  const credits = readObject(snapshot.credits)
  const limitId = readString(snapshot.limitId) ?? readString(snapshot.limit_id)
  const limitName = readString(snapshot.limitName) ?? readString(snapshot.limit_name)
  const planType = readString(snapshot.planType) ?? readString(snapshot.plan_type)
  const hasCredits = readBoolean(credits?.hasCredits) ?? readBoolean(credits?.has_credits)
  const unlimitedCredits = readBoolean(credits?.unlimited)
  const creditsBalance = readString(credits?.balance)

  if (
    !primary &&
    !secondary &&
    !limitId &&
    !limitName &&
    !planType &&
    hasCredits === null &&
    unlimitedCredits === null &&
    !creditsBalance
  ) {
    return null
  }

  return {
    limitId,
    limitName,
    planType,
    primary,
    secondary,
    hasCredits,
    unlimitedCredits,
    creditsBalance,
  }
}

const pickPlanUsageSnapshot = (value: unknown): AccountPlanUsage | null => {
  const payload = readObject(value)
  if (!payload) return null

  const byLimitId =
    readObject(payload.rateLimitsByLimitId) ?? readObject(payload.rate_limits_by_limit_id)
  if (byLimitId) {
    const codexSnapshot = byLimitId.codex
    const parsedCodex = parsePlanUsageSnapshot(codexSnapshot)
    if (parsedCodex) {
      return parsedCodex
    }

    for (const value of Object.values(byLimitId)) {
      const parsed = parsePlanUsageSnapshot(value)
      if (parsed) return parsed
    }
  }

  return parsePlanUsageSnapshot(payload.rateLimits ?? payload.rate_limits ?? null)
}

type SessionConfig = {
  codexBin: string
  codexArgs: string[]
  appServerArgs: string[]
  codexHomeRoot: string
  startupTimeoutMs: number
  requestTimeoutMs: number
  turnTimeoutMs: number
}

type ChatgptStatus = {
  available: boolean
  connected: boolean
  authMode: 'apiKey' | 'chatgpt' | 'chatgptAuthTokens' | null
  email: string | null
  planType: string | null
  planUsage: AccountPlanUsage | null
  pendingLoginId: string | null
  lastLoginError: string | null
  requiresOpenaiAuth: boolean | null
}

export type ChatgptLoginStartResult = {
  authUrl: string | null
  loginId: string | null
  status: ChatgptStatus
  loginMethod?: 'browser' | 'device'
  deviceCode?: string | null
  verificationUrl?: string | null
}

export type CodexTurnUsage = {
  totalTokens: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
}

export type RunChatgptTurnOptions = {
  prompt: string
  model?: string | null
  cwd?: string | null
  baseInstructions?: string | null
  developerInstructions?: string | null
  personality?: 'friendly' | 'pragmatic' | 'none' | null
  tools?: Record<string, unknown>
  toolExecutionMessages?: unknown[]
  onToolEvent?: (event: CodexToolEvent) => void
  onTextDelta?: (delta: string) => void
}

export type RunChatgptTurnResult = {
  threadId: string
  turnId: string
  model: string | null
  text: string
  usage: CodexTurnUsage | null
}

type DynamicToolCallContentItem =
  | { type: 'inputText'; text: string }
  | { type: 'inputImage'; imageUrl: string }

export type CodexToolEvent =
  | {
      phase: 'input-available'
      toolCallId: string
      toolName: string
      input: unknown
    }
  | {
      phase: 'output-available'
      toolCallId: string
      toolName: string
      input: unknown
      output: unknown
    }
  | {
      phase: 'output-error'
      toolCallId: string
      toolName: string
      input: unknown
      errorText: string
    }

type ExecutableTool = {
  description?: string
  inputSchema: FlexibleSchema<unknown>
  execute: (input: unknown, options: unknown) => unknown
}

/**
 * Tool records arrive as `Record<string, unknown>`; anything with an `execute`
 * function and an object/function `inputSchema` is treated as an AI SDK tool.
 */
const isExecutableTool = (value: unknown): value is ExecutableTool => {
  if (!value || typeof value !== 'object') return false
  const execute: unknown = Reflect.get(value, 'execute')
  const inputSchema: unknown = Reflect.get(value, 'inputSchema')
  return (
    typeof execute === 'function' &&
    !!inputSchema &&
    (typeof inputSchema === 'object' || typeof inputSchema === 'function')
  )
}

type ActiveTurnContext = {
  tools: Map<string, ExecutableTool>
  toolExecutionMessages: unknown[]
  onToolEvent?: (event: CodexToolEvent) => void
}

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
  isObjectRecord(value) &&
  Symbol.asyncIterator in value &&
  typeof value[Symbol.asyncIterator] === 'function'

const isLikelyImageUrl = (value: string): boolean =>
  /^data:image\//i.test(value) ||
  /\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(value)

const stringifyToolOutput = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.slice(0, 16_000)
  }

  const replacer = (_key: string, innerValue: unknown) => {
    if (typeof innerValue === 'string' && innerValue.length > 1_000) {
      return `${innerValue.slice(0, 1_000)}...[truncated]`
    }
    return innerValue
  }

  try {
    const serialized = JSON.stringify(value, replacer)
    if (!serialized) return ''
    return serialized.slice(0, 16_000)
  } catch {
    return String(value).slice(0, 16_000)
  }
}

const extractImageContentItems = (value: unknown): DynamicToolCallContentItem[] => {
  const items: DynamicToolCallContentItem[] = []
  const record = readObject(value)
  if (!record) {
    return items
  }

  const pushImageUrl = (url: unknown) => {
    if (typeof url === 'string' && isLikelyImageUrl(url)) {
      items.push({ type: 'inputImage', imageUrl: url })
    }
  }

  pushImageUrl(record.url)
  const imageObj = readObject(record.image)
  pushImageUrl(imageObj?.url)

  if (imageObj && typeof imageObj.base64 === 'string') {
    const mimeType = typeof imageObj.mimeType === 'string' ? imageObj.mimeType : 'image/png'
    items.push({
      type: 'inputImage',
      imageUrl: `data:${mimeType};base64,${imageObj.base64}`,
    })
  }

  if (Array.isArray(record.images)) {
    for (const entry of record.images.slice(0, 3)) {
      const imageEntry = readObject(entry)
      if (!imageEntry) continue
      pushImageUrl(imageEntry.url)
      if (typeof imageEntry.base64 === 'string') {
        const mimeType =
          typeof imageEntry.mimeType === 'string' ? imageEntry.mimeType : 'image/png'
        items.push({
          type: 'inputImage',
          imageUrl: `data:${mimeType};base64,${imageEntry.base64}`,
        })
      }
    }
  }

  return items
}

const toDynamicToolContentItems = (value: unknown): DynamicToolCallContentItem[] => {
  if (typeof value === 'string') {
    if (isLikelyImageUrl(value)) {
      return [{ type: 'inputImage', imageUrl: value }]
    }
    return [{ type: 'inputText', text: value.slice(0, 16_000) }]
  }

  const imageItems = extractImageContentItems(value)
  const text = stringifyToolOutput(value)
  const textItems: DynamicToolCallContentItem[] = text
    ? [{ type: 'inputText', text }]
    : []
  return [...textItems, ...imageItems].slice(0, 4)
}

/** Proxy responses: missing/mistyped fields fall back to null/'' instead of failing the turn. */
const nullableOf = <T extends z.ZodType>(schema: T) => schema.nullable().catch(null)
const textOrEmpty = z.string().catch('')

const rateLimitWindowSchema = z.object({
  usedPercent: nullableOf(z.number()),
  remainingPercent: nullableOf(z.number()),
  windowDurationMins: nullableOf(z.number()),
  resetsAt: nullableOf(z.number()),
})

const planUsageSchema = z.object({
  limitId: nullableOf(z.string()),
  limitName: nullableOf(z.string()),
  planType: nullableOf(z.string()),
  primary: nullableOf(rateLimitWindowSchema),
  secondary: nullableOf(rateLimitWindowSchema),
  hasCredits: nullableOf(z.boolean()),
  unlimitedCredits: nullableOf(z.boolean()),
  creditsBalance: nullableOf(z.string()),
})

const chatgptStatusSchema = z.object({
  available: z.boolean().catch(false),
  connected: z.boolean().catch(false),
  authMode: nullableOf(z.enum(['apiKey', 'chatgpt', 'chatgptAuthTokens'])),
  email: nullableOf(z.string()),
  planType: nullableOf(z.string()),
  planUsage: nullableOf(planUsageSchema),
  pendingLoginId: nullableOf(z.string()),
  lastLoginError: nullableOf(z.string()),
  requiresOpenaiAuth: nullableOf(z.boolean()),
})

const chatgptLoginStartSchema = z.object({
  authUrl: nullableOf(z.string()),
  loginId: nullableOf(z.string()),
  status: chatgptStatusSchema.catch(() => chatgptStatusSchema.parse({})),
  loginMethod: z.enum(['browser', 'device']).optional().catch(undefined),
  deviceCode: z.string().nullish().catch(undefined),
  verificationUrl: z.string().nullish().catch(undefined),
})

const proxyTurnStartSchema = z.object({
  runId: z.string(),
  threadId: textOrEmpty,
  turnId: textOrEmpty,
  model: nullableOf(z.string()),
})

const codexTurnUsageSchema = z.object({
  totalTokens: z.number(),
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  outputTokens: z.number(),
  reasoningOutputTokens: z.number(),
})

const proxyTurnEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text-delta'), delta: textOrEmpty }),
  z.object({
    type: z.literal('tool-call-request'),
    requestId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('turn-complete'),
    threadId: textOrEmpty,
    turnId: textOrEmpty,
    model: nullableOf(z.string()),
    text: textOrEmpty,
    usage: nullableOf(codexTurnUsageSchema),
    error: nullableOf(z.string()),
  }),
])

type ProxyTurnEventPayload = z.infer<typeof proxyTurnEventSchema>

/** Unknown or malformed events are skipped, like an empty poll. */
const proxyTurnNextSchema = z.object({
  event: proxyTurnEventSchema.nullable().catch(null),
})

const resolveExecutableToolResult = async (result: unknown): Promise<unknown> => {
  if (!isAsyncIterable(result)) {
    return result
  }

  let lastValue: unknown = null
  for await (const chunk of result) {
    lastValue = chunk
  }
  return lastValue
}

const prepareProxyDynamicTools = async (
  tools?: Record<string, unknown>
): Promise<{
  dynamicTools: Array<{ name: string; description?: string; inputSchema: unknown }>
  toolMap: Map<string, ExecutableTool>
}> => {
  const dynamicTools: Array<{ name: string; description?: string; inputSchema: unknown }> = []
  const toolMap = new Map<string, ExecutableTool>()

  if (!tools) {
    return { dynamicTools, toolMap }
  }

  for (const [name, tool] of Object.entries(tools)) {
    if (!isExecutableTool(tool)) continue

    try {
      const inputSchema = await Promise.resolve(asSchema(tool.inputSchema).jsonSchema)
      dynamicTools.push({
        name,
        ...(typeof tool.description === 'string' && tool.description.trim().length > 0
          ? { description: tool.description }
          : {}),
        inputSchema,
      })
      toolMap.set(name, tool)
    } catch (error) {
      console.warn(`[codex-app-server] skipping dynamic tool "${name}" due to schema error`, error)
    }
  }

  return { dynamicTools, toolMap }
}

const executeProxyToolCall = async (options: {
  toolMap: Map<string, ExecutableTool>
  event: Extract<ProxyTurnEventPayload, { type: 'tool-call-request' }>
  toolExecutionMessages?: unknown[]
  onToolEvent?: (event: CodexToolEvent) => void
}): Promise<{ success: boolean; contentItems: DynamicToolCallContentItem[] }> => {
  const { toolMap, event, toolExecutionMessages, onToolEvent } = options
  const tool = toolMap.get(event.toolName)

  if (!tool || typeof tool.execute !== 'function') {
    const errorText = `Tool "${event.toolName}" is not available in this session.`
    onToolEvent?.({
      phase: 'output-error',
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      input: event.input,
      errorText,
    })
    return {
      success: false,
      contentItems: [{ type: 'inputText', text: errorText }],
    }
  }

  onToolEvent?.({
    phase: 'input-available',
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    input: event.input,
  })

  try {
    const rawResult = await tool.execute(event.input, {
      toolCallId: event.toolCallId,
      messages: Array.isArray(toolExecutionMessages) ? toolExecutionMessages : [],
    })
    const output = await resolveExecutableToolResult(rawResult)
    onToolEvent?.({
      phase: 'output-available',
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      input: event.input,
      output,
    })

    const contentItems = toDynamicToolContentItems(output)
    return {
      success: true,
      contentItems:
        contentItems.length > 0
          ? contentItems
          : [{ type: 'inputText', text: 'Tool completed with no output.' }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    onToolEvent?.({
      phase: 'output-error',
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      input: event.input,
      errorText: message,
    })
    return {
      success: false,
      contentItems: [{ type: 'inputText', text: `Tool "${event.toolName}" failed: ${message}` }],
    }
  }
}

class CodexAppServerSession {
  private process: ChildProcessWithoutNullStreams | null = null
  private connection: JsonRpcConnection | null = null
  private startupPromise: Promise<void> | null = null
  private pendingLoginId: string | null = null
  private lastLoginError: string | null = null
  private readonly activeTurns = new Map<string, ActiveTurnContext>()

  constructor(
    private readonly userId: string,
    private readonly config: SessionConfig
  ) {}

  async getStatus(): Promise<ChatgptStatus> {
    const [rawAccountResult, rateLimitsResult] = await Promise.all([
      this.request('account/read', {
        refreshToken: false,
      }),
      this.request('account/rateLimits/read').catch(() => null),
    ])
    const accountResult = readObject(rawAccountResult)
    const account = readObject(accountResult?.account ?? null)
    const authMode = readAuthMode(account?.type)
    const planUsage = pickPlanUsageSnapshot(rateLimitsResult)

    if (authMode === 'chatgpt' || authMode === 'chatgptAuthTokens') {
      this.pendingLoginId = null
      this.lastLoginError = null
    }

    return {
      available: true,
      connected: authMode === 'chatgpt' || authMode === 'chatgptAuthTokens',
      authMode,
      email: readString(account?.email),
      planType: readString(account?.planType) ?? planUsage?.planType ?? null,
      planUsage,
      pendingLoginId: this.pendingLoginId,
      lastLoginError: this.lastLoginError,
      requiresOpenaiAuth: readBoolean(accountResult?.requiresOpenaiAuth),
    }
  }

  async startChatgptLogin(): Promise<ChatgptLoginStartResult> {
    const result = readObject(
      await this.request('account/login/start', {
        type: 'chatgpt',
      })
    )

    this.pendingLoginId = readString(result?.loginId)
    this.lastLoginError = null

    return {
      authUrl: readString(result?.authUrl),
      loginId: this.pendingLoginId,
      status: await this.getStatus(),
    }
  }

  async cancelChatgptLogin(loginId: string | null): Promise<ChatgptStatus> {
    const targetLoginId = loginId ?? this.pendingLoginId
    if (!targetLoginId) {
      return this.getStatus()
    }

    await this.request('account/login/cancel', { loginId: targetLoginId })
    this.pendingLoginId = null
    this.lastLoginError = null
    return this.getStatus()
  }

  async logout(): Promise<ChatgptStatus> {
    await this.request('account/logout')
    this.pendingLoginId = null
    this.lastLoginError = null
    return this.getStatus()
  }

  async runChatgptTurn(options: RunChatgptTurnOptions): Promise<RunChatgptTurnResult> {
    const status = await this.getStatus()
    if (!status.connected) {
      throw new Error('ChatGPT is not connected for this user')
    }

    const prompt = options.prompt.trim()
    if (!prompt) {
      throw new Error('Prompt is required for codex turn')
    }

    const { dynamicTools, toolMap } = await this.prepareDynamicTools(options.tools)

    const threadResult = (await this.request('thread/start', {
      model: options.model ?? process.env.CODEX_APP_SERVER_MODEL ?? undefined,
      cwd: process.env.CODEX_APP_SERVER_CWD ?? options.cwd ?? process.cwd(),
      approvalPolicy: 'never',
      sandbox: 'read-only',
      baseInstructions: options.baseInstructions ?? undefined,
      developerInstructions: options.developerInstructions ?? undefined,
      personality: options.personality ?? 'none',
      dynamicTools: dynamicTools.length > 0 ? dynamicTools : undefined,
      ephemeral: true,
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    }).then(readObject))

    const thread = readObject(threadResult?.thread)
    const threadId = readString(thread?.id)
    const resolvedModel = readString(threadResult?.model)
    if (!threadId) {
      throw new Error('codex app-server did not return a thread id')
    }

    const turnStartResult = (await this.request('turn/start', {
      threadId,
      input: [{ type: 'text', text: prompt, text_elements: [] }],
      approvalPolicy: 'never',
    }).then(readObject))

    const turn = readObject(turnStartResult?.turn)
    const turnId = readString(turn?.id)
    if (!turnId) {
      throw new Error('codex app-server did not return a turn id')
    }

    const turnKey = this.makeTurnKey(threadId, turnId)
    this.activeTurns.set(turnKey, {
      tools: toolMap,
      toolExecutionMessages: Array.isArray(options.toolExecutionMessages)
        ? options.toolExecutionMessages
        : [],
      onToolEvent: options.onToolEvent,
    })

    try {
      return await this.waitForTurnCompletion({
        threadId,
        turnId,
        model: resolvedModel,
        onTextDelta: options.onTextDelta,
      })
    } finally {
      this.activeTurns.delete(turnKey)
    }
  }

  dispose(): void {
    if (this.connection) {
      this.connection.dispose(new Error('codex app-server session disposed'))
      this.connection.removeAllListeners()
      this.connection = null
    }

    if (this.process && !this.process.killed) {
      this.process.kill()
    }
    this.process = null
    this.startupPromise = null
    this.activeTurns.clear()
  }

  private async waitForTurnCompletion(options: {
    threadId: string
    turnId: string
    model: string | null
    onTextDelta?: (delta: string) => void
  }): Promise<RunChatgptTurnResult> {
    await this.ensureStarted()
    const connection = this.connection
    if (!connection) {
      throw new Error('codex app-server is not running')
    }

    const { threadId, turnId, model, onTextDelta } = options
    const turnTimeoutMs =
      typeof this.config.turnTimeoutMs === 'number' && Number.isFinite(this.config.turnTimeoutMs)
        ? Math.max(this.config.turnTimeoutMs, 5_000)
        : 180_000

    return new Promise((resolve, reject) => {
      let text = ''
      let usage: CodexTurnUsage | null = null
      let settled = false

      const settle = (resolver: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timeoutHandle)
        connection.off('notification', handleNotification)
        connection.off('close', handleClose)
        connection.off('error', handleConnectionError)
        resolver()
      }

      const fail = (error: Error) => {
        settle(() => reject(error))
      }

      const succeed = (result: RunChatgptTurnResult) => {
        settle(() => resolve(result))
      }

      const timeoutHandle = setTimeout(() => {
        fail(
          new Error(
            `codex app-server turn timed out after ${turnTimeoutMs}ms`
          )
        )
      }, turnTimeoutMs)

      const handleClose = () => {
        fail(new Error('codex app-server connection closed while waiting for turn completion'))
      }

      const handleConnectionError = (error: Error) => {
        fail(error)
      }

      const maybeHandleUsage = (payload: Record<string, unknown>) => {
        const payloadThreadId = readString(payload.threadId)
        const payloadTurnId = readString(payload.turnId)
        if (payloadThreadId !== threadId || payloadTurnId !== turnId) {
          return
        }

        const tokenUsage = readObject(payload.tokenUsage)
        const total = readObject(tokenUsage?.total)
        const totalTokens = readNumber(total?.totalTokens)
        const inputTokens = readNumber(total?.inputTokens)
        const cachedInputTokens = readNumber(total?.cachedInputTokens)
        const outputTokens = readNumber(total?.outputTokens)
        const reasoningOutputTokens = readNumber(total?.reasoningOutputTokens)
        if (
          totalTokens === null ||
          inputTokens === null ||
          cachedInputTokens === null ||
          outputTokens === null ||
          reasoningOutputTokens === null
        ) {
          return
        }
        usage = {
          totalTokens,
          inputTokens,
          cachedInputTokens,
          outputTokens,
          reasoningOutputTokens,
        }
      }

      const maybeHandleAgentMessage = (payload: Record<string, unknown>) => {
        const payloadThreadId = readString(payload.threadId)
        const payloadTurnId = readString(payload.turnId)
        if (payloadThreadId !== threadId || payloadTurnId !== turnId) {
          return
        }

        const delta = readString(payload.delta)
        if (!delta) {
          return
        }
        text += delta
        onTextDelta?.(delta)
      }

      const maybeHandleCompletedItem = (payload: Record<string, unknown>) => {
        const payloadThreadId = readString(payload.threadId)
        const payloadTurnId = readString(payload.turnId)
        if (payloadThreadId !== threadId || payloadTurnId !== turnId) {
          return
        }

        const item = readObject(payload.item)
        if (!item) return
        if (readString(item.type) !== 'agentMessage') return
        const completedText = readString(item.text)
        if (!completedText) return
        if (!text) {
          text = completedText
          onTextDelta?.(completedText)
        }
      }

      const maybeHandleTurnCompleted = (payload: Record<string, unknown>) => {
        const payloadThreadId = readString(payload.threadId)
        if (payloadThreadId !== threadId) {
          return
        }
        const turn = readObject(payload.turn)
        if (!turn || readString(turn.id) !== turnId) {
          return
        }

        const status = readString(turn.status)
        if (status === 'failed') {
          const turnError = readObject(turn.error)
          const errorMessage =
            readString(turnError?.message) ?? 'codex app-server turn failed'
          fail(new Error(errorMessage))
          return
        }
        if (status === 'interrupted') {
          fail(new Error('codex app-server turn was interrupted'))
          return
        }

        succeed({
          threadId,
          turnId,
          model,
          text,
          usage,
        })
      }

      const handleNotification = (notification: JsonRpcNotification) => {
        const payload = readObject(notification.params)
        if (!payload) {
          return
        }

        switch (notification.method) {
          case 'thread/tokenUsage/updated':
            maybeHandleUsage(payload)
            return
          case 'item/agentMessage/delta':
            maybeHandleAgentMessage(payload)
            return
          case 'item/completed':
            maybeHandleCompletedItem(payload)
            return
          case 'turn/completed':
            maybeHandleTurnCompleted(payload)
            return
          default:
            return
        }
      }

      connection.on('notification', handleNotification)
      connection.on('close', handleClose)
      connection.on('error', handleConnectionError)
    })
  }

  private makeTurnKey(threadId: string, turnId: string): string {
    return `${threadId}:${turnId}`
  }

  private async prepareDynamicTools(tools?: Record<string, unknown>): Promise<{
    dynamicTools: Array<{ name: string; description?: string; inputSchema: unknown }>
    toolMap: Map<string, ExecutableTool>
  }> {
    const dynamicTools: Array<{ name: string; description?: string; inputSchema: unknown }> = []
    const toolMap = new Map<string, ExecutableTool>()

    if (!tools) {
      return { dynamicTools, toolMap }
    }

    const entries = Object.entries(tools)
    for (const [name, tool] of entries) {
      if (!isExecutableTool(tool)) continue

      try {
        const inputSchema = await Promise.resolve(asSchema(tool.inputSchema).jsonSchema)
        dynamicTools.push({
          name,
          ...(typeof tool.description === 'string' && tool.description.trim().length > 0
            ? { description: tool.description }
            : {}),
          inputSchema,
        })
        toolMap.set(name, tool)
      } catch (error) {
        console.warn(`[codex-app-server] skipping dynamic tool "${name}" due to schema error`, error)
      }
    }

    return { dynamicTools, toolMap }
  }

  private async resolveToolExecuteResult(result: unknown): Promise<unknown> {
    if (!isAsyncIterable(result)) {
      return result
    }

    let lastValue: unknown = null
    for await (const chunk of result) {
      lastValue = chunk
    }
    return lastValue
  }

  private async handleDynamicToolCall(
    params: Record<string, unknown> | null
  ): Promise<{ result?: unknown; error?: JsonRpcError }> {
    const threadId = readString(params?.threadId)
    const turnId = readString(params?.turnId)
    const callId = readString(params?.callId) ?? `call-${Date.now()}`
    const toolName = readString(params?.tool)
    const toolArgs = params?.arguments

    if (!threadId || !turnId || !toolName) {
      return {
        result: {
          success: false,
          contentItems: [
            {
              type: 'inputText',
              text: 'Dynamic tool call payload was invalid.',
            },
          ],
        },
      }
    }

    const turnContext = this.activeTurns.get(this.makeTurnKey(threadId, turnId))
    if (!turnContext) {
      return {
        result: {
          success: false,
          contentItems: [
            {
              type: 'inputText',
              text: `No active context for dynamic tool ${toolName}.`,
            },
          ],
        },
      }
    }

    const tool = turnContext.tools.get(toolName)
    if (!tool || typeof tool.execute !== 'function') {
      turnContext.onToolEvent?.({
        phase: 'output-error',
        toolCallId: callId,
        toolName,
        input: toolArgs,
        errorText: `Tool "${toolName}" is not available in this session.`,
      })
      return {
        result: {
          success: false,
          contentItems: [
            {
              type: 'inputText',
              text: `Tool "${toolName}" is not available in this session.`,
            },
          ],
        },
      }
    }

    try {
      turnContext.onToolEvent?.({
        phase: 'input-available',
        toolCallId: callId,
        toolName,
        input: toolArgs,
      })

      const rawResult = await tool.execute(toolArgs, {
        toolCallId: callId,
        messages: turnContext.toolExecutionMessages,
      })
      const output = await this.resolveToolExecuteResult(rawResult)
      turnContext.onToolEvent?.({
        phase: 'output-available',
        toolCallId: callId,
        toolName,
        input: toolArgs,
        output,
      })
      const contentItems = toDynamicToolContentItems(output)
      return {
        result: {
          success: true,
          contentItems:
            contentItems.length > 0
              ? contentItems
              : [{ type: 'inputText', text: 'Tool completed with no output.' }],
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      turnContext.onToolEvent?.({
        phase: 'output-error',
        toolCallId: callId,
        toolName,
        input: toolArgs,
        errorText: message,
      })
      return {
        result: {
          success: false,
          contentItems: [
            {
              type: 'inputText',
              text: `Tool "${toolName}" failed: ${message}`,
            },
          ],
        },
      }
    }
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    await this.ensureStarted()
    const connection = this.connection
    if (!connection) {
      throw new Error('codex app-server is not running')
    }
    return connection.sendRequest(method, params, this.config.requestTimeoutMs)
  }

  private async ensureStarted(): Promise<void> {
    if (this.connection && this.process) {
      return
    }
    if (!this.startupPromise) {
      this.startupPromise = this.startInternal().finally(() => {
        this.startupPromise = null
      })
    }
    return this.startupPromise
  }

  private async startInternal(): Promise<void> {
    const codexHome = join(this.config.codexHomeRoot, sanitizePathSegment(this.userId))
    await mkdir(codexHome, { recursive: true })

    const child = spawn(
      this.config.codexBin,
      [...this.config.codexArgs, 'app-server', ...this.config.appServerArgs],
      {
        stdio: 'pipe',
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
        },
      }
    )

    const connection = new JsonRpcConnection(child.stdin, child.stdout, child.stderr)
    this.process = child
    this.connection = connection

    connection.on('notification', message => {
      this.handleNotification(message.method, message.params)
    })

    connection.on('serverRequest', async (message: JsonRpcServerRequest) => {
      try {
        const { result, error } = await this.handleServerRequest(message)
        connection.sendResponse(message.id, result, error)
      } catch (error) {
        connection.sendResponse(message.id, undefined, {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error handling server request',
        })
      }
    })

    connection.on('error', () => {
      if (!this.process?.killed) {
        this.process?.kill()
      }
    })

    const startupPromise = (async () => {
      await connection.sendRequest(
        'initialize',
        {
          clientInfo: {
            name: 'everything_assistant',
            title: 'The Everything Assistant',
            version: '0.1.0',
          },
          capabilities: {
            experimentalApi: true,
          },
        },
        this.config.startupTimeoutMs
      )
      connection.sendNotification('initialized', {})
    })()

    let onChildError: ((error: Error) => void) | null = null
    let onChildExitBeforeInit: ((code: number | null) => void) | null = null

    const childErrorPromise = new Promise<never>((_, reject) => {
      onChildError = error => {
        reject(
          new Error(
            `Unable to start codex app-server using CODEX_BIN='${this.config.codexBin}': ${error.message}`
          )
        )
      }
      child.once('error', onChildError)
    })

    const childExitPromise = new Promise<never>((_, reject) => {
      onChildExitBeforeInit = code => {
        reject(new Error(`codex app-server exited before initialization (code ${code ?? 'unknown'})`))
      }
      child.once('exit', onChildExitBeforeInit)
    })

    try {
      await Promise.race([startupPromise, childErrorPromise, childExitPromise])
    } catch (error) {
      connection.dispose(error instanceof Error ? error : new Error(String(error)))
      this.process?.kill()
      this.process = null
      this.connection = null
      throw error
    } finally {
      if (onChildError) {
        child.off('error', onChildError)
      }
      if (onChildExitBeforeInit) {
        child.off('exit', onChildExitBeforeInit)
      }
    }

    child.on('exit', () => {
      connection.dispose(new Error('codex app-server exited'))
      if (this.connection === connection) {
        this.connection = null
      }
      if (this.process === child) {
        this.process = null
      }
    })
  }

  private handleNotification(method: string, params?: unknown): void {
    if (method === 'account/login/completed') {
      const payload = readObject(params)
      const loginId = readString(payload?.loginId)
      const success = Boolean(payload?.success)
      const error = readString(payload?.error)
      if (loginId && loginId === this.pendingLoginId) {
        this.pendingLoginId = null
      }
      if (!success) {
        this.lastLoginError = error ?? 'ChatGPT login failed'
      } else {
        this.lastLoginError = null
      }
      void invalidateChatgptStatus(this.userId)
      return
    }

    if (method === 'account/updated') {
      void invalidateChatgptStatus(this.userId)
      const payload = readObject(params)
      const authMode = readString(payload?.authMode)
      if (authMode === 'chatgpt' || authMode === 'chatgptAuthTokens') {
        this.pendingLoginId = null
        this.lastLoginError = null
      }
    }
  }

  private async handleServerRequest(
    message: JsonRpcServerRequest
  ): Promise<{ result?: unknown; error?: JsonRpcError }> {
    if (message.method === 'item/commandExecution/requestApproval') {
      return { result: { decision: 'decline' } }
    }

    if (message.method === 'item/fileChange/requestApproval') {
      return { result: { decision: 'decline' } }
    }

    if (message.method === 'item/tool/call') {
      return this.handleDynamicToolCall(readObject(message.params))
    }

    if (message.method === 'item/tool/requestUserInput') {
      return { result: { answers: {} } }
    }

    if (message.method === 'execCommandApproval') {
      return { result: { decision: 'denied' } }
    }

    if (message.method === 'applyPatchApproval') {
      return { result: { decision: 'denied' } }
    }

    return {
      error: {
        code: -32601,
        message: `Unsupported server request: ${message.method}`,
      },
    }
  }
}

type SessionRegistry = {
  sessions: Map<string, CodexAppServerSession>
  config: SessionConfig
}

type ProxyConfig = {
  baseUrl: string
  authToken: string | null
  timeoutMs: number
}

declare global {
  // eslint-disable-next-line no-var
  var __everythingAssistantCodexRegistry: SessionRegistry | undefined
}

const resolveConfig = (): SessionConfig => {
  const startupTimeoutMs = Number(process.env.CODEX_APP_SERVER_STARTUP_TIMEOUT_MS ?? 15_000)
  const requestTimeoutMs = Number(process.env.CODEX_APP_SERVER_REQUEST_TIMEOUT_MS ?? 45_000)
  const turnTimeoutMs = Number(process.env.CODEX_APP_SERVER_TURN_TIMEOUT_MS ?? 180_000)

  const parsedCodexArgs =
    parseJsonArgs(process.env.CODEX_FLAGS_JSON) ?? parseSpaceArgs(process.env.CODEX_FLAGS)
  const parsedAppServerArgs =
    parseJsonArgs(process.env.CODEX_APP_SERVER_FLAGS_JSON) ??
    parseSpaceArgs(process.env.CODEX_APP_SERVER_FLAGS)

  return {
    codexBin: process.env.CODEX_BIN ?? 'codex',
    codexArgs: sanitizeCodexArgsForReadOnly(parsedCodexArgs, 'CODEX_FLAGS'),
    appServerArgs: sanitizeCodexArgsForReadOnly(parsedAppServerArgs, 'CODEX_APP_SERVER_FLAGS'),
    codexHomeRoot:
      process.env.CODEX_APP_SERVER_HOME_ROOT ??
      join(homedir(), '.the-everything-assistant', 'codex-app-server'),
    startupTimeoutMs: Number.isFinite(startupTimeoutMs) ? Math.max(startupTimeoutMs, 1_000) : 15_000,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs) ? Math.max(requestTimeoutMs, 1_000) : 45_000,
    turnTimeoutMs: Number.isFinite(turnTimeoutMs) ? Math.max(turnTimeoutMs, 5_000) : 180_000,
  }
}

const resolveProxyConfig = (): ProxyConfig | null => {
  const baseUrl = process.env.CODEX_PROXY_URL?.trim()
  if (!baseUrl) return null

  const timeoutRaw = Number(process.env.CODEX_PROXY_TIMEOUT_MS ?? 120_000)
  return {
    baseUrl: baseUrl.replace(/\/+$/u, ''),
    authToken: process.env.CODEX_PROXY_AUTH_TOKEN?.trim() || null,
    timeoutMs: Number.isFinite(timeoutRaw) ? Math.max(timeoutRaw, 1_000) : 120_000,
  }
}

const proxyRequest = async <S extends z.ZodType>(
  config: ProxyConfig,
  path: string,
  payload: unknown,
  schema: S
): Promise<z.infer<S>> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    })

    const text = await response.text()
    let data: Record<string, unknown> | null = null

    if (text) {
      try {
        data = readObject(JSON.parse(text))
      } catch {
        data = null
      }
    }

    if (!response.ok) {
      const errorMessage =
        (data && typeof data.error === 'string' && data.error) ||
        text ||
        `codex proxy request failed with status ${response.status}`
      throw new Error(errorMessage)
    }

    return schema.parse(data ?? {})
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`codex proxy request timed out after ${config.timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

const getRegistry = (): SessionRegistry => {
  if (!globalThis.__everythingAssistantCodexRegistry) {
    globalThis.__everythingAssistantCodexRegistry = {
      sessions: new Map<string, CodexAppServerSession>(),
      config: resolveConfig(),
    }
    return globalThis.__everythingAssistantCodexRegistry
  }

  const registry = globalThis.__everythingAssistantCodexRegistry

  // Hot reload can retain older config/session objects. Refresh config every time and
  // reset stale sessions if legacy config did not include the turn timeout field.
  const turnTimeoutMs: unknown = registry.config?.turnTimeoutMs
  const hadLegacyConfig = typeof turnTimeoutMs !== 'number' || !Number.isFinite(turnTimeoutMs)
  if (hadLegacyConfig && registry.sessions.size > 0) {
    for (const session of registry.sessions.values()) {
      session.dispose?.()
    }
    registry.sessions.clear()
  }

  registry.config = resolveConfig()
  return registry
}

const getOrCreateSession = (userId: string): CodexAppServerSession => {
  const registry = getRegistry()
  // Sessions can outlive a hot reload; an instance from older code may lack newer methods.
  const existing = registry.sessions.get(userId)
  const runChatgptTurn: unknown = existing?.runChatgptTurn
  if (existing && typeof runChatgptTurn === 'function') {
    return existing
  }
  if (existing) {
    existing.dispose?.()
    registry.sessions.delete(userId)
  }

  const session = new CodexAppServerSession(userId, registry.config)
  registry.sessions.set(userId, session)
  return session
}

/** Write-through: every live status read refreshes the chat route's cached `connected` flag. */
const remember = async <T extends { connected: boolean }>(
  userId: string,
  pending: Promise<T>
): Promise<T> => {
  const status = await pending
  await rememberChatgptConnected(userId, status.connected)
  return status
}

export async function getChatgptStatus(userId: string): Promise<ChatgptStatus> {
  const proxy = resolveProxyConfig()
  if (proxy) {
    return remember(
      userId,
      proxyRequest(proxy, '/v1/chatgpt/status', { userId }, chatgptStatusSchema)
    )
  }

  const session = getOrCreateSession(userId)
  return remember(userId, session.getStatus())
}

/** How long a failed lookup (no codex binary, proxy down) is remembered as "not connected". */
const STATUS_ERROR_TTL_SECONDS = 60

/**
 * Cheap per-message check used by `/api/chat`: `false` immediately when Codex isn't
 * configured for this deployment, otherwise the cached flag (5 min, refreshed by every
 * live status read and invalidated on login/logout), falling back to a live lookup.
 * Never throws; a failed live lookup counts as "not connected" for a minute.
 */
export async function isChatgptConnectedCached(userId: string): Promise<boolean> {
  if (!isCodexConfigured()) return false
  const cached = await readCachedChatgptConnected(userId)
  if (cached !== null) return cached
  try {
    return (await getChatgptStatus(userId)).connected
  } catch (error) {
    console.warn('[codex] Unable to read ChatGPT status, falling back to API key', error)
    await rememberChatgptConnected(userId, false, STATUS_ERROR_TTL_SECONDS)
    return false
  }
}

export async function startChatgptLogin(userId: string): Promise<ChatgptLoginStartResult> {
  const proxy = resolveProxyConfig()
  const result = proxy
    ? await proxyRequest(proxy, '/v1/chatgpt/start', { userId }, chatgptLoginStartSchema)
    : await getOrCreateSession(userId).startChatgptLogin()
  // Login completes out of band; drop the cache so the next message re-checks.
  await invalidateChatgptStatus(userId)
  return result
}

export async function cancelChatgptLogin(
  userId: string,
  loginId: string | null
): Promise<ChatgptStatus> {
  const proxy = resolveProxyConfig()
  if (proxy) {
    return remember(
      userId,
      proxyRequest(
        proxy,
        '/v1/chatgpt/cancel',
        {
          userId,
          loginId,
        },
        chatgptStatusSchema
      )
    )
  }

  const session = getOrCreateSession(userId)
  return remember(userId, session.cancelChatgptLogin(loginId))
}

export async function disconnectChatgpt(userId: string): Promise<ChatgptStatus> {
  // Drop the cache first so a failed logout can't leave a stale "connected" behind.
  await invalidateChatgptStatus(userId)
  const proxy = resolveProxyConfig()
  if (proxy) {
    return remember(
      userId,
      proxyRequest(proxy, '/v1/chatgpt/disconnect', { userId }, chatgptStatusSchema)
    )
  }

  const session = getOrCreateSession(userId)
  return remember(userId, session.logout())
}

export async function runChatgptManagedTurn(
  userId: string,
  options: RunChatgptTurnOptions
): Promise<RunChatgptTurnResult> {
  const proxy = resolveProxyConfig()
  if (proxy) {
    const { dynamicTools, toolMap } = await prepareProxyDynamicTools(options.tools)
    const start = await proxyRequest(
      proxy,
      '/v1/chatgpt/turn/start',
      {
        userId,
        options: {
          prompt: options.prompt,
          model: options.model ?? null,
          cwd: options.cwd ?? null,
          baseInstructions: options.baseInstructions ?? null,
          developerInstructions: options.developerInstructions ?? null,
          personality: options.personality ?? 'none',
          dynamicTools: dynamicTools.length > 0 ? dynamicTools : undefined,
        },
      },
      proxyTurnStartSchema
    )

    let streamedText = ''
    let completed: RunChatgptTurnResult | null = null

    try {
      while (!completed) {
        const next = await proxyRequest(
          proxy,
          '/v1/chatgpt/turn/next',
          {
            userId,
            runId: start.runId,
            timeoutMs: 25_000,
          },
          proxyTurnNextSchema
        )
        const event = next.event
        if (!event) {
          continue
        }

        if (event.type === 'text-delta') {
          if (event.delta) {
            streamedText += event.delta
            options.onTextDelta?.(event.delta)
          }
          continue
        }

        if (event.type === 'tool-call-request') {
          const toolResult = await executeProxyToolCall({
            toolMap,
            event,
            toolExecutionMessages: options.toolExecutionMessages,
            onToolEvent: options.onToolEvent,
          })

          await proxyRequest(
            proxy,
            '/v1/chatgpt/turn/tool-result',
            {
              userId,
              runId: start.runId,
              requestId: event.requestId,
              result: toolResult,
            },
            z.unknown()
          )
          continue
        }

        if (event.type === 'turn-complete') {
          if (event.error) {
            throw new Error(event.error)
          }

          const finalText = event.text || streamedText
          if (!streamedText && finalText) {
            options.onTextDelta?.(finalText)
          }

          completed = {
            threadId: event.threadId || start.threadId,
            turnId: event.turnId || start.turnId,
            model: event.model ?? start.model ?? null,
            text: finalText,
            usage: event.usage ?? null,
          }
        }
      }

      return completed
    } finally {
      try {
        await proxyRequest(
          proxy,
          '/v1/chatgpt/turn/close',
          {
            userId,
            runId: start.runId,
          },
          z.unknown()
        )
      } catch {
        // non-fatal cleanup failure
      }
    }
  }

  const session = getOrCreateSession(userId)
  return session.runChatgptTurn(options)
}

export type ChatgptStatusPayload = ChatgptStatus
