import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  buildCodexChildEnv,
  CODEX_LOCKDOWN_CONFIG,
  codexLockdownCliArgs,
  codexUserSegment,
  prepareCodexUserDirs,
  sanitizeCodexArgs,
} from '../lib/codex/sandbox'

test('child env keeps only the allow-list and pins HOME/CODEX_HOME to the user home', () => {
  const env = buildCodexChildEnv(
    {
      ...process.env,
      PATH: '/usr/bin',
      LANG: 'C.UTF-8',
      DATABASE_URL: 'postgres://secret',
      NEXTAUTH_SECRET: 'secret',
      OPENAI_API_KEY: 'sk-secret',
      GITHUB_TOKEN: 'ghp_secret',
      HOME: '/home/service',
    },
    '/data/codex/user1'
  )
  assert.deepEqual(env, {
    PATH: '/usr/bin',
    LANG: 'C.UTF-8',
    HOME: '/data/codex/user1',
    CODEX_HOME: '/data/codex/user1',
    ...(process.env.TZ ? { TZ: process.env.TZ } : {}),
    ...pickPassthroughFromProcess(),
  })
})

/** Allow-listed vars that happen to be set in the test runner's own environment. */
const pickPassthroughFromProcess = (): Record<string, string> => {
  const names = [
    'LC_ALL',
    'LC_CTYPE',
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
  ]
  const picked: Record<string, string> = {}
  for (const name of names) {
    const value = process.env[name]
    if (value) picked[name] = value
  }
  return picked
}

test('user segments: plain ids verbatim, anything else hashed without collisions', () => {
  assert.equal(codexUserSegment('clx1abc2def3'), 'clx1abc2def3')
  for (const hostile of ['..', '.', '', 'a/../../b', 'x'.repeat(200)]) {
    const segment = codexUserSegment(hostile)
    assert.match(segment, /^h\.[0-9a-f]{64}$/u)
  }
  assert.notEqual(codexUserSegment('a/b'), codexUserSegment('a_b'))
})

test('per-user dirs are 0700, pre-existing loose perms are tightened, symlinks rejected', async () => {
  const base = await mkdtemp(join(tmpdir(), 'codex-sandbox-'))
  try {
    const root = join(base, 'root')
    const paths = await prepareCodexUserDirs(root, 'user1')
    for (const dir of [paths.root, paths.codexHome, paths.workspace]) {
      assert.equal((await stat(dir)).mode & 0o777, 0o700, dir)
    }
    assert.equal(paths.workspace, join(root, 'user1', 'workspace'))

    await chmod(paths.codexHome, 0o755)
    await prepareCodexUserDirs(root, 'user1')
    assert.equal((await stat(paths.codexHome)).mode & 0o777, 0o700)

    // A user home that is a symlink to someone else's home must not be used.
    await mkdir(join(root, 'victim'), { mode: 0o700 })
    await symlink(join(root, 'victim'), join(root, 'attacker'))
    await assert.rejects(prepareCodexUserDirs(root, 'attacker'), /must be a directory/u)

    const traversal = await prepareCodexUserDirs(root, '..')
    assert.equal(traversal.root, root)
    assert.match(traversal.codexHome, /\/h\.[0-9a-f]{64}$/u)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('lockdown disables shell/exec/web tools on the CLI and per thread', () => {
  assert.equal(CODEX_LOCKDOWN_CONFIG['features.shell_tool'], false)
  assert.equal(CODEX_LOCKDOWN_CONFIG['features.unified_exec'], false)
  assert.equal(CODEX_LOCKDOWN_CONFIG.web_search, 'disabled')
  const args = codexLockdownCliArgs()
  assert.ok(args.includes('features.shell_tool=false'))
  assert.ok(args.includes('web_search="disabled"'))
  assert.ok(args.includes('shell_environment_policy.inherit="none"'))
})

test('operator flags cannot re-enable tools or loosen the sandbox', () => {
  const warnings: string[] = []
  const result = sanitizeCodexArgs(
    [
      '--enable',
      'shell_tool',
      '-c',
      'features.unified_exec=true',
      '--config=web_search="live"',
      '-c',
      'model="gpt-5"',
      '--sandbox',
      'danger-full-access',
      '--yolo',
      '--ask-for-approval=on-request',
      '-c',
      'shell_environment_policy.inherit="all"',
    ],
    'CODEX_FLAGS',
    message => warnings.push(message)
  )
  assert.deepEqual(result, ['-c', 'model="gpt-5"'])
  assert.equal(warnings.length, 7)
})
