'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { randomBytes, randomUUID } = require('crypto')

require('dotenv').config({ quiet: true })

const int = (value, fallback) => {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}
const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function findUpwards(filename, startDir) {
  let current = startDir
  while (true) {
    const candidate = path.join(current, filename)
    if (fs.existsSync(candidate)) return candidate
    const next = path.dirname(current)
    if (next === current) return null
    current = next
  }
}

function resolveManifestPath(env) {
  if (env.HUB_CAPABILITIES_PATH && fs.existsSync(env.HUB_CAPABILITIES_PATH)) {
    return env.HUB_CAPABILITIES_PATH
  }
  const candidates = [
    path.resolve(__dirname, '../../../hub-capabilities.json'),
    path.resolve(__dirname, '../hub-capabilities.json'),
    path.resolve(process.cwd(), 'hub-capabilities.json'),
  ]
  return (
    candidates.find(candidate => fs.existsSync(candidate)) ||
    findUpwards('hub-capabilities.json', __dirname) ||
    findUpwards('hub-capabilities.json', process.cwd()) ||
    candidates[0]
  )
}

function resolveBinaryPath(env) {
  if (env.BINARY_PATH) return path.resolve(env.BINARY_PATH)
  const name = process.platform === 'win32' ? 'binary.exe' : 'binary'
  return path.resolve(__dirname, '..', name)
}

/** All runtime configuration, read once from the environment. */
function loadConfig(env = process.env) {
  const nodeEnv = (env.NODE_ENV || 'development').toLowerCase()
  const isProduction = nodeEnv === 'production'
  const tmp = os.tmpdir()

  const apiKey = env.PROXY_API_KEY || env.PROXY_SHARED_SECRET || ''
  const authOptOut = bool(env.PROXY_AUTH_DISABLED, false)

  let tokenSecret = env.PROXY_TOKEN_SECRET || ''
  let tokenSecretEphemeral = false
  if (!tokenSecret) {
    tokenSecret = randomBytes(32).toString('hex')
    tokenSecretEphemeral = true
  }

  return {
    nodeEnv,
    isProduction,
    port: int(env.PORT, 3001),
    verboseLogs: !isProduction && bool(env.PROXY_VERBOSE_LOGS, false),

    // HTTP API authentication (shared secret with the Next app).
    apiKey,
    // Explicit, development-only opt-out. Ignored in production (fail closed).
    authDisabled: authOptOut && !isProduction,
    authOptOutRequestedInProduction: authOptOut && isProduction,

    // Continuation tokens + signed download URLs.
    tokenSecret,
    tokenSecretEphemeral,
    workflowTtlSeconds: int(env.WORKFLOW_TOKEN_TTL_SECONDS, 15 * 60),
    publicBaseUrl: (env.PROXY_PUBLIC_URL || '').replace(/\/+$/, ''),
    trustProxy: env.TRUST_PROXY || false,

    // cli-top process management
    binaryPath: resolveBinaryPath(env),
    cliTimeoutMs: int(env.CLI_TIMEOUT, 120_000),
    cliDownloadTimeoutMs: int(env.CLI_DOWNLOAD_TIMEOUT, 300_000),
    runRoot: env.CLI_RUN_DIR || path.join(tmp, 'vtop-proxy-runs'),
    cliUuid: env.CLI_TOP_UUID || randomUUID(),
    envPassthrough: (env.CLI_ENV_PASSTHROUGH || '')
      .split(',')
      .map(name => name.trim())
      .filter(Boolean),
    retryAttempts: Math.max(0, int(env.CLI_RETRY_ATTEMPTS, 1)),
    maxStdoutBytes: int(env.CLI_MAX_STDOUT_BYTES, 32 * 1024 * 1024),

    // Concurrency / queueing
    maxConcurrent: Math.max(1, int(env.CLI_MAX_CONCURRENCY, Math.max(4, os.cpus().length * 2))),
    perUserConcurrency: Math.max(1, int(env.CLI_PER_USER_CONCURRENCY, 1)),
    maxQueue: Math.max(1, int(env.CLI_MAX_QUEUE, 200)),
    perUserMaxQueue: Math.max(1, int(env.CLI_PER_USER_MAX_QUEUE, 8)),
    queueTimeoutMs: int(env.CLI_QUEUE_TIMEOUT_MS, 60_000),

    // Result cache
    cacheEnabled: bool(env.RESULT_CACHE_ENABLED, true),
    cacheMaxEntries: int(env.RESULT_CACHE_MAX_ENTRIES, 5000),

    // Downloaded files
    fileStoreDir: env.FILE_STORE_DIR || path.join(tmp, 'vtop-proxy-files'),
    fileTtlSeconds: int(env.FILE_TTL_SECONDS, 60 * 60),
    fileStoreMaxBytes: int(env.FILE_STORE_MAX_BYTES, 2 * 1024 * 1024 * 1024),

    // latest.json (kill switch) cache served to children over loopback
    latestJsonCache: bool(env.CLI_TOP_LATEST_JSON_CACHE, true),
    latestJsonUpstream: env.CLI_TOP_LATEST_JSON_UPSTREAM || 'https://cli-top.acmvit.in/latest.json',
    latestJsonRefreshMs: int(env.CLI_TOP_LATEST_JSON_REFRESH_MS, 5 * 60_000),
    latestJsonMaxStaleMs: int(env.CLI_TOP_LATEST_JSON_MAX_STALE_MS, 60 * 60_000),

    // Abuse limits
    globalRateLimit: int(env.GLOBAL_RATE_LIMIT, 120),
    vtopRateLimit: int(env.VTOP_RATE_LIMIT, 30),
    perUserLimit: int(env.VTOP_USER_LIMIT, 15),
    perUserWindowMs: int(env.VTOP_USER_WINDOW_MS, 5 * 60_000),

    usernamePattern: new RegExp(env.VTOP_USERNAME_PATTERN || '^[0-9]{2}[A-Za-z]{2,4}[0-9]{3,5}$'),

    allowedOrigins: env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : ['https://everything-assistant.com', 'http://localhost:3000'],

    manifestPath: resolveManifestPath(env),
    version: require('../package.json').version,
  }
}

module.exports = { loadConfig }
