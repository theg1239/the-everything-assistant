import { createHash } from 'node:crypto'
import { chmod, lstat, mkdir, realpath, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/**
 * Isolation for the per-user `codex app-server` processes the app spawns.
 *
 * A `read-only` sandbox still lets the model run read-only shell commands without approval
 * (`env`, `cat .env*`, another user's `auth.json`), so every app-managed thread:
 *   - gets a minimal environment (no server secrets),
 *   - runs in an empty private per-user workspace,
 *   - has Codex's built-in tools (shell, unified exec, apply_patch, web search, view_image,
 *     multi-agent, MCP apps/plugins, browser/computer use, ...) disabled, so only the app's
 *     dynamic tools reach the model.
 *
 * The feature list was verified against codex-cli 0.166.0 by pointing a thread at a local fake
 * Responses endpoint and inspecting the `tools` array of the captured request: the defaults expose
 * exec_command, write_stdin, view_image, multi_agent_v1, goal tools and web_search; with this
 * lockdown only the app's dynamic tools (plus `request_user_input`, which only round-trips to the
 * client and is answered with an error) remain, and a forged `exec_command` call is rejected with
 * "unsupported call". Both `-c features.<name>=false` and the thread `config` map ignore unknown
 * feature names, so names that older/newer Codex builds don't know are harmless (unlike
 * `--disable <name>`, which aborts startup on an unknown name).
 */
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

/** Dotted-key config overrides applied both on the process (`-c`) and per thread (`config`). */
export const CODEX_LOCKDOWN_CONFIG: Readonly<Record<string, string | boolean>> = {
  ...Object.fromEntries(CODEX_DISABLED_FEATURES.map(feature => [`features.${feature}`, false])),
  web_search: 'disabled',
  // Defence in depth: should a shell tool ever reappear, it must not inherit any env vars.
  'shell_environment_policy.inherit': 'none',
}

/** `-c key=value` pairs for the app-server command line (values are TOML; JSON scalars are valid TOML). */
export const codexLockdownCliArgs = (): string[] =>
  Object.entries(CODEX_LOCKDOWN_CONFIG).flatMap(([key, value]) => [
    '-c',
    `${key}=${JSON.stringify(value)}`,
  ])

/**
 * Non-secret variables the Codex binary may need (binary lookup, locale, TLS trust store and
 * egress proxy). Everything else — DATABASE_URL, NEXTAUTH_SECRET, OPENAI_API_KEY, R2/GitHub/SMTP
 * credentials — is dropped.
 */
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

const DEFAULT_PATH = '/usr/local/bin:/usr/bin:/bin'
const PASSTHROUGH = new Set<string>(CODEX_CHILD_ENV_PASSTHROUGH)

/**
 * Environment for a user's app-server: only the allow-listed variables plus HOME/CODEX_HOME.
 * Built by copying then deleting so the result keeps the `ProcessEnv` type `spawn` requires
 * (env.d.ts declares the app's secrets as required keys) without a cast.
 */
export const buildCodexChildEnv = (
  source: NodeJS.ProcessEnv,
  codexHome: string
): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...source }
  for (const name of Object.keys(env)) {
    if (!PASSTHROUGH.has(name) || !env[name]) delete env[name]
  }
  env.PATH ||= DEFAULT_PATH
  // HOME points at the user's own Codex home so nothing resolves `~` to the service account.
  env.HOME = codexHome
  env.CODEX_HOME = codexHome
  return env
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/u

/**
 * Directory name for a user under the home root. Plain ids (cuid) are used verbatim, so existing
 * homes keep working; anything else (`..`, `/`, dots, very long ids) is hashed. Hashed names
 * contain a `.`, which plain ids can't, so the two forms never collide.
 */
export const codexUserSegment = (userId: string): string =>
  SAFE_SEGMENT.test(userId) ? userId : `h.${createHash('sha256').update(userId).digest('hex')}`

export type CodexUserPaths = {
  root: string
  codexHome: string
  workspace: string
}

export const resolveCodexUserPaths = (homeRoot: string, userId: string): CodexUserPaths => {
  const root = resolve(homeRoot)
  const codexHome = join(root, codexUserSegment(userId))
  return { root, codexHome, workspace: join(codexHome, 'workspace') }
}

const PRIVATE_DIR_MODE = 0o700

const ensurePrivateDir = async (dir: string, allowSymlink: boolean): Promise<void> => {
  await mkdir(dir, { recursive: true, mode: PRIVATE_DIR_MODE })
  const info = allowSymlink ? await stat(dir) : await lstat(dir)
  if (!info.isDirectory()) {
    throw new Error(`[codex] ${dir} must be a directory (symlinks are not allowed)`)
  }
  // mkdir's mode only applies to newly created directories; tighten pre-existing ones too.
  if ((info.mode & 0o077) !== 0) {
    await chmod(dir, PRIVATE_DIR_MODE)
  }
}

/**
 * Creates (or tightens to 0700) the home root, the user's CODEX_HOME and its empty workspace, and
 * checks the user's home really is a direct child of the root, so a thread can never be pointed at
 * another user's home.
 */
export const prepareCodexUserDirs = async (
  homeRoot: string,
  userId: string
): Promise<CodexUserPaths> => {
  const paths = resolveCodexUserPaths(homeRoot, userId)
  // The root itself may legitimately be a symlink (e.g. to a mounted volume).
  await ensurePrivateDir(paths.root, true)
  await ensurePrivateDir(paths.codexHome, false)
  await ensurePrivateDir(paths.workspace, false)

  const [realRoot, realHome] = await Promise.all([realpath(paths.root), realpath(paths.codexHome)])
  if (dirname(realHome) !== realRoot) {
    throw new Error('[codex] user home escaped the configured home root')
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

/**
 * Strips operator-supplied Codex flags that would weaken the lockdown: unsafe execution modes,
 * sandbox/approval overrides, `--enable <feature>` and `-c` overrides of locked keys.
 */
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
