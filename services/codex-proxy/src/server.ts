import { $ } from 'bun'

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

type JsonRpcServerRequest = {
  id: number
  method: string
  params?: unknown
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
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

type AccountReadResult = {
  account?: {
    type?: 'apiKey' | 'chatgpt' | 'chatgptAuthTokens'
    email?: string
    planType?: string
  } | null
  requiresOpenaiAuth?: boolean
}

type AccountRateLimitsReadResult = {
  rateLimits?: unknown
  rate_limits?: unknown
  rateLimitsByLimitId?: Record<string, unknown> | null
  rate_limits_by_limit_id?: Record<string, unknown> | null
}

type LoginChatgptResult = {
  loginId?: string
  authUrl?: string
}

type ChatgptLoginStartResult = {
  authUrl: string | null
  loginId: string | null
  status: ChatgptStatus
  loginMethod?: 'browser' | 'device'
  deviceCode?: string | null
  verificationUrl?: string | null
}

type CodexTurnUsage = {
  totalTokens: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
}

type RunChatgptTurnOptions = {
  prompt: string
  model?: string | null
  cwd?: string | null
  baseInstructions?: string | null
  developerInstructions?: string | null
  personality?: 'friendly' | 'pragmatic' | 'none' | null
  dynamicTools?: Array<{ name: string; description?: string; inputSchema: unknown }>
}

type RunChatgptTurnResult = {
  threadId: string
  turnId: string
  model: string | null
  text: string
  usage: CodexTurnUsage | null
}

type TurnRunEvent =
  | {
      type: 'text-delta'
      delta: string
    }
  | {
      type: 'tool-call-request'
      requestId: string
      toolCallId: string
      toolName: string
      input: unknown
    }
  | {
      type: 'turn-complete'
      threadId: string
      turnId: string
      model: string | null
      text: string
      usage: CodexTurnUsage | null
      error: string | null
    }

type PendingToolResponse = {
  resolve: (value: { result?: unknown; error?: JsonRpcError }) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type TurnRunState = {
  runId: string
  threadId: string
  turnId: string
  model: string | null
  text: string
  usage: CodexTurnUsage | null
  completed: boolean
  completionError: string | null
  events: TurnRunEvent[]
  waiters: Array<(event: TurnRunEvent | null) => void>
  pendingToolResponses: Map<string, PendingToolResponse>
  createdAt: number
  completedAt: number | null
}

type StartTurnRunResult = {
  runId: string
  threadId: string
  turnId: string
  model: string | null
}

type DeviceUserCodeResult = {
  deviceAuthId: string
  userCode: string
  intervalSeconds: number
  verificationUrl: string
}

type DeviceTokenPollResult =
  | { status: 'pending' }
  | {
      status: 'ready'
      authorizationCode: string
      codeVerifier: string
    }

type OpenAiTokenResult = {
  idToken: string | null
  accessToken: string
  refreshToken: string | null
}

type JwtAuthClaims = {
  email: string | null
  accountId: string | null
  planType: string | null
  exp: number | null
}

type ExternalAuthState = {
  accessToken: string
  refreshToken: string | null
  idToken: string | null
  accountId: string
  planType: string | null
  email: string | null
  expMs: number | null
}

type PendingDeviceLogin = {
  loginId: string
  deviceAuthId: string
  userCode: string
  intervalSeconds: number
  verificationUrl: string
  startedAt: number
  canceled: boolean
}

const readObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

const readString = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const readNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const readBoolean = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)

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

const pickPlanUsageSnapshot = (
  payload: AccountRateLimitsReadResult | null | undefined
): AccountPlanUsage | null => {
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

const parseJsonArgs = (value: string | undefined): string[] | null => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : null
  } catch {
    return null
  }
}

const parseSpaceArgs = (value: string | undefined): string[] => {
  if (!value) return []
  return value
    .split(/\s+/u)
    .map(item => item.trim())
    .filter(Boolean)
}

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/gu, '')
const OPENAI_AUTH_ISSUER = trimTrailingSlashes(
  Bun.env.CODEX_OPENAI_ISSUER?.trim() || 'https://auth.openai.com'
)
const OPENAI_CLIENT_ID = Bun.env.CODEX_CHATGPT_CLIENT_ID?.trim() || 'app_EMoamEEZ73f0CkXaXp7hrann'
const CHATGPT_LOGIN_MODE = Bun.env.CODEX_PROXY_CHATGPT_LOGIN_MODE?.trim().toLowerCase() || 'device'
const OPENAI_REQUEST_TIMEOUT_MS = Number(Bun.env.CODEX_PROXY_OPENAI_REQUEST_TIMEOUT_MS ?? 20_000)
const DEVICE_AUTH_TIMEOUT_MS = Number(Bun.env.CODEX_PROXY_DEVICE_AUTH_TIMEOUT_MS ?? 15 * 60 * 1_000)
const EXTERNAL_AUTH_REFRESH_LEEWAY_MS = Number(
  Bun.env.CODEX_PROXY_EXTERNAL_REFRESH_LEEWAY_MS ?? 60_000
)

const waitMs = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, Math.max(1, ms))
  })

const parseIntervalSeconds = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value))
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.floor(parsed))
    }
  }
  return 5
}

const normalizePlanType = (value: string | null): string | null => {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  return normalized || null
}

const decodeBase64UrlJson = (encoded: string): Record<string, unknown> | null => {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  try {
    const decoded = atob(padded)
    const parsed = JSON.parse(decoded)
    return readObject(parsed)
  } catch {
    return null
  }
}

const parseJwtAuthClaims = (token: string): JwtAuthClaims => {
  const parts = token.split('.')
  if (parts.length < 2) {
    return {
      email: null,
      accountId: null,
      planType: null,
      exp: null,
    }
  }

  const payload = decodeBase64UrlJson(parts[1])
  if (!payload) {
    return {
      email: null,
      accountId: null,
      planType: null,
      exp: null,
    }
  }

  const profile = readObject(payload['https://api.openai.com/profile'])
  const auth = readObject(payload['https://api.openai.com/auth'])
  const rawPlanType = readString(auth?.chatgpt_plan_type) ?? readString(auth?.chatgptPlanType)

  return {
    email: readString(payload.email) ?? readString(profile?.email),
    accountId:
      readString(auth?.chatgpt_account_id) ??
      readString(auth?.chatgptAccountId) ??
      readString(payload.account_id) ??
      null,
    planType: normalizePlanType(rawPlanType),
    exp: readNumber(payload.exp),
  }
}

const getOpenAiUrl = (path: string): string => `${OPENAI_AUTH_ISSUER}${path}`

