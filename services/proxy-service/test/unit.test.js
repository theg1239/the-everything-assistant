'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const { parseEnvelope } = require('../src/cli/envelope')
const { classifyAuthFailure, classifyExecutionError } = require('../src/cli/errors')
const { Catalog, ValidationError } = require('../src/catalog')
const { TokenSealer } = require('../src/workflow/token')
const { buildOptions, renderTable } = require('../src/cli/output')
const { Scheduler } = require('../src/scheduler')
const { parseFormOptions, parseSelectChoice } = require('../src/service')

const catalog = Catalog.fromFile(path.resolve(__dirname, '../../../hub-capabilities.json'))

describe('envelope parsing', () => {
  it('finds the JSON line after human-readable login text', () => {
    const stdout = '\nInvalid LoginId/Password. Please check your cli-top config and try again...\n{"success":false,"command":"profile","error":{"kind":"auth_failed","message":"failed to initialize VTOP session"}}\n'
    const { envelope, preamble } = parseEnvelope(stdout)
    assert.equal(envelope.error.kind, 'auth_failed')
    assert.match(preamble, /Invalid LoginId/)
    assert.equal(classifyAuthFailure(envelope.error.message, preamble), 'invalid_credentials')
  })

  it('reports non-JSON output', () => {
    const { envelope, problem } = parseEnvelope('This version of cli-top has been decommissioned.\n')
    assert.equal(envelope, null)
    assert.match(problem, /no JSON/)
  })

  it('classifies execution errors', () => {
    assert.equal(classifyExecutionError('missing --leave-code'), 'invalid_input')
    assert.equal(classifyExecutionError('leave request already pending'), 'conflict')
    assert.equal(classifyExecutionError('Post "https://vtop.vit.ac.in/x": dial tcp: i/o timeout'), 'vtop_unavailable')
    assert.equal(classifyExecutionError('no material uploaded'), 'not_found')
    assert.equal(classifyExecutionError('unsupported proxy command: foo'), 'unsupported_command')
  })
})

describe('catalog', () => {
  it('loads every cli-top v2.12.1 proxy command from the shared manifest', () => {
    const cliCommands = new Set(catalog.list().map(entry => entry.cliCommand))
    for (const command of ['profile', 'marks', 'grades', 'attendance', 'timetable', 'holiday', 'today', 'tomorrow', 'dayafter', 'events', 'receipts', 'hostel', 'cgpa', 'exams', 'library-dues', 'calendar', 'course-page', 'course-page-archive', 'course-allocation', 'nightslip', 'leave', 'msg', 'da', 'facility', 'syllabus', 'sync']) {
      assert.ok(cliCommands.has(command), command)
    }
  })

  it('builds argv only from allow-listed, canonical flags', () => {
    const entry = catalog.get('nightslip')
    const flags = catalog.normalizeParams(entry, { apply: 'true', 'cost-centre-id': 'CC1', details: 'Late lab', eventId: 'EV1' })
    assert.deepEqual(catalog.toCliArgs(flags), ['--apply', 'true', '--cost-centre-id', 'CC1', '--details', 'Late lab', '--event-id', 'EV1'])
    assert.throws(() => catalog.normalizeParams(entry, { '--apply': true, x: 1 }), ValidationError)
    assert.throws(() => catalog.toCliArgs({ details: '-x' }), ValidationError)
  })

  it('accepts only exact machine values (no natural-language fields)', () => {
    const entry = catalog.get('course-page')
    assert.deepEqual(catalog.normalizeParams(entry, { course: 2, faculty: '1', materials: 'all', fuzzyIndex: 2 }), { course: 2, faculty: 1, materials: '0' })
    assert.deepEqual(catalog.normalizeParams(entry, { materials: [1, 3, 4] }), { materials: '1,3,4' })
    assert.equal(catalog.normalizeParams(entry, { semester: 'list' }).semester, 9999)
    for (const legacy of ['courseQuery', 'semesterQuery', 'facultyQuery', 'materialQuery']) {
      assert.throws(() => catalog.normalizeParams(entry, { [legacy]: 'dsa' }), err => err.field === legacy)
    }
    // course is an index-only step in course-page: text is rejected, not interpreted
    assert.throws(() => catalog.normalizeParams(entry, { course: 'CSE2001' }), /positive integer option index/)
    assert.throws(() => catalog.normalizeParams(entry, { semester: 'previous' }), /positive integer/)
    assert.throws(() => catalog.normalizeParams(entry, { materials: 'module 2' }), /materials must look like/)
    assert.throws(() => catalog.normalizeParams(entry, { materials: 'everything' }), /materials must look like/)
    assert.throws(() => catalog.normalizeParams(catalog.get('leave'), { apply: 'yes' }), /boolean/)
    // where cli-top runs its own search (select: "fuzzy") a string is forwarded verbatim
    assert.deepEqual(catalog.normalizeParams(entry, { faculty: 'anuj' }), { faculty: 'anuj' })
    assert.deepEqual(catalog.normalizeParams(catalog.get('syllabus'), { course: 'CSE2001' }), { course: 'CSE2001' })
  })
})

