const fs = require('fs')
const { execFile, spawn } = require('child_process')
const { COMMAND_MAPPING, INTERACTIVE_COMMANDS, BINARY_PATH, CLI_TIMEOUT } = require('./config')
const { cleanVTOPOutput } = require('./utils/text')
const { sanitizeErrorForResponse } = require('./utils/errors')
const { record } = require('./metrics')

const VERBOSE_LOG =
  process.env.PROXY_VERBOSE_LOGS === '1' || (process.env.NODE_ENV || '').toLowerCase() !== 'production'

const maskIdentifier = value => {
  if (!value || typeof value !== 'string') return 'unknown'
  if (value.length <= 4) return value
  return `${value.slice(0, 2)}***${value.slice(-2)}`
}

const redactCliArgs = args => {
  if (!Array.isArray(args)) return args
  return args.map((arg, idx) => {
    if (idx === 1) return maskIdentifier(arg) // username
    if (idx === 2) return '***' // password
    return arg
  })
}

let binaryReady = false

const snippet = text => {
  if (!text) return ''
  const lines = text.toString().split('\n').slice(-4)
  const compact = lines.join(' ').trim()
  return compact.length > 160 ? compact.slice(-160) : compact
}

const logInteractive = (command, detail, meta) => {
  if (meta) {
    console.log(`[cli-runner:${command}] ${detail}`, meta)
  } else {
    console.log(`[cli-runner:${command}] ${detail}`)
  }
}

function ensureBinaryReady() {
  if (binaryReady) return

  if (!fs.existsSync(BINARY_PATH)) {
    throw new Error(`CLI executable not found at path: ${BINARY_PATH}`)
  }

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(BINARY_PATH, 0o755)
    } catch (error) {
      console.warn('[cli-runner] unable to set executable permissions:', error.message)
    }
  }

  binaryReady = true
}

function runCommand(username, password, command, flags = {}) {
  return new Promise((resolve, reject) => {
    const mappedCommand = COMMAND_MAPPING().get(command)
    if (!mappedCommand) {
      return reject({ error: 'Unsupported command', command })
    }

    try {
      ensureBinaryReady()
    } catch (error) {
      return reject({
        error: error.message,
        command,
        args: ['proxy', username, '***', command],
      })
    }

    const cliArgs = buildCliArgs(username, password, mappedCommand, flags)
    if (VERBOSE_LOG) {
      console.log('[cli-runner] starting command', {
        command,
        mappedCommand,
        username: maskIdentifier(username),
        flags,
        binary: BINARY_PATH,
        args: redactCliArgs(cliArgs),
        timeoutMs: CLI_TIMEOUT,
      })
    }
    const options = { timeout: CLI_TIMEOUT, cwd: __dirname + '/..' }

    const interactiveConfig = INTERACTIVE_COMMANDS().get(mappedCommand)
    if (interactiveConfig) {
      return executeInteractiveCommand({ mappedCommand, cliArgs, username, flags, resolve, reject })
    }

    execFile(BINARY_PATH, cliArgs, options, (err, stdout, stderr) => {
      if (VERBOSE_LOG) {
        console.log('[cli-runner] completed (non-interactive)', {
          command: mappedCommand,
          exitCode: err && typeof err.code !== 'undefined' ? err.code : 0,
          signal: err && err.signal ? err.signal : null,
          stdoutSnippet: snippet(stdout),
          stderrSnippet: snippet(stderr),
        })
      }
      if (err) {
        const errorPayload = sanitizeErrorForResponse(
          {
            error: stderr || stdout || err.message,
            args: ['proxy', username, '***', mappedCommand, ...cliArgs.slice(4)],
          },
          mappedCommand
        )
        record(mappedCommand, 'failure')
        return reject(errorPayload)
      }

      try {
        const jsonOutput = JSON.parse(stdout)
        record(mappedCommand, 'success')
        resolve(jsonOutput)
      } catch (parseErr) {
        record(mappedCommand, 'success')
        resolve({
          success: true,
          command: mappedCommand,
          output: cleanVTOPOutput(stdout, mappedCommand),
          raw: false,
        })
      }
    })
  })
}