const fetchOpenAi = async (
  path: string,
  init: RequestInit
): Promise<{ status: number; data: Record<string, unknown> | null; bodyText: string }> => {
  const timeoutMs =
    Number.isFinite(OPENAI_REQUEST_TIMEOUT_MS) && OPENAI_REQUEST_TIMEOUT_MS > 0
      ? OPENAI_REQUEST_TIMEOUT_MS
      : 20_000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(getOpenAiUrl(path), {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    })
    const bodyText = await response.text()
    let data: Record<string, unknown> | null = null
    if (bodyText) {
      try {
        data = readObject(JSON.parse(bodyText))
      } catch {
        data = null
      }
    }
    return {
      status: response.status,
      data,
      bodyText,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenAI auth request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

const requestDeviceUserCode = async (): Promise<DeviceUserCodeResult> => {
  const { status, data, bodyText } = await fetchOpenAi('/api/accounts/deviceauth/usercode', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      client_id: OPENAI_CLIENT_ID,
    }),
  })

  if (status < 200 || status >= 300) {
    throw new Error(
      bodyText || data?.error?.toString() || `device auth user-code request failed with status ${status}`
    )
  }

  const deviceAuthId = readString(data?.device_auth_id) ?? readString(data?.deviceAuthId)
  const userCode = readString(data?.user_code) ?? readString(data?.userCode)
  const intervalSeconds = parseIntervalSeconds(data?.interval)

  if (!deviceAuthId || !userCode) {
    throw new Error('device auth response was missing device_auth_id or user_code')
  }

  return {
    deviceAuthId,
    userCode,
    intervalSeconds,
    verificationUrl: getOpenAiUrl('/codex/device'),
  }
}

const pollDeviceToken = async (options: {
  deviceAuthId: string
  userCode: string
}): Promise<DeviceTokenPollResult> => {
  const { status, data, bodyText } = await fetchOpenAi('/api/accounts/deviceauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      device_auth_id: options.deviceAuthId,
      user_code: options.userCode,
    }),
  })

  if (status === 403 || status === 404) {
    return { status: 'pending' }
  }

  if (status < 200 || status >= 300) {
    throw new Error(bodyText || `device auth poll failed with status ${status}`)
  }

  const authorizationCode =
    readString(data?.authorization_code) ?? readString(data?.authorizationCode)
  const codeVerifier = readString(data?.code_verifier) ?? readString(data?.codeVerifier)
  if (!authorizationCode || !codeVerifier) {
    throw new Error('device auth poll response was missing authorization_code or code_verifier')
  }

  return {
    status: 'ready',
    authorizationCode,
    codeVerifier,
  }
}

const exchangeAuthorizationCode = async (options: {
  authorizationCode: string
  codeVerifier: string
}): Promise<OpenAiTokenResult> => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.authorizationCode,
    redirect_uri: getOpenAiUrl('/deviceauth/callback'),
    client_id: OPENAI_CLIENT_ID,
    code_verifier: options.codeVerifier,
  })

  const { status, data, bodyText } = await fetchOpenAi('/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (status < 200 || status >= 300) {
    throw new Error(bodyText || `device auth token exchange failed with status ${status}`)
  }

  const accessToken = readString(data?.access_token) ?? readString(data?.accessToken)
  if (!accessToken) {
    throw new Error('token exchange did not return access_token')
  }

  return {
    idToken: readString(data?.id_token) ?? readString(data?.idToken),
    accessToken,
    refreshToken: readString(data?.refresh_token) ?? readString(data?.refreshToken),
  }
}

const refreshAccessToken = async (refreshToken: string): Promise<OpenAiTokenResult> => {
  const { status, data, bodyText } = await fetchOpenAi('/oauth/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      client_id: OPENAI_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'openid profile email',
    }),
  })

  if (status < 200 || status >= 300) {
    throw new Error(bodyText || `access-token refresh failed with status ${status}`)
  }

  const accessToken = readString(data?.access_token) ?? readString(data?.accessToken)
  if (!accessToken) {
    throw new Error('refresh response did not return access_token')
  }

  return {
    idToken: readString(data?.id_token) ?? readString(data?.idToken),
    accessToken,
    refreshToken: readString(data?.refresh_token) ?? readString(data?.refreshToken),
  }
}

const sanitizeCodexArgsForReadOnly = (args: string[], source: string): string[] => {
  const sanitized: string[] = []

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    const lower = arg.toLowerCase()

    const dropCurrentAndMaybeValue = (reason: string) => {
      console.warn(`[codex-proxy] removed ${arg} from ${source} (${reason})`)
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
      console.warn(`[codex-proxy] removed ${arg} from ${source} (unsafe execution mode)`)
      continue
    }

    if (lower === '--sandbox' || lower === '-s') {
      dropCurrentAndMaybeValue('sandbox is hard-enforced as read-only by proxy')
      continue
    }

    if (
      lower.startsWith('--sandbox=') ||
      lower === '--ask-for-approval' ||
      lower.startsWith('--ask-for-approval=') ||
      lower === '-a'
    ) {
      dropCurrentAndMaybeValue('approval policy is hard-enforced as never by proxy')
      continue
    }

    sanitized.push(arg)
  }

  return sanitized
}

const sanitizePathSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_')
const HOME_DIR = Bun.env.HOME || Bun.env.USERPROFILE || '/tmp'

const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/gu, '')

const joinPath = (...parts: string[]): string => {
  if (!parts.length) return ''

  const hasLeadingSlash = parts[0].startsWith('/')
  const cleaned = parts.map((part, index) => {
    if (index === 0) return part.replace(/\/+$/gu, '')
    return trimSlashes(part)
  })

  const joined = cleaned.filter(Boolean).join('/')
  if (hasLeadingSlash) {
    return `/${joined.replace(/^\/+/gu, '')}`
  }
  return joined
}

const resolveBunCwd = (): string => {
  const cwdValue = (Bun as unknown as { cwd?: unknown }).cwd
  if (typeof cwdValue === 'function') {
    try {
      const resolved = cwdValue()
      if (typeof resolved === 'string' && resolved.trim()) {
        return resolved
      }
    } catch {
      // fall through to non-function paths
    }
  }
  if (typeof cwdValue === 'string' && cwdValue.trim()) {
    return cwdValue
  }
  const envPwd = Bun.env.PWD?.trim()
  if (envPwd) {
    return envPwd
  }
  return '.'
}

class JsonRpcConnection {
  private buffer = ''
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly stdinSink: {
    write: (chunk: string | ArrayBuffer | ArrayBufferView) => unknown
  }

  private readonly notificationListeners = new Set<(notification: JsonRpcNotification) => void>()
  private readonly serverRequestListeners = new Set<(request: JsonRpcServerRequest) => void>()
  private readonly closeListeners = new Set<() => void>()
  private readonly errorListeners = new Set<(error: Error) => void>()
  private readonly stderrListeners = new Set<(line: string) => void>()

