const fs = require('fs')
const path = require('path')

require('dotenv').config()

function findUpwards(filename, startDir) {
  const parsed = path.parse(startDir)
  let current = startDir
  while (true) {
    const candidate = path.join(current, filename)
    if (fs.existsSync(candidate)) {
      return candidate
    }
    if (current === parsed.root) break
    const next = path.dirname(current)
    if (next === current) break
    current = next
  }
  return null
}

function resolveManifestPath() {
  const explicit = process.env.HUB_CAPABILITIES_PATH
  if (explicit && fs.existsSync(explicit)) {
    return explicit
  }

  const candidates = [
    path.resolve(__dirname, '../../../hub-capabilities.json'),
    path.resolve(__dirname, '../../hub-capabilities.json'),
    path.resolve(process.cwd(), 'hub-capabilities.json'),
    path.resolve(process.cwd(), '../hub-capabilities.json'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  const discovered =
    findUpwards('hub-capabilities.json', __dirname) || findUpwards('hub-capabilities.json', process.cwd())
  if (discovered) {
    return discovered
  }

  return path.resolve(process.cwd(), 'hub-capabilities.json')
}

const capabilityManifestPath = resolveManifestPath()

if (process.env.NODE_ENV !== 'test') {
  console.log('[config] hub-capabilities manifest:', capabilityManifestPath)
}

function loadCapabilityManifest() {
  try {
    const raw = fs.readFileSync(capabilityManifestPath, 'utf-8')
    return JSON.parse(raw)
  } catch (error) {
    console.error('[config] Failed to load hub-capabilities manifest:', error.message)
    return []
  }
}

let capabilityManifest = loadCapabilityManifest()

function refreshManifest() {
  capabilityManifest = loadCapabilityManifest()
}

function getCliExecutablePath() {
  if (process.env.BINARY_PATH) {
    return process.env.BINARY_PATH
  }

  const possibleNames = process.platform === 'win32' ? ['binary.exe'] : ['binary']
  for (const name of possibleNames) {
    const fullPath = path.resolve(__dirname, `../${name}`)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }
  const fallback = process.platform === 'win32' ? 'binary.exe' : 'binary'
  return path.resolve(__dirname, `../${fallback}`)
}

const BINARY_PATH = getCliExecutablePath()
const CLI_TIMEOUT = parseInt(process.env.CLI_TIMEOUT || '120000', 10)

function buildCapabilityMaps(manifest) {
  const commandMap = new Map()
  const interactiveMap = new Map()
  manifest.forEach(capability => {
    commandMap.set(capability.command, capability.cliCommand || capability.command)
    if (capability.interactive) {
      interactiveMap.set(capability.cliCommand || capability.command, capability.interactive)
    }
  })
  return { commandMap, interactiveMap }
}

let { commandMap: COMMAND_MAPPING, interactiveMap: INTERACTIVE_COMMANDS } =
  buildCapabilityMaps(capabilityManifest)

function reloadCapabilities() {
  refreshManifest()
  const rebuilt = buildCapabilityMaps(capabilityManifest)
  COMMAND_MAPPING = rebuilt.commandMap
  INTERACTIVE_COMMANDS = rebuilt.interactiveMap
}

const GLOBAL_RATE_LIMIT = parseInt(process.env.GLOBAL_RATE_LIMIT || '120', 10)
const VTOP_RATE_LIMIT = parseInt(process.env.VTOP_RATE_LIMIT || '30', 10)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://the-everything-assistant.vercel.app', 'http://localhost:3000']

module.exports = {
  capabilityManifest: () => capabilityManifest,
  COMMAND_MAPPING: () => COMMAND_MAPPING,
  INTERACTIVE_COMMANDS: () => INTERACTIVE_COMMANDS,
  reloadCapabilities,
  BINARY_PATH,
  CLI_TIMEOUT,
  GLOBAL_RATE_LIMIT,
  VTOP_RATE_LIMIT,
  ALLOWED_ORIGINS,
}