function executeInteractiveCommand({ mappedCommand, cliArgs, username, flags, resolve, reject }) {
  if (VERBOSE_LOG) {
    console.log('[cli-runner] starting interactive command', {
      command: mappedCommand,
      username: maskIdentifier(username),
      flags,
      binary: BINARY_PATH,
      args: redactCliArgs(cliArgs),
      timeoutMs: CLI_TIMEOUT,
    })
  }
  try {
    ensureBinaryReady()
  } catch (error) {
    return reject({
      error: error.message,
      command: mappedCommand,
      args: ['proxy', username, '***', mappedCommand],
    })
  }

  const child = spawn(BINARY_PATH, cliArgs, {
    timeout: CLI_TIMEOUT,
    cwd: __dirname + '/..',
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  let currentPrompt = ''
  let processingComplete = false
  let interactionCount = 0
  const maxInteractions = 10
  let autoCtrlCSent = false

  child.stdout.on('data', data => {
    const output = data.toString()
    if (VERBOSE_LOG) {
      console.log(`[cli-runner:${mappedCommand}] stdout chunk`, { snippet: snippet(output) })
    }
    stdout += output
    currentPrompt += output

    const shouldAutoTerminate =
      (mappedCommand === 'da' && output.includes('Choose a subject (enter a number):')) ||
      (mappedCommand === 'facility' &&
        (output.includes('Enter the number of the facility') ||
          output.includes("type 'exit' to cancel") ||
          output.includes('Choose') ||
          output.includes('Select') ||
          output.includes('enter a number')))

    if (shouldAutoTerminate && !autoCtrlCSent) {
      autoCtrlCSent = true
      child.stdin.write('\x03')
      setTimeout(() => ensureInteractiveResolution({ child, stdout, mappedCommand, resolve }), 500)
      return
    }

    const response = handleInteractivePrompt(currentPrompt, mappedCommand, flags)
    if (response !== null && interactionCount < maxInteractions) {
      if (response === '\x03') {
        child.stdin.write(response)
      } else {
        child.stdin.write(response + '\n')
      }
      currentPrompt = ''
      interactionCount++
    }
  })

  child.stderr.on('data', data => {
    stderr += data.toString()
    if (VERBOSE_LOG) {
      console.log(`[cli-runner:${mappedCommand}] stderr chunk`, { snippet: snippet(data.toString()) })
    }
  })

  child.on('close', code => {
    processingComplete = true
    if (VERBOSE_LOG) {
      console.log('[cli-runner] interactive command exited', {
        command: mappedCommand,
        exitCode: code,
        stdoutSnippet: snippet(stdout),
        stderrSnippet: snippet(stderr),
        interactions: interactionCount,
      })
    }
    if (code === 130 || code === null) {
      if (mappedCommand === 'da' || mappedCommand === 'facility') {
        return ensureInteractiveResolution({ child, stdout, mappedCommand, resolve })
      }
      return reject({
        error: 'VTOP credentials required',
        requiresCredentials: true,
        command: mappedCommand,
        message: 'Please provide your VTOP username and password to access VTOP data.',
      })
    }

    if (code !== 0) {
      record(mappedCommand, 'failure')
      return reject(
        sanitizeErrorForResponse(
          {
            error: stderr || stdout || `Process exited with code ${code}`,
            args: ['proxy', username, '***', mappedCommand, ...cliArgs.slice(4)],
          },
          mappedCommand
        )
      )
    }

    try {
      const jsonOutput = JSON.parse(stdout)
      record(mappedCommand, 'success')
      resolve(jsonOutput)
    } catch (parseErr) {
      record(mappedCommand, 'success')
      resolve({
        success: true,
        command: mappedCommand,
        output: cleanVTOPOutput(stdout, mappedCommand),
        raw: false,
      })
    }
  })
}

function ensureInteractiveResolution({ child, stdout, mappedCommand, resolve }) {
  try {
    const jsonOutput = JSON.parse(stdout)
    if (VERBOSE_LOG) {
      console.log('[cli-runner] ensureInteractiveResolution parsed JSON', {
        command: mappedCommand,
        stdoutSnippet: snippet(stdout),
      })
    }
    record(mappedCommand, 'success')
    resolve(jsonOutput)
  } catch (parseErr) {
    if (VERBOSE_LOG) {
      console.log('[cli-runner] ensureInteractiveResolution JSON parse failed, falling back to text', {
        command: mappedCommand,
        error: parseErr.message,
        stdoutSnippet: snippet(stdout),
      })
    }
    record(mappedCommand, 'success')
    resolve({
      success: true,
      command: mappedCommand,
      output: cleanVTOPOutput(stdout, mappedCommand),
      raw: false,
    })
  } finally {
    child.kill('SIGKILL')
  }
}

function parseLastOptionIndex(promptText) {
  const matches = [...promptText.matchAll(/^\s*(\d+)[.)]/gm)]
  if (!matches.length) return null
  const last = matches[matches.length - 1]
  return last?.[1] ? parseInt(last[1], 10) : null
}

function handleInteractivePrompt(buffer, command, flags) {
  if (!buffer) return null
  const normalized = buffer.toLowerCase()
  const respond = value => {
    logInteractive(command, `auto-response -> ${value}`, { prompt: snippet(buffer) })
    return value
  }
  if (command === 'course-page') {
    if (normalized.includes('enter the semester number')) {
      if (flags?.semester) return respond(String(flags.semester))
      if (flags?.semesterQuery) {
        if (typeof flags.semesterQuery === 'number') {
          return respond(String(flags.semesterQuery))
        }
        const query = String(flags.semesterQuery).toLowerCase().trim()
        if (['latest', 'last', 'current'].includes(query)) {
          const idx = parseLastOptionIndex(buffer)
          if (idx) return respond(String(idx))
        }
        const numeric = parseInt(flags.semesterQuery, 10)
        if (!Number.isNaN(numeric)) return respond(String(numeric))
      }
      return respond('1')
    }
    if (buffer.toLowerCase().includes('enter the course number')) {
      return respond(String(flags.course || 1))
    }
    if (buffer.toLowerCase().includes('enter the faculty number')) {
      return respond(String(flags.faculty || 1))
    }
    if (buffer.toLowerCase().includes('enter the material number')) {
      return respond('all')
    }
  }
  if (normalized.includes('choose a semester') || normalized.includes('enter the semester number')) {
    if (flags?.semester) return respond(String(flags.semester))
    if (flags?.semesterQuery) {
      const query = String(flags.semesterQuery).toLowerCase().trim()
      if (['latest', 'last', 'current'].includes(query)) {
        const idx = parseLastOptionIndex(buffer)
        if (idx) return respond(String(idx))
      }
      const numeric = parseInt(flags.semesterQuery, 10)
      if (!Number.isNaN(numeric)) return respond(String(numeric))
    }
    return respond('1')
  }
  if (command === 'calendar' && normalized.includes('enter class group')) {
    return respond(String(flags.classGroup || 1))
  }
  if (normalized.includes('username or password incorrect')) {
    return respond('\x03')
  }
  return null
}

function buildCliArgs(username, password, command, flags) {
  const args = ['proxy', username, password, command]
  Object.entries(flags).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (shouldSkipFlag(key)) return
    const shortFlag = getShortFlag(key)
    if (typeof value === 'boolean') {
      if (value) args.push(`-${shortFlag}`)
      return
    }
    args.push(`-${shortFlag}`, value.toString())
  })
  return args
}

function shouldSkipFlag(flagName) {
  return [
    'semesterQuery',
    'courseQuery',
    'facultyQuery',
    'materialQuery',
    'materialSelection',
    'interactiveStep',
  ].includes(flagName)
}

function getShortFlag(flagName) {
  switch (flagName) {
    case 'semester':
      return 's'
    case 'course':
      return 'c'
    case 'faculty':
      return 'f'
    case 'classGroup':
      return 'g'
    case 'fuzzyIndex':
      return 'i'
    case 'debug':
      return 'd'
    default:
      return flagName.charAt(0)
  }
}

module.exports = {
  runCommand,
  handleInteractivePrompt,
}