  constructor(
    stdin: { write: (chunk: string | ArrayBuffer | ArrayBufferView) => unknown },
    stdout: ReadableStream<Uint8Array>,
    stderr?: ReadableStream<Uint8Array>
  ) {
    this.stdinSink = stdin

    void this.consumeStdout(stdout)
    if (stderr) {
      void this.consumeStderr(stderr)
    }
  }

  onNotification(listener: (notification: JsonRpcNotification) => void): void {
    this.notificationListeners.add(listener)
  }

  offNotification(listener: (notification: JsonRpcNotification) => void): void {
    this.notificationListeners.delete(listener)
  }

  onServerRequest(listener: (request: JsonRpcServerRequest) => void): void {
    this.serverRequestListeners.add(listener)
  }

  offServerRequest(listener: (request: JsonRpcServerRequest) => void): void {
    this.serverRequestListeners.delete(listener)
  }

  onClose(listener: () => void): void {
    this.closeListeners.add(listener)
  }

  offClose(listener: () => void): void {
    this.closeListeners.delete(listener)
  }

  onError(listener: (error: Error) => void): void {
    this.errorListeners.add(listener)
  }

  offError(listener: (error: Error) => void): void {
    this.errorListeners.delete(listener)
  }

  onStderr(listener: (line: string) => void): void {
    this.stderrListeners.add(listener)
  }

  sendRequest(method: string, params?: unknown, timeoutMs = 30_000): Promise<unknown> {
    const id = this.nextId++

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`codex app-server request timed out: ${method}`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timer })

      void this.writeMessage({ id, method, params } satisfies JsonRpcRequest).catch(error => {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  sendNotification(method: string, params?: unknown): void {
    void this.writeMessage({ method, params } satisfies JsonRpcNotification).catch(error => {
      this.emitError(error instanceof Error ? error : new Error(String(error)))
    })
  }

  sendResponse(id: number, result?: unknown, error?: JsonRpcError): void {
    void this.writeMessage({ id, result, error } satisfies JsonRpcResponse).catch(err => {
      this.emitError(err instanceof Error ? err : new Error(String(err)))
    })
  }

  dispose(error?: Error): void {
    const reason = error ?? new Error('codex app-server connection closed')
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer)
      pending.reject(reason)
      this.pending.delete(id)
    }
  }

  private async consumeStdout(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        this.handleChunk(decoder.decode(value, { stream: true }))
      }
      const tail = decoder.decode()
      if (tail) {
        this.handleChunk(tail)
      }
      this.dispose(new Error('codex app-server closed stdout'))
      this.emitClose()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.dispose(err)
      this.emitError(err)
    }
  }

  private async consumeStderr(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        const text = decoder.decode(value, { stream: true }).trim()
        if (!text) continue
        for (const listener of this.stderrListeners) {
          listener(text)
        }
      }
      const tail = decoder.decode().trim()
      if (tail) {
        for (const listener of this.stderrListeners) {
          listener(tail)
        }
      }
    } catch {
      // Ignore stderr consumer errors.
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
      this.emitError(error instanceof Error ? error : new Error(String(error)))
      return
    }

    if (!payload || typeof payload !== 'object') {
      return
    }

    const message = payload as Partial<JsonRpcRequest & JsonRpcResponse & JsonRpcNotification>

    if (typeof message.id === 'number' && typeof message.method === 'string') {
      const request: JsonRpcServerRequest = {
        id: message.id,
        method: message.method,
        params: message.params,
      }
      for (const listener of this.serverRequestListeners) {
        listener(request)
      }
      return
    }

    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (!pending) return

      this.pending.delete(message.id)
      clearTimeout(pending.timer)

      if (message.error?.message) {
        pending.reject(new Error(message.error.message))
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (typeof message.method === 'string') {
      const notification: JsonRpcNotification = {
        method: message.method,
        params: message.params,
      }
      for (const listener of this.notificationListeners) {
        listener(notification)
      }
    }
  }

  private async writeMessage(message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): Promise<void> {
    await Promise.resolve(this.stdinSink.write(`${JSON.stringify(message)}\n`))
  }

  private emitClose(): void {
    for (const listener of this.closeListeners) {
      listener()
    }
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      listener(error)
    }
  }
}

class CodexAppServerSession {
  private process: Bun.Subprocess<'pipe', 'pipe', 'pipe'> | null = null
  private connection: JsonRpcConnection | null = null
  private startupPromise: Promise<void> | null = null
  private pendingLoginId: string | null = null
  private lastLoginError: string | null = null
  private pendingDeviceLogin: PendingDeviceLogin | null = null
  private externalAuthState: ExternalAuthState | null = null
  private externalAuthRefreshPromise: Promise<void> | null = null
  private lastUsedAt = Date.now()
  private readonly runsById = new Map<string, TurnRunState>()
  private readonly runIdByTurnKey = new Map<string, string>()

  constructor(
    private readonly userId: string,
    private readonly config: SessionConfig
  ) {}

  touch(): void {
    this.lastUsedAt = Date.now()
  }

  isIdle(now: number, idleMs: number): boolean {
    return now - this.lastUsedAt > idleMs
  }

  getActiveRunCount(): number {
    return this.runsById.size
  }

  sweepCompletedRuns(now: number, retentionMs: number): void {
    for (const run of this.runsById.values()) {
      if (!run.completed || run.completedAt === null) continue
      if (now - run.completedAt < retentionMs) continue
      this.closeRun(run.runId)
    }
  }

  private makeTurnKey(threadId: string, turnId: string): string {
    return `${threadId}:${turnId}`
  }

  private makeRunId(): string {
    const random = Math.random().toString(36).slice(2, 10)
    return `${Date.now()}-${random}`
  }

  private getRunByTurn(threadId: string, turnId: string): TurnRunState | null {
    const turnKey = this.makeTurnKey(threadId, turnId)
    const runId = this.runIdByTurnKey.get(turnKey)
    if (!runId) return null
    return this.runsById.get(runId) ?? null
  }

  private enqueueRunEvent(run: TurnRunState, event: TurnRunEvent): void {
    if (run.waiters.length > 0) {
      const waiter = run.waiters.shift()
      waiter?.(event)
      return
    }
    run.events.push(event)
  }

  private completeRun(run: TurnRunState, errorMessage: string | null): void {
    if (run.completed) return

    run.completed = true
    run.completionError = errorMessage
    run.completedAt = Date.now()

    for (const [requestId, pending] of run.pendingToolResponses.entries()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Turn completed before tool result was submitted'))
      run.pendingToolResponses.delete(requestId)
    }

    this.enqueueRunEvent(run, {
      type: 'turn-complete',
      threadId: run.threadId,
      turnId: run.turnId,
      model: run.model,
      text: run.text,
      usage: run.usage,
      error: errorMessage,
    })
  }

