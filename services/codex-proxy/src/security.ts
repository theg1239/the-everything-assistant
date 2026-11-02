// Auth and Codex isolation helpers for codex-proxy. Dependency-free (node: built-ins only) so the
// root test suite can exercise them; the Codex lockdown mirrors lib/codex/sandbox.ts in the main app
// (kept as a copy because this service is deployed on its own).
import { createHash, timingSafeEqual } from 'node:crypto'
import { chmod, lstat, mkdir, realpath, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

type Env = Readonly<Record<string, string | undefined>>

// ---------------------------------------------------------------------------------------------
// HTTP auth
// ---------------------------------------------------------------------------------------------

export type ProxyAuthConfig = { mode: 'token'; token: string } | { mode: 'insecure-dev' }

/**
 * The bearer token is the only thing that authorises a caller to act on behalf of any `userId`
 * (the main app is trusted to put the signed-in user's id in the body), so the proxy refuses to
 * start without one. `CODEX_PROXY_INSECURE_DEV=1` opts out, and only outside production.
 */
export const resolveProxyAuthConfig = (env: Env): ProxyAuthConfig => {
  const token = env.CODEX_PROXY_AUTH_TOKEN?.trim() ?? ''
  if (token) return { mode: 'token', token }
  if (env.CODEX_PROXY_INSECURE_DEV === '1' && env.NODE_ENV !== 'production') {
    return { mode: 'insecure-dev' }
  }
  throw new Error(
    'CODEX_PROXY_AUTH_TOKEN is not set. Refusing to start: anyone who can reach the proxy could ' +
      'act as any user. Set CODEX_PROXY_AUTH_TOKEN (e.g. `openssl rand -hex 32`), or for local ' +
      'development only set CODEX_PROXY_INSECURE_DEV=1 with NODE_ENV != production.'
  )
}

const sha256 = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest()

/** Constant-time comparison; hashing first gives equal-length buffers whatever the input lengths. */
export const tokensMatch = (expected: string, provided: string | null): boolean => {
  if (!expected || !provided) return false
  return timingSafeEqual(sha256(expected), sha256(provided))
}

export const extractProvidedToken = (headers: Headers): string | null => {
  const authorization = headers.get('authorization')
  if (authorization && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim() || null
  }
  return headers.get('x-codex-proxy-token')?.trim() || null
}

export const isRequestAuthorized = (config: ProxyAuthConfig, headers: Headers): boolean =>
  config.mode === 'insecure-dev' || tokensMatch(config.token, extractProvidedToken(headers))

/** Loopback unless explicitly configured (VM deployments set CODEX_PROXY_HOST=0.0.0.0 behind TLS). */
export const resolveBindHost = (env: Env): string =>
  env.CODEX_PROXY_HOST?.trim() || env.HOST?.trim() || '127.0.0.1'

// ---------------------------------------------------------------------------------------------
// Codex isolation (see lib/codex/sandbox.ts for how this was verified)
// ---------------------------------------------------------------------------------------------

export const CODEX_DISABLED_FEATURES = [
  'shell_tool',
  'unified_exec',
  'shell_snapshot',
  'apply_patch_freeform',
  'view_image',
  'web_search_request',
  'web_search_cached',
  'standalone_web_search',
  'multi_agent',
  'multi_agent_v2',
  'goals',
  'apps',
  'plugins',
  'enable_mcp_apps',
  'browser_use',
  'browser_use_external',
  'computer_use',
  'in_app_browser',
  'image_generation',
  'js_repl',
  'code_mode',
  'tool_suggest',
  'skill_search',
  'memories',
  'hooks',
  'sleep_tool',
  'request_permissions_tool',
] as const

/** Dotted-key overrides applied on the process (`-c`) and per thread (`thread/start` `config`). */
export const CODEX_LOCKDOWN_CONFIG: Readonly<Record<string, string | boolean>> = {
  ...Object.fromEntries(CODEX_DISABLED_FEATURES.map(feature => [`features.${feature}`, false])),
  web_search: 'disabled',
  'shell_environment_policy.inherit': 'none',
}

export const codexLockdownCliArgs = (): string[] =>
  Object.entries(CODEX_LOCKDOWN_CONFIG).flatMap(([key, value]) => [
    '-c',
    `${key}=${JSON.stringify(value)}`,
  ])

export const CODEX_CHILD_ENV_PASSTHROUGH = [
  'PATH',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'CODEX_CA_CERTIFICATE',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY',
  'https_proxy',
  'http_proxy',
  'no_proxy',
  'RUST_LOG',
] as const

/** Only non-secret variables plus HOME/CODEX_HOME; CODEX_PROXY_AUTH_TOKEN etc. never reach Codex. */
export const buildCodexChildEnv = (source: Env, codexHome: string): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const name of CODEX_CHILD_ENV_PASSTHROUGH) {
    const value = source[name]
    if (value) env[name] = value
  }
  env.PATH ??= '/usr/local/bin:/usr/bin:/bin'
  env.HOME = codexHome
  env.CODEX_HOME = codexHome
  return env
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/u

