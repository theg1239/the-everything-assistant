'use strict'

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { startProxy, creds, API_KEY } = require('./helpers')

describe('authentication', () => {
  let p
  before(async () => {
    p = await startProxy()
  })
  after(() => p.close())

  it('keeps /health public', async () => {
    const res = await p.get('/health', { Authorization: '' })
    assert.equal(res.status, 200)
    assert.equal(res.json.status, 'ok')
    assert.equal(res.json.auth, 'shared-secret')
  })

  it('rejects missing and wrong keys on every protected route', async () => {
    for (const route of ['/vtop', '/vtop/continue', '/sync', '/vtop-sync', '/vtop-interactive', '/vtop-interactive-continue']) {
      const none = await p.post(route, { command: 'profile', ...creds() }, { Authorization: '' })
      assert.equal(none.status, 401, route)
      assert.equal(none.json.errorKind, 'unauthorized')
      const wrong = await p.post(route, { command: 'profile', ...creds() }, { Authorization: 'Bearer nope' })
      assert.equal(wrong.status, 401, route)
    }
    assert.equal((await p.get('/stats', { Authorization: '' })).status, 401)
    assert.equal(p.spawns(), 0)
  })

  it('accepts the X-Proxy-Key header too', async () => {
    const res = await p.post('/vtop', { command: 'profile', ...creds() }, { Authorization: '', 'X-Proxy-Key': API_KEY })
    assert.equal(res.status, 200)
    assert.equal(res.json.success, true)
  })

  it('protects /mcp with the shared secret when OAuth is disabled', async () => {
    const res = await p.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, { Authorization: '' })
    assert.equal(res.status, 401)
  })
})

describe('authentication fails closed', () => {
  it('answers 503 when no key is configured', async () => {
    const p = await startProxy({ PROXY_API_KEY: '' })
    try {
      const res = await p.post('/vtop', { command: 'profile', ...creds() })
      assert.equal(res.status, 503)
      assert.equal(res.json.errorKind, 'auth_not_configured')
      assert.equal((await p.get('/health')).json.status, 'degraded')
    } finally {
      await p.close()
    }
  })

  it('honours PROXY_AUTH_DISABLED only outside production', async () => {
    const dev = await startProxy({ PROXY_API_KEY: '', PROXY_AUTH_DISABLED: 'true', NODE_ENV: 'development' })
    try {
      assert.equal((await dev.post('/vtop', { command: 'profile', ...creds() }, { Authorization: '' })).status, 200)
    } finally {
      await dev.close()
    }
    const prod = await startProxy({ PROXY_API_KEY: '', PROXY_AUTH_DISABLED: 'true', NODE_ENV: 'production' })
    try {
      assert.equal((await prod.post('/vtop', { command: 'profile', ...creds() }, { Authorization: '' })).status, 503)
    } finally {
      await prod.close()
      process.env.NODE_ENV = 'test'
      delete process.env.PROXY_AUTH_DISABLED
    }
  })
})

describe('input validation and argv safety', () => {
  let p
  before(async () => {
    p = await startProxy()
  })
  after(() => p.close())

  const bad = async (body, field) => {
    const res = await p.post('/vtop', body)
    assert.equal(res.status, 400, JSON.stringify(res.json))
    assert.equal(res.json.errorKind === 'invalid_input' || res.json.errorKind === 'unsupported_command' || res.json.errorKind === 'missing_credentials', true)
    if (field) assert.equal(res.json.field, field)
    return res
  }

  it('rejects usernames that are not registration numbers (incl. flag-looking ones)', async () => {
    await bad({ command: 'profile', username: '-s', password: 'pw' }, 'username')
    await bad({ command: 'profile', username: '--debug', password: 'pw' }, 'username')
    await bad({ command: 'profile', username: '21BCE0001 --x', password: 'pw' }, 'username')
    await bad({ command: 'profile', username: '', password: 'pw' }, 'username')
  })

  it('rejects flags that are not allow-listed for the command', async () => {
    await bad({ command: 'profile', ...creds(), flags: { semester: 1 } }, 'semester')
    await bad({ command: 'marks', ...creds(), flags: { zzz: 'x' } }, 'zzz')
    await bad({ command: 'marks', ...creds(), flags: { commands: 'profile' } }, 'commands')
    const res = await bad({ command: 'marks', ...creds(), flags: { materials: '1' } }, 'materials')
    assert.match(res.json.error, /Supported: semester/)
  })

  it('rejects values that start with "-" or contain control characters', async () => {
    await bad({ command: 'da', ...creds(), flags: { course: '-c' } }, 'course')
    await bad({ command: 'syllabus', ...creds(), flags: { course: 'abc\ndef' } }, 'course')
    await bad({ command: 'leave', ...creds(), flags: { apply: true, reason: '--confirm' } }, 'reason')
  })

  it('type-checks values', async () => {
    await bad({ command: 'marks', ...creds(), flags: { semester: 0 } }, 'semester')
    await bad({ command: 'marks', ...creds(), flags: { semester: '1; rm -rf /' } })
    await bad({ command: 'course-page', ...creds(), flags: { materials: '1,,2' } }, 'materials')
    await bad({ command: 'course-page', ...creds(), flags: { materials: '1-x' } }, 'materials')
    await bad({ command: 'leave', ...creds(), flags: { apply: 'maybe' } }, 'apply')
    await bad({ command: 'leave', ...creds(), flags: { apply: true, fromDate: 'tomorrow' } }, 'fromDate')
    await bad({ command: 'nightslip', ...creds(), flags: { apply: true, fromTime: '25 o clock' } }, 'fromTime')
  })

  it('rejects unknown commands with the supported list', async () => {
    const res = await p.post('/vtop', { command: 'rm', ...creds() })
    assert.equal(res.status, 400)
    assert.ok(res.json.supportedCommands.includes('today'))
  })

  it('requires a password', async () => {
    const res = await p.post('/vtop', { command: 'profile', username: '21BCE0001' })
    assert.equal(res.status, 400)
    assert.equal(res.json.errorKind, 'missing_credentials')
  })

  it('never spawned cli-top for invalid input, and emits only canonical --flags', async () => {
    assert.equal(p.spawns(), 0)
    await p.post('/vtop', { command: 'calendar', ...creds('21BCE0009'), flags: { semester: '2', classGroup: 1 } })
    const [entry] = p.readLog()
    assert.deepEqual(entry.argv, ['proxy', '21BCE0009', 'pw', 'calendar', '--semester', '2', '--class-group', '1'])
  })
})