  private failAllRuns(message: string): void {
    for (const run of this.runsById.values()) {
      if (!run.completed) {
        this.completeRun(run, message)
      }
    }
  }

  private isConnectedAuthMode(authMode: string | null): boolean {
    return authMode === 'chatgpt' || authMode === 'chatgptAuthTokens'
  }

  private clearPendingDeviceLogin(loginId?: string): void {
    const pending = this.pendingDeviceLogin
    if (!pending) return
    if (loginId && pending.loginId !== loginId) return
    pending.canceled = true
    this.pendingDeviceLogin = null
  }

  private async applyExternalAuthTokens(authState: ExternalAuthState): Promise<void> {
    await this.request('account/login/start', {
      type: 'chatgptAuthTokens',
      accessToken: authState.accessToken,
      chatgptAccountId: authState.accountId,
      chatgptPlanType: authState.planType ?? undefined,
    })
  }

  private async refreshExternalAuthInternal(state: ExternalAuthState): Promise<void> {
    const refreshToken = state.refreshToken
    if (!refreshToken) return

    const refreshed = await refreshAccessToken(refreshToken)
    const claims = parseJwtAuthClaims(refreshed.idToken ?? refreshed.accessToken)
    const accountId = claims.accountId ?? state.accountId
    if (!accountId) {
      throw new Error('Refreshed ChatGPT token did not include an account id')
    }

    const nextAuthState: ExternalAuthState = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? refreshToken,
      idToken: refreshed.idToken ?? state.idToken,
      accountId,
      planType: claims.planType ?? state.planType,
      email: claims.email ?? state.email,
      expMs: claims.exp !== null ? claims.exp * 1000 : state.expMs,
    }

