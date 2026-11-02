#!/usr/bin/env node
'use strict'

/**
 * Latency benchmark against the fake cli-top (no VTOP access needed).
 *
 *   node scripts/bench.js            # FAKE_LOGIN_MS=1500, FAKE_LATEST_JSON_MS=150
 *   FAKE_LOGIN_MS=0 node scripts/bench.js   # pure proxy + spawn overhead
 *
 * The fake simulates the two costs a real cli-top invocation pays before doing any work:
 * the blocking latest.json kill-switch fetch (measured 110-520 ms from a dev machine) and the
 * VTOP login + captcha round trips (FAKE_LOGIN_MS).
 */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const FAKE = path.join(ROOT, 'test', 'fixtures', 'fake-cli-top.js')
const PORT = 3900 + Math.floor(Math.random() * 90)
const BASE = `http://127.0.0.1:${PORT}`
const API_KEY = 'bench-key'

function startUpstreamLatestJson() {
  // Stands in for https://cli-top.acmvit.in/latest.json with the measured latency.
  const delay = parseInt(process.env.FAKE_LATEST_JSON_MS || '150', 10)
  const server = http.createServer((req, res) => {
    setTimeout(() => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ version: '2.12.1', killSwitch: 0, baseUrl: '/buildFiles' }))
    }, delay)
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function main() {
  const upstream = await startUpstreamLatestJson()
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtop-bench-'))
  const child = spawn(process.execPath, [path.join(ROOT, 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      BINARY_PATH: FAKE,
      FAKE_LOGIN_MS: process.env.FAKE_LOGIN_MS || '1500',
      FAKE_LATEST_JSON_MS: process.env.FAKE_LATEST_JSON_MS || '150',
      FAKE_STATE_DIR: stateDir,
      // The new proxy passes an allow-listed env to cli-top; the old one passed everything.
      CLI_ENV_PASSTHROUGH: 'FAKE_LOGIN_MS,FAKE_LATEST_JSON_MS,FAKE_STATE_DIR',
      CLI_TOP_LATEST_JSON_UPSTREAM: `http://127.0.0.1:${upstream.address().port}/latest.json`,
      PROXY_API_KEY: API_KEY,
      VTOP_USER_LIMIT: '100000',
      VTOP_RATE_LIMIT: '100000',
      GLOBAL_RATE_LIMIT: '100000',
      MCP_OAUTH_ENABLED: 'false',
      MCP_OAUTH_CONSENT_SECRET: 'bench-consent-secret',
      PROXY_TOKEN_SECRET: 'bench-token-secret-0123456789abcdef',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) break
    } catch {}
    await new Promise(r => setTimeout(r, 100))
  }
  await new Promise(r => setTimeout(r, 300)) // let the latest.json cache warm up

  const post = async (route, body) => {
    const t0 = performance.now()
    const res = await fetch(`${BASE}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    return { ms: performance.now() - t0, status: res.status, json }
  }
  const creds = n => ({ username: `21BCE${String(1000 + n).padStart(4, '0')}`, password: 'pw' })
  const stats = arr => {
    const s = [...arr].sort((a, b) => a - b)
    const pick = q => s[Math.min(s.length - 1, Math.floor(q * s.length))]
    return `p50=${pick(0.5).toFixed(0)}ms p95=${pick(0.95).toFixed(0)}ms max=${s[s.length - 1].toFixed(0)}ms`
  }

  const results = {}

  // A. 10 sequential identical reads by one user (dashboard refresh / follow-up questions)
  {
    const times = []
    for (let i = 0; i < 10; i++) times.push((await post('/vtop', { command: 'profile', ...creds(1) })).ms)
    results['A: 10x sequential profile, same user'] = `${stats(times)} total=${times.reduce((a, b) => a + b, 0).toFixed(0)}ms`
  }

  // B. 8 concurrent identical reads by one user (double-clicks, hub + chat at once)
  {
    const t0 = performance.now()
    const rs = await Promise.all(Array.from({ length: 8 }, () => post('/vtop', { command: 'timetable', ...creds(2) })))
    results['B: 8x concurrent timetable, same user'] = `${stats(rs.map(r => r.ms))} wall=${(performance.now() - t0).toFixed(0)}ms statuses=${[...new Set(rs.map(r => r.status))].join(',')}`
  }

  // C. 16 concurrent reads by 16 different users
  {
    const t0 = performance.now()
    const rs = await Promise.all(Array.from({ length: 16 }, (_, i) => post('/vtop', { command: 'attendance', ...creds(100 + i) })))
    results['C: 16 users concurrent attendance'] = `${stats(rs.map(r => r.ms))} wall=${(performance.now() - t0).toFixed(0)}ms statuses=${[...new Set(rs.map(r => r.status))].join(',')}`
  }

  // D. Single cold read (spawn + latest.json + login)
  {
    const r = await post('/vtop', { command: 'cgpa', ...creds(300) })
    results['D: single cold cgpa'] = `${r.ms.toFixed(0)}ms status=${r.status}`
  }

  // E. Course-page download "module 2 slides for CSE1001 by Anuj" through the new workflow API
  {
    const t0 = performance.now()
    let r = await post('/vtop', {
      command: 'course-page',
      ...creds(400),
      select: { course: 'CSE1001', faculty: 'anuj kumar', materials: 'module 2' },
    })
    let steps = 1
    while (r.json && r.json.status && r.json.status.startsWith('needs_') && steps < 6) {
      const first = r.json.step.options[0]
      r = await post('/vtop/continue', { ...creds(400), continuation: r.json.continuation, choice: first.id })
      steps++
    }
    results['E: course-page module download (new API)'] = `${(performance.now() - t0).toFixed(0)}ms status=${r.status} result=${r.json && r.json.status} files=${(r.json && r.json.files && r.json.files.length) || 0} http-calls=${steps}`
  }

  for (const [k, v] of Object.entries(results)) console.log(`${k.padEnd(44)} ${v}`)
  child.kill('SIGTERM')
  upstream.close()
  fs.rmSync(stateDir, { recursive: true, force: true })
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