/** Plain ids verbatim; anything else hashed (hashed names contain `.`, so they can't collide). */
export const codexUserSegment = (userId: string): string =>
  SAFE_SEGMENT.test(userId) ? userId : `h.${createHash('sha256').update(userId).digest('hex')}`

export type CodexUserPaths = { root: string; codexHome: string; workspace: string }

export const resolveCodexUserPaths = (homeRoot: string, userId: string): CodexUserPaths => {
  const root = resolve(homeRoot)
  const codexHome = join(root, codexUserSegment(userId))
  return { root, codexHome, workspace: join(codexHome, 'workspace') }
}

const ensurePrivateDir = async (dir: string, allowSymlink: boolean): Promise<void> => {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const info = allowSymlink ? await stat(dir) : await lstat(dir)
  if (!info.isDirectory()) {
    throw new Error(`[codex-proxy] ${dir} must be a directory (symlinks are not allowed)`)
  }
  if ((info.mode & 0o077) !== 0) await chmod(dir, 0o700)
}

/** 0700 root, user CODEX_HOME and empty workspace; the home must be a direct child of the root. */
export const prepareCodexUserDirs = async (
  homeRoot: string,
  userId: string
): Promise<CodexUserPaths> => {
  const paths = resolveCodexUserPaths(homeRoot, userId)
  await ensurePrivateDir(paths.root, true)
  await ensurePrivateDir(paths.codexHome, false)
  await ensurePrivateDir(paths.workspace, false)
  const [realRoot, realHome] = await Promise.all([realpath(paths.root), realpath(paths.codexHome)])
  if (dirname(realHome) !== realRoot) {
    throw new Error('[codex-proxy] user home escaped the configured home root')
  }
  return paths
}

const LOCKED_CONFIG_PREFIXES = [
  'features',
  'web_search',
  'tools',
  'sandbox',
  'approval_policy',
  'shell_environment_policy',
  'mcp_servers',
] as const

const isLockedConfigOverride = (assignment: string): boolean => {
  const key = assignment.split('=', 1)[0]?.trim().toLowerCase() ?? ''
  return LOCKED_CONFIG_PREFIXES.some(prefix => key === prefix || key.startsWith(`${prefix}.`))
}

/** Strips operator flags that would weaken the lockdown (unsafe modes, sandbox/approval, --enable, locked -c keys). */
export const sanitizeCodexArgs = (
  args: readonly string[],
  source: string,
  warn: (message: string) => void
): string[] => {
  const sanitized: string[] = []

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === undefined) continue
    const lower = arg.toLowerCase()
    const next = args[i + 1]

    const drop = (reason: string, consumesValue: 'always' | 'if-not-flag' | 'never') => {
      warn(`removed ${arg} from ${source} (${reason})`)
      if (consumesValue === 'always' && next !== undefined) i += 1
      if (consumesValue === 'if-not-flag' && next !== undefined && !next.startsWith('-')) i += 1
    }

    if (
      lower === '--dangerously-bypass-approvals-and-sandbox' ||
      lower === '--yolo' ||
      lower === '--full-auto'
    ) {
      drop('unsafe execution mode', 'never')
      continue
    }

    if (lower === '--sandbox' || lower === '-s') {
      drop('sandbox is hard-enforced as read-only', 'if-not-flag')
      continue
    }

    if (
      lower.startsWith('--sandbox=') ||
      lower.startsWith('--ask-for-approval=') ||
      lower.startsWith('--enable=')
    ) {
      drop('locked by the Codex lockdown', 'never')
      continue
    }

    if (lower === '--ask-for-approval' || lower === '-a' || lower === '--enable') {
      drop('locked by the Codex lockdown', 'if-not-flag')
      continue
    }

    if (lower === '-c' || lower === '--config') {
      if (next !== undefined && isLockedConfigOverride(next)) {
        drop(`override of locked key ${next.split('=', 1)[0] ?? ''}`, 'always')
        continue
      }
    } else if (lower.startsWith('--config=') && isLockedConfigOverride(arg.slice('--config='.length))) {
      drop('override of a locked key', 'never')
      continue
    }

    sanitized.push(arg)
  }

  return sanitized
}