    await this.applyExternalAuthTokens(nextAuthState)
    this.externalAuthState = nextAuthState
    this.lastLoginError = null
  }

  private async maybeRefreshExternalAuth(forceRefresh: boolean): Promise<void> {
    const state = this.externalAuthState
    if (!state || !state.refreshToken) {
      return
    }

    const refreshLeewayMs =
      Number.isFinite(EXTERNAL_AUTH_REFRESH_LEEWAY_MS) && EXTERNAL_AUTH_REFRESH_LEEWAY_MS >= 0
        ? EXTERNAL_AUTH_REFRESH_LEEWAY_MS
        : 60_000
    const shouldRefresh =
      forceRefresh || (state.expMs !== null && Date.now() + refreshLeewayMs >= state.expMs)
    if (!shouldRefresh) {
      return
    }

    if (!this.externalAuthRefreshPromise) {
      this.externalAuthRefreshPromise = this.refreshExternalAuthInternal(state).finally(() => {
        this.externalAuthRefreshPromise = null
      })
    }

    return this.externalAuthRefreshPromise
  }

  private async startBrowserLoginFlow(): Promise<ChatgptLoginStartResult> {
    this.clearPendingDeviceLogin()

    const result = (await this.request('account/login/start', {
      type: 'chatgpt',
    })) as LoginChatgptResult

    this.pendingLoginId = readString(result?.loginId)
    this.lastLoginError = null

    return {
      authUrl: readString(result?.authUrl),
      loginId: this.pendingLoginId,
      status: await this.getStatus(),
      loginMethod: 'browser',
      deviceCode: null,
      verificationUrl: null,
    }
  }

  private async pollDeviceLogin(pending: PendingDeviceLogin): Promise<void> {
    const timeoutMs =
      Number.isFinite(DEVICE_AUTH_TIMEOUT_MS) && DEVICE_AUTH_TIMEOUT_MS > 0
        ? DEVICE_AUTH_TIMEOUT_MS
        : 15 * 60 * 1_000
    const deadline = pending.startedAt + timeoutMs

    while (true) {
      if (pending.canceled || this.pendingDeviceLogin?.loginId !== pending.loginId) {
        return
      }

      if (Date.now() >= deadline) {
        throw new Error('ChatGPT device auth timed out after 15 minutes')
      }

      await waitMs(pending.intervalSeconds * 1000)
      if (pending.canceled || this.pendingDeviceLogin?.loginId !== pending.loginId) {
        return
      }

      const pollResult = await pollDeviceToken({
        deviceAuthId: pending.deviceAuthId,
        userCode: pending.userCode,
      })
      if (pollResult.status === 'pending') {
        continue
      }

      const exchanged = await exchangeAuthorizationCode({
        authorizationCode: pollResult.authorizationCode,
        codeVerifier: pollResult.codeVerifier,
      })
      const claims = parseJwtAuthClaims(exchanged.idToken ?? exchanged.accessToken)
      const accountId = claims.accountId
      if (!accountId) {
        throw new Error('ChatGPT token did not include a workspace/account id')
      }

      const nextAuthState: ExternalAuthState = {
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        idToken: exchanged.idToken,
        accountId,
        planType: claims.planType,
        email: claims.email,
        expMs: claims.exp !== null ? claims.exp * 1000 : null,
      }

      await this.applyExternalAuthTokens(nextAuthState)
      if (pending.canceled || this.pendingDeviceLogin?.loginId !== pending.loginId) {
        return
      }

      this.externalAuthState = nextAuthState
      this.pendingDeviceLogin = null
      this.pendingLoginId = null
      this.lastLoginError = null
      return
    }
  }

  private async startDeviceLoginFlow(): Promise<ChatgptLoginStartResult> {
    this.clearPendingDeviceLogin()
    const deviceCode = await requestDeviceUserCode()
    const pending: PendingDeviceLogin = {
      loginId: deviceCode.deviceAuthId,
      deviceAuthId: deviceCode.deviceAuthId,
      userCode: deviceCode.userCode,
      intervalSeconds: deviceCode.intervalSeconds,
      verificationUrl: deviceCode.verificationUrl,
      startedAt: Date.now(),
      canceled: false,
    }

    this.pendingDeviceLogin = pending
    this.pendingLoginId = pending.loginId
    this.lastLoginError = null

    void this.pollDeviceLogin(pending).catch(error => {
      if (this.pendingDeviceLogin?.loginId !== pending.loginId) {
        return
      }
      this.pendingDeviceLogin = null
      this.pendingLoginId = null
      this.lastLoginError = error instanceof Error ? error.message : String(error)
    })

    return {
      authUrl: pending.verificationUrl,
      loginId: pending.loginId,
      status: await this.getStatus(),
      loginMethod: 'device',
      deviceCode: pending.userCode,
      verificationUrl: pending.verificationUrl,
    }
  }

  async getStatus(): Promise<ChatgptStatus> {
    this.touch()
    await this.maybeRefreshExternalAuth(false).catch(error => {
      this.lastLoginError = error instanceof Error ? error.message : String(error)
    })

    const [accountResult, rateLimitsResult] = await Promise.all([
      this.request('account/read', {
        refreshToken: false,
      }) as Promise<AccountReadResult>,
      this.request('account/rateLimits/read').catch(() => null) as Promise<AccountRateLimitsReadResult | null>,
    ])
    const account = readObject(accountResult?.account ?? null)
    const authMode = readString(account?.type) as
      | 'apiKey'
      | 'chatgpt'
      | 'chatgptAuthTokens'
      | null
    const planUsage = pickPlanUsageSnapshot(rateLimitsResult)

    if (this.isConnectedAuthMode(authMode)) {
      this.pendingLoginId = null
      this.lastLoginError = null
    }

    return {
      available: true,
      connected: this.isConnectedAuthMode(authMode),
      authMode,
      email: readString(account?.email) ?? this.externalAuthState?.email ?? null,
      planType:
        readString(account?.planType) ?? planUsage?.planType ?? this.externalAuthState?.planType ?? null,
      planUsage,
      pendingLoginId: this.pendingLoginId,
      lastLoginError: this.lastLoginError,
      requiresOpenaiAuth:
        typeof accountResult?.requiresOpenaiAuth === 'boolean'
          ? accountResult.requiresOpenaiAuth
          : null,
    }
  }

  async startChatgptLogin(): Promise<ChatgptLoginStartResult> {
    this.touch()
    if (CHATGPT_LOGIN_MODE === 'browser') {
      return this.startBrowserLoginFlow()
    }
    return this.startDeviceLoginFlow()
  }

  async cancelChatgptLogin(loginId: string | null): Promise<ChatgptStatus> {
    this.touch()
    const targetLoginId = loginId ?? this.pendingLoginId
    if (!targetLoginId) {
      return this.getStatus()
    }

    if (this.pendingDeviceLogin?.loginId === targetLoginId) {
      this.clearPendingDeviceLogin(targetLoginId)
      this.pendingLoginId = null
      this.lastLoginError = null
      return this.getStatus()
    }

    await this.request('account/login/cancel', { loginId: targetLoginId })
    this.pendingLoginId = null
    this.lastLoginError = null
    return this.getStatus()
  }

  async logout(): Promise<ChatgptStatus> {
    this.touch()
    this.clearPendingDeviceLogin()
    await this.request('account/logout')
    this.pendingLoginId = null
    this.lastLoginError = null
    this.externalAuthState = null
    return this.getStatus()
  }

  async startTurnRun(options: RunChatgptTurnOptions): Promise<StartTurnRunResult> {
    this.touch()
    const status = await this.getStatus()
    if (!status.connected) {
      throw new Error('ChatGPT is not connected for this user')
    }

    const prompt = options.prompt.trim()
    if (!prompt) {
      throw new Error('Prompt is required for codex turn')
    }

    const threadResult = (await this.request('thread/start', {
      model: options.model ?? Bun.env.CODEX_APP_SERVER_MODEL ?? undefined,
      cwd: Bun.env.CODEX_APP_SERVER_CWD ?? options.cwd ?? resolveBunCwd(),
      approvalPolicy: 'never',
      sandbox: 'read-only',
      baseInstructions: options.baseInstructions ?? undefined,
      developerInstructions: options.developerInstructions ?? undefined,
      personality: options.personality ?? 'none',
      dynamicTools: Array.isArray(options.dynamicTools) && options.dynamicTools.length > 0
        ? options.dynamicTools
        : undefined,
      ephemeral: true,
      experimentalRawEvents: false,
      persistExtendedHistory: false,
    })) as Record<string, unknown>

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
    })) as Record<string, unknown>

    const turn = readObject(turnStartResult?.turn)
    const turnId = readString(turn?.id)
    if (!turnId) {
      throw new Error('codex app-server did not return a turn id')
    }

    const runId = this.makeRunId()
    const run: TurnRunState = {
      runId,
      threadId,
      turnId,
      model: resolvedModel,
      text: '',
      usage: null,
      completed: false,
      completionError: null,
      events: [],
      waiters: [],
      pendingToolResponses: new Map<string, PendingToolResponse>(),
      createdAt: Date.now(),
      completedAt: null,
    }

    this.runsById.set(runId, run)
    this.runIdByTurnKey.set(this.makeTurnKey(threadId, turnId), runId)

    return {
      runId,
      threadId,
      turnId,
      model: resolvedModel,
    }
  }

  async nextTurnEvent(runId: string, timeoutMs = 25_000): Promise<TurnRunEvent | null> {
    this.touch()
    const run = this.runsById.get(runId)
    if (!run) {
      throw new Error('Unknown runId')
    }

    if (run.events.length > 0) {
      return run.events.shift() ?? null
    }

    if (run.completed) {
      return null
    }

    const boundedTimeoutMs =
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? Math.min(timeoutMs, Math.max(5_000, this.config.turnTimeoutMs))
        : 25_000

    return new Promise(resolve => {
      const timer = setTimeout(() => {
        const index = run.waiters.indexOf(waiter)
        if (index >= 0) {
          run.waiters.splice(index, 1)
        }
        resolve(null)
      }, boundedTimeoutMs)

      const waiter = (event: TurnRunEvent | null) => {
        clearTimeout(timer)
        resolve(event)
      }
      run.waiters.push(waiter)
    })
  }

  async submitToolResult(runId: string, requestId: string, result: unknown): Promise<void> {
    this.touch()
    const run = this.runsById.get(runId)
    if (!run) {
      throw new Error('Unknown runId')
    }
    const pending = run.pendingToolResponses.get(requestId)
    if (!pending) {
      throw new Error('Unknown tool request id')
    }
    run.pendingToolResponses.delete(requestId)
    clearTimeout(pending.timer)
    pending.resolve({ result })
  }

  closeRun(runId: string): void {
    const run = this.runsById.get(runId)
    if (!run) return

    for (const waiter of run.waiters) {
      waiter(null)
    }
    run.waiters.length = 0

    for (const [requestId, pending] of run.pendingToolResponses.entries()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Turn run was closed'))
      run.pendingToolResponses.delete(requestId)
    }

    this.runsById.delete(runId)
    this.runIdByTurnKey.delete(this.makeTurnKey(run.threadId, run.turnId))
  }

  async runChatgptTurn(options: RunChatgptTurnOptions): Promise<RunChatgptTurnResult> {
    const start = await this.startTurnRun(options)
    let finalResult: RunChatgptTurnResult | null = null

    try {
      while (!finalResult) {
        const event = await this.nextTurnEvent(start.runId, 30_000)
        if (!event) continue

        if (event.type === 'tool-call-request') {
          await this.submitToolResult(start.runId, event.requestId, {
            success: false,
            contentItems: [
              {
                type: 'inputText',
                text: `Tool "${event.toolName}" is not available in this mode.`,
              },
            ],
          })
          continue
        }

        if (event.type === 'turn-complete') {
          if (event.error) {
            throw new Error(event.error)
          }
          finalResult = {
            threadId: event.threadId,
            turnId: event.turnId,
            model: event.model,
            text: event.text,
            usage: event.usage,
          }
        }
      }

      return finalResult
    } finally {
      this.closeRun(start.runId)
    }
  }

  dispose(): void {
    this.clearPendingDeviceLogin()
    this.externalAuthState = null

    if (this.connection) {
      this.connection.dispose(new Error('codex app-server session disposed'))
      this.connection = null
    }

    if (this.process) {
      try {
        this.process.kill()
      } catch {
        // noop
      }
      this.process = null
    }

    this.startupPromise = null
    for (const runId of [...this.runsById.keys()]) {
      this.closeRun(runId)
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
    const codexHome = joinPath(this.config.codexHomeRoot, sanitizePathSegment(this.userId))
    await $`mkdir -p ${codexHome}`

    const child = Bun.spawn(
      [this.config.codexBin, ...this.config.codexArgs, 'app-server', ...this.config.appServerArgs],
      {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...Bun.env,
          CODEX_HOME: codexHome,
        },
      }
    )

    if (!child.stdin || !child.stdout) {
      throw new Error('Failed to start codex app-server process pipes')
    }

    const connection = new JsonRpcConnection(child.stdin, child.stdout, child.stderr ?? undefined)
    this.process = child
    this.connection = connection

    connection.onNotification(message => {
      this.handleNotification(message.method, message.params)
    })

    connection.onServerRequest(async message => {
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

    connection.onStderr(line => {
      if (line) {
        console.warn(`[codex-proxy][stderr][${this.userId}] ${line}`)
      }
    })

    connection.onError(() => {
      if (this.process) {
        try {
          this.process.kill()
        } catch {
          // noop
        }
      }
    })

    connection.onClose(() => {
      this.failAllRuns('codex app-server connection closed')
    })

    let initialized = false

    const startupPromise = (async () => {
      await connection.sendRequest(
        'initialize',
        {
          clientInfo: {
            name: 'codex_proxy',
            title: 'Codex Proxy',
            version: '0.1.0',
          },
          capabilities: {
            experimentalApi: true,
          },
        },
        this.config.startupTimeoutMs
      )
      connection.sendNotification('initialized', {})
      initialized = true
    })()

    const childExitBeforeInitPromise = child.exited.then(code => {
      if (!initialized) {
        throw new Error(`codex app-server exited before initialization (code ${code ?? 'unknown'})`)
      }
    })

    try {
      await Promise.race([startupPromise, childExitBeforeInitPromise])
    } catch (error) {
      connection.dispose(error instanceof Error ? error : new Error(String(error)))
      try {
        child.kill()
      } catch {
        // noop
      }
      this.process = null
      this.connection = null
      throw error
    }

    void child.exited.then(() => {
      connection.dispose(new Error('codex app-server exited'))
      this.failAllRuns('codex app-server exited')
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
      return
    }

    if (method === 'account/updated') {
      const payload = readObject(params)
      const authMode = readString(payload?.authMode)
      if (this.isConnectedAuthMode(authMode)) {
        this.pendingLoginId = null
        this.lastLoginError = null
      }
      return
    }

    const payload = readObject(params)
    if (!payload) {
      return
    }

    const payloadThreadId = readString(payload.threadId)
    const payloadTurnId = readString(payload.turnId)
    if (!payloadThreadId || !payloadTurnId) {
      return
    }

    const run = this.getRunByTurn(payloadThreadId, payloadTurnId)
    if (!run) {
      return
    }

    if (method === 'thread/tokenUsage/updated') {
      const tokenUsage = readObject(payload.tokenUsage)
      const total = readObject(tokenUsage?.total)
      const totalTokens = readNumber(total?.totalTokens)
      const inputTokens = readNumber(total?.inputTokens)
      const cachedInputTokens = readNumber(total?.cachedInputTokens)
      const outputTokens = readNumber(total?.outputTokens)
      const reasoningOutputTokens = readNumber(total?.reasoningOutputTokens)
      if (
        totalTokens !== null &&
        inputTokens !== null &&
        cachedInputTokens !== null &&
        outputTokens !== null &&
        reasoningOutputTokens !== null
      ) {
        run.usage = {
          totalTokens,
          inputTokens,
          cachedInputTokens,
          outputTokens,
          reasoningOutputTokens,
        }
      }
      return
    }

    if (method === 'item/agentMessage/delta') {
      const delta = readString(payload.delta)
      if (!delta) return
      run.text += delta
      this.enqueueRunEvent(run, { type: 'text-delta', delta })
      return
    }

    if (method === 'item/completed') {
      const item = readObject(payload.item)
      if (!item) return
      if (readString(item.type) !== 'agentMessage') return
      const completedText = readString(item.text)
      if (!completedText) return
      if (!run.text) {
        run.text = completedText
        this.enqueueRunEvent(run, { type: 'text-delta', delta: completedText })
      }
      return
    }

    if (method === 'turn/completed') {
      const turn = readObject(payload.turn)
      if (!turn) return
      const status = readString(turn.status)

      if (status === 'failed') {
        const turnError = readObject(turn.error)
        const errorMessage = readString(turnError?.message) ?? 'codex app-server turn failed'
        this.completeRun(run, errorMessage)
        return
      }

      if (status === 'interrupted') {
        this.completeRun(run, 'codex app-server turn was interrupted')
        return
      }

      this.completeRun(run, null)
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
      const params = readObject(message.params)
      const threadId = readString(params?.threadId)
      const turnId = readString(params?.turnId)
      const toolName = readString(params?.tool) ?? 'unknown'
      const toolCallId = readString(params?.callId) ?? `call-${Date.now()}`
      const toolInput = params?.arguments

      if (!threadId || !turnId) {
        return {
          result: {
            success: false,
            contentItems: [
              {
                type: 'inputText',
                text: 'Invalid dynamic tool call payload.',
              },
            ],
          },
        }
      }

      const run = this.getRunByTurn(threadId, turnId)
      if (!run) {
        return {
          result: {
            success: false,
            contentItems: [
              {
                type: 'inputText',
                text: `No active turn run for tool "${toolName}".`,
              },
            ],
          },
        }
      }

      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const toolTimeoutMs =
        Number.isFinite(this.config.turnTimeoutMs) && this.config.turnTimeoutMs > 0
          ? Math.min(Math.max(15_000, this.config.turnTimeoutMs), 300_000)
          : 120_000

      const toolResponse = await new Promise<{ result?: unknown; error?: JsonRpcError }>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            run.pendingToolResponses.delete(requestId)
            reject(new Error(`Tool call "${toolName}" timed out waiting for proxy response`))
          }, toolTimeoutMs)

          run.pendingToolResponses.set(requestId, { resolve, reject, timer })
          this.enqueueRunEvent(run, {
            type: 'tool-call-request',
            requestId,
            toolCallId,
            toolName,
            input: toolInput,
          })
        }
      ).catch(error => {
        const message = error instanceof Error ? error.message : String(error)
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
      })

      return toolResponse
    }

    if (message.method === 'item/tool/requestUserInput') {
      return { result: { answers: {} } }
    }

    if (message.method === 'account/chatgptAuthTokens/refresh') {
      try {
        await this.maybeRefreshExternalAuth(true)
      } catch (error) {
        return {
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : 'Failed to refresh ChatGPT token',
          },
        }
      }

      if (!this.externalAuthState) {
        return {
          error: {
            code: -32000,
            message: 'External ChatGPT auth is not configured',
          },
        }
      }

      return {
        result: {
          accessToken: this.externalAuthState.accessToken,
          chatgptAccountId: this.externalAuthState.accountId,
          chatgptPlanType: this.externalAuthState.planType,
        },
      }
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