describe('error mapping', () => {
  let p
  before(async () => {
    p = await startProxy({ CLI_TIMEOUT: '1500', FAKE_SLOW_MS: '5000' })
  })
  after(() => p.close())

  const run = password => p.post('/vtop', { command: 'profile', username: '21BCE0002', password })

  it('maps login failures by cli-top preamble text', async () => {
    let res = await run('wrong')
    assert.equal(res.status, 401)
    assert.equal(res.json.errorKind, 'invalid_credentials')
    assert.equal(res.json.requiresCredentials, true)
    assert.equal(typeof res.json.error, 'string')

    res = await run('locked')
    assert.equal(res.status, 423)
    assert.equal(res.json.errorKind, 'account_locked')

    res = await run('homefail')
    assert.equal(res.status, 401)
    assert.equal(res.json.errorKind, 'login_failed')
  })

  it('treats captcha and VTOP outages as retryable 503s (and retries once)', async () => {
    const before = p.spawns()
    let res = await run('captcha')
    assert.equal(res.status, 503)
    assert.equal(res.json.errorKind, 'captcha_failed')
    assert.equal(res.json.retryable, true)
    assert.equal(p.spawns() - before, 2, 'one automatic retry')

    res = await run('down')
    assert.equal(res.status, 503)
    assert.equal(res.json.errorKind, 'vtop_unavailable')
  })

  it('does not retry credential errors (avoids VTOP lockouts)', async () => {
    const before = p.spawns()
    await run('wrong')
    assert.equal(p.spawns() - before, 1)
  })

  it('recovers from a transient network failure via retry', async () => {
    const res = await run('flaky-1')
    assert.equal(res.status, 200)
    assert.equal(res.json.meta.attempts, 2)
  })

  it('maps crashes, garbage output and timeouts', async () => {
    let res = await run('crash')
    assert.equal(res.status, 502)
    assert.equal(res.json.errorKind, 'cli_crashed')
    assert.doesNotMatch(res.text, /panic|nil pointer/)

    res = await run('garbage')
    assert.equal(res.status, 502)
    assert.equal(res.json.errorKind, 'protocol_error')

    res = await run('slow')
    assert.equal(res.status, 504)
    assert.equal(res.json.errorKind, 'timeout')
  })

  it('maps cli-top validation/conflict errors', async () => {
    const res = await p.post('/vtop', { command: 'course-page', ...creds('21BCE0003'), flags: { course: 3 } })
    assert.equal(res.status, 404)
    assert.equal(res.json.errorKind, 'not_found')
    assert.match(res.json.error, /no material uploaded/)
  })
})

