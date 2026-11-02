'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')

const FAKE_CLI = path.join(__dirname, 'fixtures', 'fake-cli-top.js')
const API_KEY = 'test-proxy-key'

/** Stand-in for https://cli-top.acmvit.in/latest.json. */
function startLatestJsonServer(doc = { version: '2.12.1', killSwitch: 0, baseUrl: '/buildFiles' }) {
  const state = { doc, hits: 0 }
  const server = http.createServer((req, res) => {
    state.hits++
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(state.doc))
  })
  return new Promise(resolve =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ state, url: `http://127.0.0.1:${server.address().port}/latest.json`, close: () => new Promise(r => server.close(r)) })
    )
  )
}

/**
 * Starts an in-process proxy wired to the fake cli-top. Each call gets private temp dirs and an
 * invocation log (one JSON line per cli-top spawn).
 */
async function startProxy(overrides = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vtop-proxy-test-'))
  const logFile = path.join(tmp, 'cli.log')
  const env = {
    NODE_ENV: 'test',
    BINARY_PATH: FAKE_CLI,
    PROXY_API_KEY: API_KEY,
    PROXY_TOKEN_SECRET: 'test-token-secret-0123456789abcdef',
    MCP_OAUTH_ENABLED: 'false',
    CLI_RUN_DIR: path.join(tmp, 'runs'),
    FILE_STORE_DIR: path.join(tmp, 'files'),
    CLI_TOP_LATEST_JSON_CACHE: 'false',
    CLI_ENV_PASSTHROUGH: 'FAKE_CLI_LOG,FAKE_LOGIN_MS,FAKE_SLOW_MS,FAKE_STATE_DIR,FAKE_LATEST_JSON_MS',
    FAKE_CLI_LOG: logFile,
    FAKE_STATE_DIR: tmp,
    VTOP_USER_LIMIT: '1000',
    VTOP_RATE_LIMIT: '10000',
    GLOBAL_RATE_LIMIT: '10000',
    CLI_RETRY_ATTEMPTS: '1',
    ...overrides,
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  // Fresh module graph per proxy so config/env changes apply.
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}proxy-service${path.sep}src${path.sep}`)) delete require.cache[key]
  }
  const { loadConfig } = require('../src/config')
  const { createProxy } = require('../src/app')
  const config = loadConfig(process.env)
  const proxy = createProxy(config)
  const server = await proxy.start(0, '127.0.0.1')
  const base = `http://127.0.0.1:${server.address().port}`

  const request = async (method, route, body, headers = {}) => {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${API_KEY}`,
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: res.status, headers: res.headers, json, text }
  }

  const readLog = () =>
    fs.existsSync(logFile)
      ? fs
          .readFileSync(logFile, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(line => JSON.parse(line))
      : []

  return {
    base,
    proxy,
    config,
    tmp,
    readLog,
    spawns: () => readLog().length,
    post: (route, body, headers) => request('POST', route, body, headers),
    get: (route, headers) => request('GET', route, undefined, headers),
    async close() {
      proxy.stop()
      await new Promise(resolve => {
        server.closeAllConnections()
        server.close(resolve)
      })
      fs.rmSync(tmp, { recursive: true, force: true })
    },
  }
}

const creds = (username = '21BCE0001', password = 'pw') => ({ username, password })

module.exports = { startProxy, startLatestJsonServer, creds, API_KEY, FAKE_CLI }