const resolveConfig = (): SessionConfig => {
  const startupTimeoutMs = Number(Bun.env.CODEX_APP_SERVER_STARTUP_TIMEOUT_MS ?? 15_000)
  const requestTimeoutMs = Number(Bun.env.CODEX_APP_SERVER_REQUEST_TIMEOUT_MS ?? 45_000)
  const turnTimeoutMs = Number(Bun.env.CODEX_APP_SERVER_TURN_TIMEOUT_MS ?? 180_000)

  const parsedCodexArgs =
    parseJsonArgs(Bun.env.CODEX_FLAGS_JSON) ?? parseSpaceArgs(Bun.env.CODEX_FLAGS)
  const parsedAppServerArgs =
    parseJsonArgs(Bun.env.CODEX_APP_SERVER_FLAGS_JSON) ??
    parseSpaceArgs(Bun.env.CODEX_APP_SERVER_FLAGS)

  return {
    codexBin: Bun.env.CODEX_BIN ?? 'codex',
    codexArgs: sanitizeCodexArgsForReadOnly(parsedCodexArgs, 'CODEX_FLAGS'),
    appServerArgs: sanitizeCodexArgsForReadOnly(parsedAppServerArgs, 'CODEX_APP_SERVER_FLAGS'),
    codexHomeRoot:
      Bun.env.CODEX_APP_SERVER_HOME_ROOT ??
      joinPath(HOME_DIR, '.the-everything-assistant', 'codex-proxy-home'),
    startupTimeoutMs: Number.isFinite(startupTimeoutMs) ? Math.max(startupTimeoutMs, 1_000) : 15_000,
    requestTimeoutMs: Number.isFinite(requestTimeoutMs) ? Math.max(requestTimeoutMs, 1_000) : 45_000,
    turnTimeoutMs: Number.isFinite(turnTimeoutMs) ? Math.max(turnTimeoutMs, 5_000) : 180_000,
  }
}