describe('performance features', () => {
  let p
  before(async () => {
    p = await startProxy({ FAKE_LOGIN_MS: '400' })
  })
  after(() => p.close())

  it('serves repeated reads from the per-user cache', async () => {
    const a = await p.post('/vtop', { command: 'profile', ...creds('21BCE0100') })
    const b = await p.post('/vtop', { command: 'profile', ...creds('21BCE0100') })
    assert.equal(a.json.meta.cached, false)
    assert.equal(b.json.meta.cached, true)
    assert.equal(b.json.data, a.json.data)
    assert.equal(p.readLog().filter(e => e.argv[1] === '21BCE0100').length, 1)
  })

  it('never shares cache entries across passwords', async () => {
    await p.post('/vtop', { command: 'cgpa', ...creds('21BCE0101', 'pw') })
    const other = await p.post('/vtop', { command: 'cgpa', ...creds('21BCE0101', 'wrong') })
    assert.equal(other.status, 401)
  })

  it('bypasses the cache with fresh=true or Cache-Control: no-cache', async () => {
    await p.post('/vtop', { command: 'hostel', ...creds('21BCE0102') })
    const fresh = await p.post('/vtop', { command: 'hostel', ...creds('21BCE0102'), fresh: true })
    assert.equal(fresh.json.meta.cached, false)
    const header = await p.post('/vtop', { command: 'hostel', ...creds('21BCE0102') }, { 'Cache-Control': 'no-cache' })
    assert.equal(header.json.meta.cached, false)
  })

  it('collapses identical concurrent requests into one spawn', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => p.post('/vtop', { command: 'timetable', ...creds('21BCE0103') })))
    assert.ok(results.every(r => r.status === 200))
    assert.equal(p.readLog().filter(e => e.argv[1] === '21BCE0103').length, 1)
    assert.ok(results.some(r => r.json.meta.shared))
  })

  it('serialises different commands for the same user (one VTOP session at a time)', async () => {
    const start = Date.now()
    await Promise.all([
      p.post('/vtop', { command: 'marks', ...creds('21BCE0104') }),
      p.post('/vtop', { command: 'grades', ...creds('21BCE0104') }),
    ])
    const spawns = p.readLog().filter(e => e.argv[1] === '21BCE0104')
    assert.equal(spawns.length, 2)
    assert.ok(Math.abs(spawns[1].at - spawns[0].at) >= 380, 'second spawn waits for the first')
    assert.ok(Date.now() - start >= 780)
  })

  it('runs different users in parallel', async () => {
    await Promise.all(['21BCE0201', '21BCE0202', '21BCE0203'].map(u => p.post('/vtop', { command: 'marks', ...creds(u) })))
    const spawns = p.readLog().filter(e => ['21BCE0201', '21BCE0202', '21BCE0203'].includes(e.argv[1]))
    const spread = Math.max(...spawns.map(s => s.at)) - Math.min(...spawns.map(s => s.at))
    assert.ok(spread < 300, `spawn spread ${spread}ms`)
  })

  it('invalidates the user cache after a successful write', async () => {
    const user = creds('21BCE0105')
    await p.post('/vtop', { command: 'leave', ...user })
    assert.equal((await p.post('/vtop', { command: 'leave', ...user })).json.meta.cached, true)
    const flags = { apply: true, leaveCode: 'HT1', visitingPlace: 'Chennai', reason: 'Family visit', fromDate: '2025-11-20', fromTime: '09:00', toDate: '2025-11-22', toTime: '18:00' }
    const done = await p.post('/vtop', { command: 'leave', ...user, flags, confirm: true })
    assert.equal(done.json.status, 'completed')
    assert.equal((await p.post('/vtop', { command: 'leave', ...user })).json.meta.cached, false)
  })

  it('queues instead of failing and reports busy when the per-user queue is full', async () => {
    const q = await startProxy({ FAKE_LOGIN_MS: '200', CLI_PER_USER_MAX_QUEUE: '2', RESULT_CACHE_ENABLED: 'false' })
    try {
      const commands = ['marks', 'grades', 'cgpa', 'hostel', 'receipts']
      const results = await Promise.all(commands.map(command => q.post('/vtop', { command, ...creds('21BCE0106') })))
      const statuses = results.map(r => r.status).sort()
      assert.ok(statuses.filter(s => s === 200).length >= 3)
      const busy = results.filter(r => r.status === 503)
      assert.ok(busy.length >= 1)
      assert.equal(busy[0].json.errorKind, 'busy')
      assert.equal(busy[0].json.retryable, true)
    } finally {
      await q.close()
    }
  })
})

describe('child isolation', () => {
  let p
  before(async () => {
    process.env.DATABASE_URL = 'postgres://secret'
    process.env.SOME_TOKEN = 'secret-token'
    p = await startProxy()
  })
  after(() => p.close())

  it('passes only an allow-listed environment and a stable UUID config', async () => {
    await p.post('/vtop', { command: 'profile', ...creds() })
    const [entry] = p.readLog()
    for (const leaked of ['PROXY_API_KEY', 'PROXY_TOKEN_SECRET', 'DATABASE_URL', 'SOME_TOKEN', 'MCP_OAUTH_CONSENT_SECRET']) {
      assert.ok(!entry.envKeys.includes(leaked), `${leaked} leaked to cli-top`)
    }
    assert.ok(entry.envKeys.includes('HOME'))
    assert.ok(entry.home.startsWith(p.config.runRoot))
    assert.equal(entry.configUuid, p.config.cliUuid)
  })

  it('cleans up per-run directories', async () => {
    const fs = require('fs')
    await p.post('/vtop', { command: 'grades', ...creds() })
    assert.deepEqual(fs.readdirSync(p.config.runRoot), [])
  })

  it('scrubs server paths from cli-top output', async () => {
    const res = await p.post('/vtop', { command: 'da', ...creds(), flags: { course: 1, assignment: 1 } })
    assert.equal(res.json.status, 'completed')
    assert.doesNotMatch(res.text, new RegExp(p.config.runRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.ok(res.json.messages.some(line => line.startsWith('File saved to: DA/')))
  })
})
