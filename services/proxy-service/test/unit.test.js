'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const { parseEnvelope } = require('../src/cli/envelope')
const { classifyAuthFailure, classifyExecutionError } = require('../src/cli/errors')
const { Catalog, ValidationError } = require('../src/catalog')
const { TokenSealer } = require('../src/workflow/token')
const { matchOne, matchMany } = require('../src/workflow/match')
const { buildOptions, renderTable } = require('../src/cli/output')
const { Scheduler } = require('../src/scheduler')
const { parseFormOptions } = require('../src/service')

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
    const { flags } = catalog.normalizeParams(entry, { apply: 'true', 'cost-centre-id': 'CC1', details: 'Late lab', eventId: 'EV1' })
    assert.deepEqual(catalog.toCliArgs(flags), ['--apply', 'true', '--cost-centre-id', 'CC1', '--details', 'Late lab', '--event-id', 'EV1'])
    assert.throws(() => catalog.normalizeParams(entry, { '--apply': true, x: 1 }), ValidationError)
    assert.throws(() => catalog.toCliArgs({ details: '-x' }), ValidationError)
  })

  it('maps legacy query fields to hints and free text for index steps to hints', () => {
    const entry = catalog.get('course-page')
    const { flags, hints } = catalog.normalizeParams(entry, { courseQuery: 'dsa', course: 'CSE2001', fuzzyIndex: 2, materialSelection: 'all' })
    assert.deepEqual(flags, { materials: '0' })
    assert.deepEqual(hints, { course: 'dsa' })
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

describe('matching', () => {
  const courses = buildOptions({ headers: ['COURSE CODE', 'COURSE NAME'], rows: [['CSE1001', 'Problem Solving and Programming'], ['CSE2001', 'Data Structures and Algorithms'], ['MAT1011', 'Calculus for Engineers']] })
  const semesters = buildOptions({ headers: ['SEMESTER'], rows: [['Winter Semester 2024-25'], ['Fall Semester 2025-26']] })
  const materials = buildOptions({ headers: ['DATE', 'MODULE', 'TOPIC', 'REF COUNT'], rows: [['1', '1', 'Intro', '1'], ['2', '2', 'Trees slides', '1'], ['3', '2', 'Graphs', '1']] })

  it('matches codes, acronyms and words', () => {
    assert.equal(matchOne(courses, 'cse2001').option.index, 2)
    assert.equal(matchOne(courses, 'DSA').option.index, 2)
    assert.equal(matchOne(courses, 'calculus').option.index, 3)
    assert.equal(matchOne(courses, 'physics').option, undefined)
  })

  it('resolves relative semesters', () => {
    assert.equal(matchOne(semesters, 'previous semester', { param: 'semester' }).option.index, 1)
    assert.equal(matchOne(semesters, 'fall 2025', { param: 'semester' }).option.index, 2)
  })

  it('selects materials by module, words or all', () => {
    assert.equal(matchMany(materials, 'module 2 slides').selection, '2,3')
    assert.equal(matchMany(materials, 'graphs').selection, '3')
    assert.equal(matchMany(materials, 'all of the materials').selection, '0')
    assert.equal(matchMany(materials, '1, 3').selection, '1,3')
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