const registry: SessionRegistry = {
  sessions: new Map<string, CodexAppServerSession>(),
  config: resolveConfig(),
}

const getOrCreateSession = (userId: string): CodexAppServerSession => {
  registry.config = resolveConfig()
  const existing = registry.sessions.get(userId)
  if (existing) {
    existing.touch()
    return existing
  }

  const session = new CodexAppServerSession(userId, registry.config)
  registry.sessions.set(userId, session)
  return session
}

const disposeSession = (userId: string): void => {
  const session = registry.sessions.get(userId)
  if (!session) return
  session.dispose()
  registry.sessions.delete(userId)
}

const expectedToken = Bun.env.CODEX_PROXY_AUTH_TOKEN?.trim() || ''

const getProvidedToken = (request: Request): string | null => {
  const bearer = request.headers.get('authorization')
  if (bearer && bearer.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim()
  }
  const headerToken = request.headers.get('x-codex-proxy-token')
  if (headerToken && headerToken.trim()) {
    return headerToken.trim()
  }
  return null
}

const isAuthorized = (request: Request): boolean => {
  if (!expectedToken) return true
  const provided = getProvidedToken(request)
  return Boolean(provided && provided === expectedToken)
}

const json = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init?.headers || {}),
    },
  })

const badRequest = (message: string): Response => json({ error: message }, { status: 400 })
const unauthorized = (): Response => json({ error: 'Unauthorized' }, { status: 401 })

const parseBody = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const payload = await request.json()
    if (!payload || typeof payload !== 'object') return null
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

const userIdFromBody = (body: Record<string, unknown> | null): string | null => {
  const userId = readString(body?.userId)
  if (!userId || !userId.trim()) return null
  return userId.trim()
}

const sessionIdleMs = Number(Bun.env.CODEX_PROXY_SESSION_IDLE_MS ?? 30 * 60 * 1_000)
const sessionSweepMs = Number(Bun.env.CODEX_PROXY_SESSION_SWEEP_MS ?? 5 * 60 * 1_000)
const runRetentionMs = Number(Bun.env.CODEX_PROXY_RUN_RETENTION_MS ?? 10 * 60 * 1_000)

const sweepTimer = setInterval(() => {
  const now = Date.now()
  for (const [userId, session] of registry.sessions.entries()) {
    session.sweepCompletedRuns(now, Math.max(10_000, runRetentionMs))
    if (session.isIdle(now, Math.max(10_000, sessionIdleMs))) {
      session.dispose()
      registry.sessions.delete(userId)
    }
  }
}, Math.max(5_000, sessionSweepMs))

const host = Bun.env.CODEX_PROXY_HOST || '0.0.0.0'
const port = Number(Bun.env.CODEX_PROXY_PORT || 8788)

