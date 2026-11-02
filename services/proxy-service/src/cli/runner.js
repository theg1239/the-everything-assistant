'use strict'

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { spawn } = require('child_process')
const { trackChild } = require('../child-processes')
const { parseEnvelope } = require('./envelope')

const DOWNLOAD_ROOT = path.join('Downloads', 'CLI-TOP Downloads')
const PASSTHROUGH_ENV = [
  'TZ',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'SYSTEMROOT', // Windows networking
]
const MAX_FILES_PER_RUN = 500

/**
 * Spawns `cli-top proxy <user> <pass> <command> [flags]`.
 *
 * Every invocation gets a private working directory used as cwd, HOME and XDG dirs:
 *  - cli-top resolves its config file from cwd first; we pre-seed it with a stable UUID so the
 *    binary doesn't register a fresh analytics UUID per call, and no state leaks between users.
 *  - downloads land in $HOME/Downloads/CLI-TOP Downloads/... and are collected after exit.
 *  - the child gets an allow-listed environment (no proxy secrets, DB URLs, etc.).
 *
 * The password is passed in argv because cli-top v2.12.1's proxy subcommand only reads
 * credentials from its positional arguments (see README "Security").
 */
class CliRunner {
  constructor({ config, latestJson, logger }) {
    this.config = config
    this.latestJson = latestJson
    this.logger = logger
    this.binaryChecked = false
    fs.mkdirSync(config.runRoot, { recursive: true, mode: 0o700 })
  }

  ensureBinary() {
    if (this.binaryChecked) return
    const { binaryPath } = this.config
    if (!fs.existsSync(binaryPath)) {
      const error = new Error(`cli-top binary not found at ${binaryPath}`)
      error.code = 'ENOENT'
      throw error
    }
    if (process.platform !== 'win32') {
      try {
        fs.accessSync(binaryPath, fs.constants.X_OK)
      } catch {
        try {
          fs.chmodSync(binaryPath, 0o755)
        } catch (error) {
          this.logger.warn('[runner] binary is not executable and chmod failed:', error.message)
        }
      }
    }
    this.binaryChecked = true
  }

  buildEnv(home, runDir) {
    const env = {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      XDG_CACHE_HOME: path.join(home, '.cache'),
      TMPDIR: path.join(runDir, 'tmp'),
      LANG: 'C.UTF-8',
      NO_COLOR: '1',
      TERM: 'dumb',
    }
    for (const name of [...PASSTHROUGH_ENV, ...this.config.envPassthrough]) {
      if (process.env[name] !== undefined) env[name] = process.env[name]
    }
    const latestUrl = this.latestJson && this.latestJson.childUrl()
    if (latestUrl) env.CLI_TOP_LATEST_JSON_URL = latestUrl
    return env
  }

  async prepareRunDir() {
    const runDir = await fsp.mkdtemp(path.join(this.config.runRoot, 'run-'))
    const home = path.join(runDir, 'home')
    await Promise.all([
      fsp.mkdir(path.join(runDir, 'tmp'), { recursive: true }),
      fsp.mkdir(home, { recursive: true }),
      fsp.writeFile(path.join(runDir, 'cli-top-config.env'), `UUID=${this.config.cliUuid}\n`, { mode: 0o600 }),
    ])
    return { runDir, home }
  }

  /**
   * @returns {Promise<object>} outcome: { envelope, preamble, problem, exitCode, signal, timedOut,
   *   spawnError, stderrTail, durationMs, downloads, scrub(text), cleanup() }
   */
  async run({ cliCommand, args = [], username, password, timeoutMs }) {
    this.ensureBinary()
    const { runDir, home } = await this.prepareRunDir()
    const started = Date.now()
    const argv = ['proxy', username, password, cliCommand, ...args]
    const limit = this.config.maxStdoutBytes

    const outcome = await new Promise(resolve => {
      let stdout = ''
      let stdoutBytes = 0
      let stderr = ''
      let timedOut = false
      let settled = false
      let killTimer = null
      let child
      try {
        child = spawn(this.config.binaryPath, argv, {
          cwd: runDir,
          env: this.buildEnv(home, runDir),
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })
      } catch (error) {
        resolve({ spawnError: error })
        return
      }
      trackChild(child)
      const finish = result => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clearTimeout(killTimer)
        resolve(result)
      }
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        killTimer = setTimeout(() => child.kill('SIGKILL'), 2000)
      }, timeoutMs || this.config.cliTimeoutMs)

      child.stdout.on('data', chunk => {
        stdoutBytes += chunk.length
        if (stdoutBytes <= limit) stdout += chunk.toString('utf8')
        else if (!timedOut) {
          timedOut = true
          child.kill('SIGKILL')
        }
      })
      child.stderr.on('data', chunk => {
        stderr = (stderr + chunk.toString('utf8')).slice(-8192)
      })
      child.on('error', error => finish({ spawnError: error }))
      child.on('close', (exitCode, signal) =>
        finish({ stdout, stderr, exitCode, signal, timedOut, overflow: stdoutBytes > limit })
      )
    })

    const durationMs = Date.now() - started
    const scrub = makeScrubber(runDir, home)
    const downloads = outcome.spawnError ? [] : await collectDownloads(home).catch(() => [])
    const cleanup = () => fsp.rm(runDir, { recursive: true, force: true }).catch(() => {})

    if (outcome.spawnError) {
      return { spawnError: outcome.spawnError, durationMs, downloads, scrub, cleanup }
    }
    const { envelope, preamble, problem } = parseEnvelope(outcome.stdout)
    return {
      envelope,
      preamble: scrub(preamble),
      problem,
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      timedOut: outcome.timedOut,
      overflow: outcome.overflow,
      stderrTail: scrub(outcome.stderr || '').slice(-2000),
      durationMs,
      downloads,
      scrub,
      cleanup,
    }
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Removes per-run absolute paths from cli-top output ("File saved to: /tmp/run-x/home/..."). */
function makeScrubber(runDir, home) {
  const downloads = path.join(home, DOWNLOAD_ROOT) + path.sep
  const patterns = [downloads, home + path.sep, runDir + path.sep, runDir].map(
    prefix => new RegExp(escapeRegExp(prefix), 'g')
  )
  return text => {
    if (typeof text !== 'string' || !text) return text
    return patterns.reduce((acc, pattern) => acc.replace(pattern, ''), text)
  }
}

/** Regular files under $HOME/Downloads/CLI-TOP Downloads (symlinks are ignored, never followed). */
async function collectDownloads(home) {
  const root = path.join(home, DOWNLOAD_ROOT)
  const found = []
  async function walk(dir) {
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    // Stat this directory's files together, then descend into subdirectories.
    const files = entries.filter(entry => entry.isFile()).map(entry => path.join(dir, entry.name))
    const stats = await Promise.all(files.map(abs => fsp.lstat(abs).catch(() => null)))
    files.forEach((abs, i) => {
      const stat = stats[i]
      if (stat && stat.isFile() && found.length < MAX_FILES_PER_RUN) {
        found.push({ absPath: abs, relPath: path.relative(root, abs), size: stat.size })
      }
    })
    for (const entry of entries) {
      if (found.length >= MAX_FILES_PER_RUN) return
      if (entry.isDirectory()) await walk(path.join(dir, entry.name))
    }
  }
  await walk(root)
  return found.sort((a, b) => a.relPath.localeCompare(b.relPath))
}

module.exports = { CliRunner, collectDownloads, makeScrubber }
