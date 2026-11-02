'use strict'

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { startProxy, creds } = require('./helpers')

describe('multi-step workflows', () => {
  let p
  before(async () => {
    p = await startProxy()
  })
  after(() => p.close())

  const start = (command, extra = {}, user = creds()) => p.post('/vtop', { command, ...user, ...extra })
  const cont = (continuation, choice, extra = {}) => p.post('/vtop/continue', { continuation, choice, password: 'pw', ...extra })

  it('walks course-page step by step with option ids', async () => {
    let res = await start('course-page')
    assert.equal(res.status, 200)
    assert.equal(res.json.success, true)
    assert.equal(res.json.status, 'needs_selection')
    assert.equal(res.json.step.id, 'course')
    assert.deepEqual(
      res.json.step.options.map(o => o.label),
      ['CSE1001 — Problem Solving and Programming', 'CSE2001 — Data Structures and Algorithms', 'MAT1011 — Calculus for Engineers']
    )
    assert.match(res.json.output, /│/, 'legacy text table of options')
    assert.ok(res.json.continuation.startsWith('v1.'))
    assert.doesNotMatch(res.json.continuation, /pw/)

    res = await cont(res.json.continuation, '1')
    assert.equal(res.json.step.id, 'faculty')
    assert.deepEqual(res.json.step.options.map(o => o.label), ['Anuj Kumar', 'Anjali Sharma', 'Ravi Shankar'])

    res = await cont(res.json.continuation, '2')
    assert.equal(res.json.step.id, 'materials')
    assert.equal(res.json.step.multiple, true)
    assert.equal(res.json.step.options.length, 5)
    assert.equal(res.json.step.options[2].description, '02-09-2025 · 2 · 1')

    res = await cont(res.json.continuation, ['1', '3'])
    assert.equal(res.json.status, 'completed')
    assert.equal(res.json.files.length, 2)
    assert.deepEqual(res.json.progress.map(s => s.choice), [
      'CSE1001 — Problem Solving and Programming',
      'Anjali Sharma',
      'Introduction to programming, Control flow slides',
    ])
    assert.deepEqual(res.json.links, [{ label: 'Control flow slides', url: 'https://vtop.vit.ac.in/vtop/web/3' }])
    const last = p.readLog().at(-1)
    assert.deepEqual(last.argv.slice(4), ['--course', '1', '--faculty', '2', '--materials', '1,3'])
  })

  it('resolves natural-language hints automatically (one request)', async () => {
    const res = await start('course-page', { select: { course: 'dsa', faculty: 'meera', materials: 'all' } })
    assert.equal(res.json.status, 'completed')
    assert.equal(res.json.files.length, 5)
    assert.deepEqual(res.json.meta.autoSelected.map(a => a.step).sort(), ['course', 'faculty', 'materials'])
    assert.equal(res.json.meta.runs, 3, '"all" is sent up front: no extra run for the materials table')
  })

  it('accepts free-text choices on continue and re-asks when ambiguous', async () => {
    let res = await start('course-page', {}, creds('21BCE0301'))
    res = await cont(res.json.continuation, 'CSE1001')
    assert.equal(res.json.step.id, 'faculty')
    const ambiguous = await cont(res.json.continuation, 'an')
    assert.equal(ambiguous.json.status, 'needs_selection')
    assert.match(ambiguous.json.step.prompt, /matches several options/)
    res = await cont(ambiguous.json.continuation, 'ravi')
    assert.equal(res.json.step.id, 'materials')
    res = await cont(res.json.continuation, 'module 1')
    assert.equal(res.json.status, 'completed')
    assert.equal(res.json.files.length, 2)
  })

  it('recovers when cli-top fuzzy matching is ambiguous (filtered table)', async () => {
    // "an" matches two faculty in cli-top: the proxy re-runs for stable indices instead of
    // returning cli-top's re-numbered rows.
    const res = await start('course-page', { flags: { course: 1, faculty: 'an' } }, creds('21BCE0302'))
    assert.equal(res.json.status, 'needs_selection')
    assert.equal(res.json.step.id, 'faculty')
    assert.equal(res.json.step.options.length, 3, 'full faculty list with original indices')
    assert.equal(res.json.step.unmatchedHint, 'an')
  })

  it('lists and resolves semesters by name', async () => {
    let res = await start('course-page', { select: { semester: 'winter 2024' } }, creds('21BCE0303'))
    assert.equal(res.json.step.id, 'course')
    assert.equal(res.json.step.options[0].label, 'PHY1001 — Engineering Physics')
    assert.equal(res.json.progress[0].choice, 'Winter Semester 2024-25')

    res = await start('marks', { select: { semester: 'previous' } }, creds('21BCE0303'))
    assert.equal(res.json.status, 'completed')
    const marksRuns = p.readLog().filter(e => e.argv[1] === '21BCE0303' && e.argv[3] === 'marks')
    assert.deepEqual(marksRuns.map(r => r.argv.slice(4)), [['--semester', '9999'], ['--semester', '1']])
  })

  it('asks for the class group in calendar', async () => {
    let res = await start('calendar', {}, creds('21BCE0304'))
    assert.equal(res.json.step.id, 'classGroup')
    assert.equal(res.json.step.options[0].label, 'General Semester')
    res = await cont(res.json.continuation, 'weekend')
    assert.equal(res.json.status, 'completed')
  })

  it('supports cancel', async () => {
    const res = await start('syllabus', {}, creds('21BCE0305'))
    assert.equal(res.json.step.id, 'course')
    const cancelled = await cont(res.json.continuation, 'cancel')
    assert.equal(cancelled.json.status, 'cancelled')
  })

  it('rejects tampered, foreign and garbage continuation tokens', async () => {
    const res = await start('syllabus', {}, creds('21BCE0306'))
    const token = res.json.continuation
    const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    assert.equal((await cont(tampered, '1')).json.errorKind, 'token_invalid')
    assert.equal((await cont('garbage', '1')).status, 400)
    const foreign = await p.post('/vtop/continue', { continuation: token, choice: '1', username: '21BCE0999', password: 'pw' })
    assert.equal(foreign.json.errorKind, 'token_invalid')
    assert.match(foreign.json.error, /different VTOP account/)
  })

  it('validates index choices against the offered options', async () => {
    const res = await start('syllabus', {}, creds('21BCE0307'))
    const wrong = await cont(res.json.continuation, '42')
    assert.equal(wrong.json.status, 'needs_selection')
    assert.match(wrong.json.step.prompt, /doesn't exist/)
  })

  it('downloads a syllabus and DA question paper', async () => {
    let res = await start('syllabus', { select: { course: 'CSE2001' } }, creds('21BCE0308'))
    assert.equal(res.json.status, 'completed')
    assert.equal(res.json.files[0].name, 'Data Structures and Algorithms_CSE2001.pdf')
    assert.equal(res.json.files[0].contentType, 'application/pdf')

    res = await start('da', {}, creds('21BCE0308'))
    assert.equal(res.json.step.id, 'course')
    assert.equal(res.json.step.options[0].label, 'Problem Solving and Programming')
    res = await cont(res.json.continuation, '1')
    assert.equal(res.json.step.id, 'assignment')
    res = await cont(res.json.continuation, 'DA1')
    assert.equal(res.json.status, 'completed')
    assert.equal(res.json.files[0].name, 'DA1.pdf')
  })

  it('registers a facility only after confirmation', async () => {
    let res = await start('facility', {}, creds('21BCE0309'))
    assert.equal(res.json.step.id, 'facility')
    res = await cont(res.json.continuation, 'gym')
    assert.equal(res.json.status, 'needs_confirmation')
    assert.equal(res.json.step.kind, 'confirm')
    const runsBefore = p.spawns()
    const declined = await cont(res.json.continuation, 'no')
    assert.equal(declined.json.status, 'cancelled')
    assert.equal(p.spawns(), runsBefore, 'declining never runs cli-top')
    res = await cont(res.json.continuation, 'confirm')
    assert.equal(res.json.status, 'completed')
    assert.deepEqual(p.readLog().at(-1).argv.slice(4), ['--facility', '1', '--confirm', 'true'])

    const conflict = await start('facility', { flags: { facility: 'badminton', confirm: true } }, creds('21BCE0309'))
    assert.equal(conflict.status, 409)
    assert.equal(conflict.json.errorKind, 'conflict')
  })

  it('gates leave applications behind confirmation and collects missing fields', async () => {
    const user = creds('21BCE0310')
    const runsBefore = p.spawns()
    let res = await start('leave', { flags: { apply: true, leaveCode: 'HT1', visitingPlace: 'Chennai', reason: 'Family function' } }, user)
    assert.equal(res.json.status, 'needs_confirmation')
    assert.match(res.json.step.prompt, /Visiting Place: Chennai/)
    assert.equal(p.spawns(), runsBefore, 'nothing submitted before confirmation')

    res = await cont(res.json.continuation, 'confirm')
    assert.equal(res.json.status, 'needs_input')
    assert.equal(res.json.step.id, 'fromDate')
    assert.equal(res.json.step.inputType, 'date')
    res = await cont(res.json.continuation, '2025-11-20')
    assert.equal(res.json.step.id, 'fromTime')
    res = await cont(res.json.continuation, '09:00')
    res = await cont(res.json.continuation, '2025-11-22')
    res = await cont(res.json.continuation, '18:00')
    assert.equal(res.json.status, 'completed')
    assert.match(res.json.message, /submitted successfully/)

    const invalid = await start('leave', { confirm: true, flags: { apply: true, leaveCode: 'XYZ', visitingPlace: 'x', reason: 'y', fromDate: '2025-11-20', fromTime: '09:00', toDate: '2025-11-22', toTime: '18:00' } }, user)
    assert.equal(invalid.json.status, 'needs_input')
    assert.equal(invalid.json.step.id, 'leaveCode')
    assert.ok(invalid.json.step.options.some(o => o.id === 'HT1' && o.label === 'HOME TOWN (HT1)'))

    const pending = await start('leave', { confirm: true, flags: { apply: true, leaveCode: 'HT1', visitingPlace: 'x', reason: 'y', fromDate: '2025-11-20', fromTime: '09:00', toDate: '2025-11-22', toTime: '18:00' } }, creds('21BCE0310', 'pending'))
    assert.equal(pending.status, 409)
    assert.equal(pending.json.errorKind, 'conflict')
  })

  it('offers VTOP form options for night slip fields', async () => {
    let res = await start('nightslip', { confirm: true, flags: { apply: true, details: 'Hackathon', fromDate: '2025-11-20', fromTime: '20:00', toDate: '2025-11-20', toTime: '23:30' } }, creds('21BCE0311'))
    assert.equal(res.json.status, 'needs_input')
    assert.equal(res.json.step.id, 'costCentreId')
    assert.deepEqual(res.json.step.options.map(o => o.id), ['CC1', 'CC2'])
    res = await cont(res.json.continuation, 'hostel office')
    assert.equal(res.json.step.id, 'appliedTo')
    res = await cont(res.json.continuation, '2')
    assert.equal(res.json.step.id, 'eventId')
    res = await cont(res.json.continuation, 'EV1')
    assert.equal(res.json.status, 'completed')
    assert.deepEqual(p.readLog().at(-1).argv.slice(-6), ['--cost-centre-id', 'CC1', '--applied-to', 'W200', '--event-id', 'EV1'])
  })

  it('exposes new read commands', async () => {
    for (const command of ['today', 'tomorrow', 'dayafter', 'holiday', 'events', 'course-allocation', 'course-page-archive']) {
      const res = await start(command, command === 'course-allocation' ? { select: { category: 'core', course: 'CSE2001' } } : {}, creds('21BCE0312'))
      assert.equal(res.json.success, true, command)
      if (command === 'course-page-archive') assert.equal(res.json.step.id, 'course')
      else assert.equal(res.json.status, 'completed', command)
    }
  })
})

describe('downloads', () => {
  let p
  let result
  before(async () => {
    p = await startProxy()
    result = (await p.post('/vtop', { command: 'course-page', ...creds(), select: { course: 'CSE1001', faculty: 'anuj kumar', materials: 'module 1' } })).json
  })
  after(() => p.close())

  it('streams files with the right headers via signed URLs', async () => {
    const file = result.files[0]
    assert.ok(file.url.startsWith(p.base))
    const res = await fetch(file.url)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/pdf')
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="Module-1_Introduction_to_programming_3e9abcd\.pdf"/)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.match(await res.text(), /^%PDF-1\.4/)
    const inline = await fetch(`${file.url}&inline=1`)
    assert.match(inline.headers.get('content-disposition'), /^inline/)
  })

  it('rejects bad signatures, expired links and path tricks', async () => {
    const url = new URL(result.files[0].url)
    const badSig = new URL(url)
    badSig.searchParams.set('sig', 'x' + url.searchParams.get('sig').slice(1))
    assert.equal((await fetch(badSig)).status, 403)
    const expired = new URL(url)
    expired.searchParams.set('exp', '1600000000')
    assert.equal((await fetch(expired)).status, 403)
    assert.equal((await fetch(`${p.base}/files/..%2F..%2Fetc%2Fpasswd/x?exp=9999999999&sig=a`)).status, 403)
    assert.equal((await fetch(`${p.base}/download/anything`)).status, 410)
  })

  it('builds a valid zip bundle', async () => {
    const res = await fetch(result.bundle.url)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/zip')
    const buf = Buffer.from(await res.arrayBuffer())
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    assert.ok(eocd > 0)
    assert.equal(buf.readUInt16LE(eocd + 10), 2)
    const { crc32Update } = require('../src/files/store')
    // first local header: name + data, CRC must match
    const nameLen = buf.readUInt16LE(26)
    const size = buf.readUInt32LE(18)
    const data = buf.subarray(30 + nameLen, 30 + nameLen + size)
    assert.equal(buf.readUInt32LE(14), crc32Update(0, data))
    assert.match(buf.subarray(30, 30 + nameLen).toString(), /^Course Page\//)
  })

  it('expires files after their TTL', async () => {
    const q = await startProxy({ FILE_TTL_SECONDS: '1' })
    try {
      const r = (await q.post('/vtop', { command: 'syllabus', ...creds(), flags: { course: 1 } })).json
      await new Promise(resolve => setTimeout(resolve, 1100))
      const res = await fetch(r.files[0].url)
      assert.equal(res.status, 403)
    } finally {
      await q.close()
    }
  })
})

describe('sync', () => {
  let p
  before(async () => {
    p = await startProxy()
  })
  after(() => p.close())

  it('returns per-command results usable by the hub (result field) in one login', async () => {
    const res = await p.post('/sync', { ...creds('21BCE0400'), commands: ['profile', 'attendance', 'da'] })
    assert.equal(res.status, 200)
    assert.equal(res.json.success, true)
    assert.deepEqual(res.json.results.map(r => r.command), ['profile', 'attendance', 'da'])
    for (const entry of res.json.results) {
      assert.equal(entry.success, true)
      assert.equal(typeof entry.result.data, 'string')
      assert.match(entry.result.data, /│/)
    }
    assert.equal(p.readLog().filter(e => e.argv[1] === '21BCE0400').length, 1)
    assert.deepEqual(p.readLog().at(-1).argv.slice(3), ['sync', '--commands', 'profile,attendance,da'])
  })

  it('answers cached commands without spawning and shares cache with /vtop', async () => {
    const before = p.spawns()
    const res = await p.post('/sync', { ...creds('21BCE0400'), commands: ['profile', 'attendance'] })
    assert.ok(res.json.results.every(r => r.cached))
    assert.equal(p.spawns(), before)
    const single = await p.post('/vtop', { command: 'profile', ...creds('21BCE0400') })
    assert.equal(single.json.meta.cached, true)
  })

  it('streams NDJSON with cached entries first', async () => {
    const res = await fetch(`${p.base}/sync?stream=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-proxy-key' },
      body: JSON.stringify({ ...creds('21BCE0400'), commands: ['cgpa', 'profile'] }),
    })
    assert.equal(res.headers.get('content-type'), 'application/x-ndjson; charset=utf-8')
    const lines = (await res.text()).trim().split('\n').map(line => JSON.parse(line))
    assert.deepEqual(lines.map(l => l.type), ['entry', 'entry', 'done'])
    assert.equal(lines[0].command, 'profile')
    assert.equal(lines[0].cached, true)
    assert.equal(lines[1].command, 'cgpa')
  })

  it('reports auth failures for the whole batch and validates commands', async () => {
    const res = await p.post('/vtop-sync', { ...creds('21BCE0401', 'wrong'), commands: ['profile'] })
    assert.equal(res.status, 401)
    assert.equal(res.json.results[0].errorKind, 'invalid_credentials')
    const bad = await p.post('/sync', { ...creds('21BCE0401'), commands: ['course-page'] })
    assert.equal(bad.status, 400)
  })
})

describe('legacy course-page API', () => {
  let p
  before(async () => {
    p = await startProxy()
  })
  after(() => p.close())

  it('/vtop-interactive and /vtop-interactive-continue keep their response shape', async () => {
    let res = await p.post('/vtop-interactive', { command: 'course-page-interactive', step: 'semester', ...creds(), flags: { courseQuery: 'CSE1001' } })
    assert.equal(res.status, 200)
    assert.equal(res.json.step, 'faculty')
    assert.equal(res.json.interactiveState, 'waiting_for_input')
    assert.equal(res.json.nextStep, 'materials')
    assert.deepEqual(res.json.options[0], { number: 1, id: '1', description: 'Anuj Kumar', text: 'Anuj Kumar', values: { FACULTY: 'Anuj Kumar' } })
    res = await p.post('/vtop-interactive-continue', { sessionData: res.json.sessionData, selection: '1', step: 'faculty', password: 'pw' })
    assert.equal(res.json.step, 'materials')
    res = await p.post('/vtop-interactive-continue', { sessionData: res.json.sessionData, selection: '0', step: 'materials', password: 'pw' })
    assert.equal(res.json.completed, true)
    assert.equal(res.json.interactiveState, 'completed')
    assert.equal(res.json.downloadInfo.filesDownloaded, 5)
    assert.ok(res.json.downloadInfo.servedFiles[0].downloadUrl.startsWith(p.base))
  })

  it('accepts the deprecated encryptedPassword + sessionKey payload', async () => {
    const CryptoJS = require('crypto-js')
    const encryptedPassword = CryptoJS.AES.encrypt('pw', 'k3y').toString()
    let res = await p.post('/vtop', { command: 'profile', username: '21BCE0500', encryptedPassword, sessionKey: 'k3y' })
    assert.equal(res.status, 200)
    res = await p.post('/vtop', { command: 'cgpa', username: '21BCE0500', encryptedPassword: `${encryptedPassword}:::k3y` })
    assert.equal(res.status, 200)
    res = await p.post('/vtop', { command: 'cgpa', username: '21BCE0500', encryptedPassword, sessionKey: 'wrong-key' })
    assert.equal(res.status, 400)
    assert.equal(res.json.errorKind, 'missing_credentials')
  })

  it('/commands describes params and steps', async () => {
    const res = await p.get('/commands')
    const coursePage = res.json.catalog.find(c => c.command === 'course-page')
    assert.deepEqual(coursePage.steps.map(s => s.param), ['semester', 'course', 'faculty', 'materials'])
    assert.equal(res.json.mapping['exam-schedule'], 'exams')
    assert.ok(res.json.commands.includes('course-allocation'))
  })
})

describe('latest.json kill-switch cache', () => {
  const { startLatestJsonServer } = require('./helpers')

  it('fetches upstream once and serves children over loopback', async () => {
    const upstream = await startLatestJsonServer()
    const p = await startProxy({ CLI_TOP_LATEST_JSON_CACHE: 'true', CLI_TOP_LATEST_JSON_UPSTREAM: upstream.url, RESULT_CACHE_ENABLED: 'false' })
    try {
      for (let i = 0; i < 3; i++) await p.post('/vtop', { command: 'profile', ...creds() })
      assert.equal(upstream.state.hits, 1)
      assert.ok(p.readLog().every(e => e.envKeys.includes('CLI_TOP_LATEST_JSON_URL')))
      assert.equal((await p.get('/health')).json.cli.latestVersion, '2.12.1')
    } finally {
      await p.close()
      await upstream.close()
    }
  })

  it('propagates a decommission kill switch as cli_unavailable', async () => {
    const upstream = await startLatestJsonServer({ version: '2.13.0', killSwitch: 2 })
    const p = await startProxy({ CLI_TOP_LATEST_JSON_CACHE: 'true', CLI_TOP_LATEST_JSON_UPSTREAM: upstream.url })
    try {
      const res = await p.post('/vtop', { command: 'profile', ...creds() })
      assert.equal(res.status, 503)
      assert.equal(res.json.errorKind, 'cli_unavailable')
      assert.equal((await p.get('/health')).json.status, 'degraded')
    } finally {
      await p.close()
      await upstream.close()
    }
  })
})