const server = Bun.serve({
  hostname: host,
  port,
  fetch: async request => {
    const { pathname } = new URL(request.url)

    if (pathname === '/health' && request.method === 'GET') {
      let activeRuns = 0
      for (const session of registry.sessions.values()) {
        activeRuns += session.getActiveRunCount()
      }
      return json({
        ok: true,
        codexBin: registry.config.codexBin,
        activeSessions: registry.sessions.size,
        activeRuns,
      })
    }

    if (!isAuthorized(request)) {
      return unauthorized()
    }

    if (pathname === '/v1/chatgpt/status' && request.method === 'POST') {
      const body = await parseBody(request)
      const userId = userIdFromBody(body)
      if (!userId) return badRequest('userId is required')

      try {
        const session = getOrCreateSession(userId)
        const status = await session.getStatus()
        return json(status)
      } catch (error: any) {
        return json({ error: error?.message || 'Failed to get ChatGPT status' }, { status: 500 })
      }
    }

    if (pathname === '/v1/chatgpt/start' && request.method === 'POST') {
      const body = await parseBody(request)
      const userId = userIdFromBody(body)
      if (!userId) return badRequest('userId is required')

      try {
        const session = getOrCreateSession(userId)
        const result = await session.startChatgptLogin()
        return json(result)
      } catch (error: any) {
        return json({ error: error?.message || 'Failed to start ChatGPT login' }, { status: 500 })
      }
    }

    if (pathname === '/v1/chatgpt/cancel' && request.method === 'POST') {
      const body = await parseBody(request)
      const userId = userIdFromBody(body)
      if (!userId) return badRequest('userId is required')

      try {
        const session = getOrCreateSession(userId)
        const status = await session.cancelChatgptLogin(readString(body?.loginId))
        return json(status)
      } catch (error: any) {
        return json({ error: error?.message || 'Failed to cancel ChatGPT login' }, { status: 500 })
      }
    }

    if (pathname === '/v1/chatgpt/disconnect' && request.method === 'POST') {
      const body = await parseBody(request)
      const userId = userIdFromBody(body)
      if (!userId) return badRequest('userId is required')

      try {
        const session = getOrCreateSession(userId)
        const status = await session.logout()
        return json(status)
      } catch (error: any) {
        return json({ error: error?.message || 'Failed to disconnect ChatGPT' }, { status: 500 })
      }
    }

    if (pathname === '/v1/chatgpt/dispose' && request.method === 'POST') {
      const body = await parseBody(request)
      const userId = userIdFromBody(body)
      if (!userId) return badRequest('userId is required')
      disposeSession(userId)
      return json({ ok: true })
    }

    if (pathname === '/v1/chatgpt/turn/start' && request.method === 'POST') {
      const body = await parseBody(request)
      const userId = userIdFromBody(body)
      if (!userId) return badRequest('userId is required')

      const optionsRaw = readObject(body?.options)
      const prompt = readString(optionsRaw?.prompt)
      if (!prompt || !prompt.trim()) {
        return badRequest('options.prompt is required')
      }

      const runOptions: RunChatgptTurnOptions = {
        prompt,
        model: readString(optionsRaw?.model),
        cwd: readString(optionsRaw?.cwd),
        baseInstructions: readString(optionsRaw?.baseInstructions),
        developerInstructions: readString(optionsRaw?.developerInstructions),
        personality:
          (readString(optionsRaw?.personality) as RunChatgptTurnOptions['personality']) ?? 'none',
        dynamicTools: Array.isArray(optionsRaw?.dynamicTools)
          ? (optionsRaw?.dynamicTools as Array<{
              name: string
              description?: string
              inputSchema: unknown
            }>)
          : undefined,
      }

      try {
        const session = getOrCreateSession(userId)
        const result = await session.startTurnRun(runOptions)
        return json(result)
      } catch (error: any) {
        return json({ error: error?.message || 'Failed to start ChatGPT turn' }, { status: 500 })
      }
    }

    if (pathname === '/v1/chatgpt/turn/next' && request.method === 'POST') {
      const body = await parseBody(request)
      const userId = userIdFromBody(body)
      if (!userId) return badRequest('userId is required')
      const runId = readString(body?.runId)
      if (!runId) return badRequest('runId is required')
      const timeoutMs = readNumber(body?.timeoutMs) ?? 25_000

      try {
        const session = getOrCreateSession(userId)
        const event = await session.nextTurnEvent(runId, timeoutMs)
        return json({ event })
      } catch (error: any) {
        return json({ error: error?.message || 'Failed to fetch turn event' }, { status: 500 })
      }
    }

    if (pathname === '/v1/chatgpt/turn/tool-result' && request.method === 'POST') {
      const body = await parseBody(request)
      const userId = userIdFromBody(body)
      if (!userId) return badRequest('userId is required')
      const runId = readString(body?.runId)
      if (!runId) return badRequest('runId is required')
      const requestId = readString(body?.requestId)
      if (!requestId) return badRequest('requestId is required')
      const result = body?.result

      try {
        const session = getOrCreateSession(userId)
        await session.submitToolResult(runId, requestId, result)
        return json({ ok: true })
      } catch (error: any) {
        return json({ error: error?.message || 'Failed to submit tool result' }, { status: 500 })
      }
    }

    if (pathname === '/v1/chatgpt/turn/close' && request.method === 'POST') {
      const body = await parseBody(request)
      const userId = userIdFromBody(body)
      if (!userId) return badRequest('userId is required')
      const runId = readString(body?.runId)
      if (!runId) return badRequest('runId is required')

      try {
        const session = getOrCreateSession(userId)
        session.closeRun(runId)
        return json({ ok: true })
      } catch (error: any) {
        return json({ error: error?.message || 'Failed to close turn run' }, { status: 500 })
      }
    }

    if (pathname === '/v1/chatgpt/turn' && request.method === 'POST') {
      const body = await parseBody(request)
      const userId = userIdFromBody(body)
      if (!userId) return badRequest('userId is required')

      const optionsRaw = readObject(body?.options)
      const prompt = readString(optionsRaw?.prompt)
      if (!prompt || !prompt.trim()) {
        return badRequest('options.prompt is required')
      }

      const runOptions: RunChatgptTurnOptions = {
        prompt,
        model: readString(optionsRaw?.model),
        cwd: readString(optionsRaw?.cwd),
        baseInstructions: readString(optionsRaw?.baseInstructions),
        developerInstructions: readString(optionsRaw?.developerInstructions),
        personality:
          (readString(optionsRaw?.personality) as RunChatgptTurnOptions['personality']) ?? 'none',
      }

      try {
        const session = getOrCreateSession(userId)
        const result = await session.runChatgptTurn(runOptions)
        return json(result)
      } catch (error: any) {
        return json({ error: error?.message || 'Failed to run ChatGPT turn' }, { status: 500 })
      }
    }

    return json({ error: 'Not found' }, { status: 404 })
  },
})

console.log(`[codex-proxy] listening on http://${host}:${port}`)

const shutdown = () => {
  clearInterval(sweepTimer)
  for (const session of registry.sessions.values()) {
    session.dispose()
  }
  registry.sessions.clear()
  server.stop(true)
  Bun.exit(0)
}
