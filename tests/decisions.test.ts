import assert from 'node:assert/strict'
import test from 'node:test'
import { pickOption } from '../lib/decisions'
import type { Experimental_DecisionModel } from 'ai'

type Answer = { type: 'choice'; choice: string; probabilities?: Record<string, number> } | { type: 'refusal' }
type Captured = { state?: unknown; criteria?: Record<string, unknown> }

function stubModel(answer: (criteriaKeys: string[]) => Answer, captured: Captured = {}): Experimental_DecisionModel {
  return {
    specificationVersion: 'v4',
    provider: 'test',
    modelId: 'stub',
    supportedQuestionTypes: ['choice', 'boolean', 'score'],
    async doDecide(options) {
      captured.state = options.state
      const question = options.questions.pick
      const criteria = question && question.type === 'choice' ? question.criteria : {}
      captured.criteria = criteria
      return { answers: { pick: answer(Object.keys(criteria)) }, warnings: [] }
    },
  }
}

const distribution = (keys: string[], winner: string, p: number) => {
  const rest = (1 - p) / (keys.length - 1)
  return Object.fromEntries(keys.map(k => [k, k === winner ? p : rest]))
}

const options = [
  { id: '1', label: 'CSE1001 Problem Solving and Programming' },
  { id: '2', label: 'CSE2001 Data Structures and Algorithms' },
]

test('picks the option when the decision is confident', async () => {
  const captured: Captured = {}
  const model = stubModel(keys => ({ type: 'choice', choice: '2', probabilities: distribution(keys, '2', 0.93) }), captured)
  const result = await pickOption({ request: 'dsa notes', subject: 'course', options, model })
  assert.deepEqual(result, { status: 'picked', id: '2', probability: 0.93 })
  // The user's words go to the model verbatim; code does no rewriting.
  assert.match(JSON.stringify(captured.state), /dsa notes/)
  // Every option plus an explicit "no clear match" fallback, each described by when it applies.
  assert.deepEqual(Object.keys(captured.criteria ?? {}).sort(), ['1', '2', '__no_clear_match__'])
  assert.match(String(captured.criteria?.['1']), /^Choose when/)
})

test('defers to the chat model below the threshold', async () => {
  const model = stubModel(keys => ({ type: 'choice', choice: '1', probabilities: distribution(keys, '1', 0.62) }))
  const result = await pickOption({ request: 'course notes', subject: 'course', options, model })
  assert.deepEqual(result, { status: 'undecided', reason: 'low_confidence', probability: 0.62 })
})

test('defers when the model picks the explicit no-clear-match option', async () => {
  const model = stubModel(keys => ({ type: 'choice', choice: '__no_clear_match__', probabilities: distribution(keys, '__no_clear_match__', 0.9) }))
  const result = await pickOption({ request: 'physics notes', subject: 'course', options, model })
  assert.equal(result.status, 'undecided')
})

test('never throws: refusals and provider errors defer to the chat model', async () => {
  const warn = console.warn
  console.warn = () => {}
  try {
    const refusing = stubModel(() => ({ type: 'refusal' }))
    assert.deepEqual(await pickOption({ request: 'x', subject: 'course', options, model: refusing }), { status: 'undecided', reason: 'error' })
    const failing: Experimental_DecisionModel = {
      specificationVersion: 'v4',
      provider: 'test',
      modelId: 'failing',
      supportedQuestionTypes: ['choice'],
      async doDecide() {
        throw new Error('boom')
      },
    }
    assert.deepEqual(await pickOption({ request: 'x', subject: 'course', options, model: failing }), { status: 'undecided', reason: 'error' })
  } finally {
    console.warn = warn
  }
})

test('does not call the model for empty input or oversized option lists', async () => {
  let calls = 0
  const model = stubModel(keys => { calls++; return { type: 'choice', choice: keys[0] ?? '1' } })
  assert.equal((await pickOption({ request: '  ', subject: 'course', options, model })).status, 'undecided')
  const many = Array.from({ length: 201 }, (_, i) => ({ id: String(i + 1), label: `Option ${i + 1}` }))
  assert.deepEqual(await pickOption({ request: 'x', subject: 'course', options: many, model }), { status: 'undecided', reason: 'too_many_options' })
  assert.equal(calls, 0)
})