describe('continuation tokens', () => {
  const sealer = new TokenSealer({ secret: 'unit-secret', ttlSeconds: 60 })

  it('round-trips, binds to the user and hides contents', () => {
    const { token } = sealer.seal({ u: sealer.userTag('21BCE0001'), f: { reason: 'family wedding' } })
    assert.doesNotMatch(Buffer.from(token.slice(3), 'base64url').toString('latin1'), /family/)
    assert.equal(sealer.open(token, '21bce0001').f.reason, 'family wedding')
    assert.throws(() => sealer.open(token, '21BCE0002'), /different VTOP account/)
    assert.throws(() => new TokenSealer({ secret: 'other', ttlSeconds: 60 }).open(token), /invalid/)
  })

  it('expires', () => {
    const short = new TokenSealer({ secret: 'unit-secret', ttlSeconds: -1 })
    const { token } = short.seal({ u: 'x' })
    assert.throws(() => short.open(token), /expired/)
  })
})

describe('select choices', () => {
  const ids = ['1', '2', '3', '4', '5']
  const single = { param: 'course', label: 'Course', multiple: false }
  const multi = { param: 'materials', label: 'Materials', multiple: true }

  it('accepts option ids only', () => {
    assert.deepEqual(parseSelectChoice(single, '2', ids), { value: 2, ids: ['2'] })
    assert.deepEqual(parseSelectChoice(single, 3, ids), { value: 3, ids: ['3'] })
    assert.deepEqual(parseSelectChoice(single, ['4'], ids), { value: 4, ids: ['4'] })
    for (const bad of ['dsa', 'CSE1001', '9', '0', '1,2', 'all', ['1', '2'], true, '', undefined]) {
      assert.throws(() => parseSelectChoice(single, bad, ids), err => err.kind === 'invalid_input' && err.validIds.join() === ids.join(), String(bad))
    }
  })

  it('accepts id lists, id ranges and "all" for multi-select', () => {
    assert.deepEqual(parseSelectChoice(multi, '1,3-4', ids), { value: '1,3,4', ids: ['1', '3', '4'] })
    assert.deepEqual(parseSelectChoice(multi, ['3', 1], ids), { value: '1,3', ids: ['1', '3'] })
    assert.deepEqual(parseSelectChoice(multi, 'all', ids), { value: '0', ids: 'all' })
    for (const bad of ['module 2', 'everything', '0', '4-2', '1,9', [], ['x'], 'ALL']) {
      assert.throws(() => parseSelectChoice(multi, bad, ids), err => err.validIds.includes('all'), String(bad))
    }
  })

  it('parses VTOP form option lists', () => {
    assert.deepEqual(parseFormOptions('CC1 (Hostel Office), CC2 (Academic Block), RAW').map(o => [o.id, o.label]), [
      ['CC1', 'Hostel Office (CC1)'],
      ['CC2', 'Academic Block (CC2)'],
      ['RAW', 'RAW'],
    ])
  })

  it('renders tables in cli-top box format', () => {
    const text = renderTable({ headers: ['A', 'B'], rows: [['1', 'two']] })
    assert.deepEqual(text.split('\n'), ['    A │ B   ', '    ──┼────', '    1 │ two '])
  })
})

describe('scheduler', () => {
  it('enforces per-key and global concurrency in FIFO order', async () => {
    const s = new Scheduler({ maxConcurrent: 2, perKeyConcurrency: 1, maxQueue: 10, perKeyMaxQueue: 5, queueTimeoutMs: 5000 })
    const order = []
    let active = 0
    let peak = 0
    const task = (label, ms) => async () => {
      active++
      peak = Math.max(peak, active)
      order.push(`start:${label}`)
      await new Promise(r => setTimeout(r, ms))
      active--
      return label
    }
    const results = await Promise.all([
      s.schedule('a', task('a1', 30)),
      s.schedule('a', task('a2', 10)),
      s.schedule('b', task('b1', 10)),
      s.schedule('c', task('c1', 10)),
    ])
    assert.deepEqual(results.map(r => r.value), ['a1', 'a2', 'b1', 'c1'])
    assert.equal(peak, 2)
    assert.ok(order.indexOf('start:a2') > order.indexOf('start:b1'), 'a2 waits for a1 while b1 runs')
  })

  it('times out queued work as busy', async () => {
    const s = new Scheduler({ maxConcurrent: 1, perKeyConcurrency: 1, maxQueue: 10, perKeyMaxQueue: 5, queueTimeoutMs: 20 })
    const slow = s.schedule('a', () => new Promise(r => setTimeout(r, 60)))
    await assert.rejects(s.schedule('b', async () => 1), err => err.kind === 'busy')
    await slow
  })
})
