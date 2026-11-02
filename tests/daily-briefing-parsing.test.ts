import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDateString, parseStartTime } from '../lib/hub/daily-briefing'

test('parseStartTime maps exact VTOP session codes', () => {
  assert.deepEqual(parseStartTime('FN'), { hour: 9, minute: 0 })
  assert.deepEqual(parseStartTime(' an '), { hour: 13, minute: 30 })
})

test('parseStartTime parses clock times instead of matching letters inside words', () => {
  // "an" inside "Jan" used to be read as the afternoon session.
  assert.deepEqual(parseStartTime('02:00 PM - 05:00 PM'), { hour: 14, minute: 0 })
  assert.deepEqual(parseStartTime('08:00 to 08:50'), { hour: 8, minute: 0 })
  assert.equal(parseStartTime('Jan'), null)
})

test('parseDateString does not interpret relative words', () => {
  const reference = new Date(2026, 10, 2)
  assert.equal(parseDateString('tomorrow', reference), null)
  assert.equal(parseDateString('due today', reference), null)
  const parsed = parseDateString('15-11-2026', reference)
  assert.ok(parsed)
  assert.equal(parsed.getDate(), 15)
  assert.equal(parsed.getMonth(), 10)
})
