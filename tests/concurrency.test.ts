import assert from 'node:assert/strict'
import test from 'node:test'
import { mapWithConcurrency } from '../lib/concurrency'

const tick = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

test('mapWithConcurrency keeps input order and never exceeds the limit', async () => {
  let inFlight = 0
  let peak = 0
  const results = await mapWithConcurrency([30, 5, 20, 1, 10, 2], 2, async (ms, index) => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await tick(ms)
    inFlight--
    return `${index}:${ms}`
  })
  assert.deepEqual(results, ['0:30', '1:5', '2:20', '3:1', '4:10', '5:2'])
  assert.equal(peak, 2)
})

test('mapWithConcurrency runs items concurrently up to the limit', async () => {
  const started: number[] = []
  const done = mapWithConcurrency([1, 2, 3], 3, async item => {
    started.push(item)
    await tick(5)
    return item
  })
  await tick(0)
  assert.deepEqual(started, [1, 2, 3])
  assert.deepEqual(await done, [1, 2, 3])
})

test('mapWithConcurrency handles empty input and non-positive limits', async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), [])
  assert.deepEqual(await mapWithConcurrency([1, 2], 0, async x => x * 2), [2, 4])
})

test('mapWithConcurrency rejects on the first failure and starts nothing after it', async () => {
  const started: number[] = []
  await assert.rejects(
    mapWithConcurrency([1, 2, 3, 4, 5], 1, async item => {
      started.push(item)
      if (item === 2) throw new Error('boom')
      return item
    }),
    /boom/
  )
  assert.deepEqual(started, [1, 2])
})
