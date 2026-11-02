import assert from 'node:assert/strict'
import test from 'node:test'
import { autoAdvanceSelections, latestUserText } from '../lib/vtop-tool'
import type { VtopProxyResult } from '../lib/vtop-proxy'
import type { PickOptionParams, PickOptionResult } from '../lib/decisions'

const selection = (stepId: string, labels: string[], extra: Partial<VtopProxyResult> = {}): VtopProxyResult => ({
  success: true,
  status: 'needs_selection',
  command: 'course-page',
  continuation: `token-${stepId}`,
  step: { id: stepId, kind: 'select', label: stepId[0]!.toUpperCase() + stepId.slice(1), options: labels.map((label, i) => ({ id: String(i + 1), label })) },
  ...extra,
})
const completed: VtopProxyResult = { success: true, status: 'completed', command: 'course-page', message: 'done' }

/** A picker that answers from a fixed table: subject -> chosen id (or undecided). */
const pickerFrom = (table: Record<string, string | null>, seen: PickOptionParams[] = []) =>
  async (params: PickOptionParams): Promise<PickOptionResult> => {
    seen.push(params)
    const id = table[params.subject]
    return id ? { status: 'picked', id, probability: 0.9 } : { status: 'undecided', reason: 'no_clear_match' }
  }

test('chains confident picks through the workflow and reports them', async () => {
  const steps: Record<string, VtopProxyResult> = {
    'token-course': selection('faculty', ['Anuj Kumar', 'Anjali Sharma']),
    'token-faculty': selection('materials', ['Module 1', 'Module 2'], { step: { id: 'materials', kind: 'select', label: 'Materials', multiple: true, options: [{ id: '1', label: 'Module 1' }, { id: '2', label: 'Module 2' }] } }),
    'token-materials': completed,
  }
  const continued: [string, unknown][] = []
  const seen: PickOptionParams[] = []
  const { result, decided } = await autoAdvanceSelections({
    result: selection('course', ['CSE1001 Python', 'CSE2001 DSA']),
    request: 'module 2 of dsa by anuj',
    command: 'course-page',
    continueWith: async (token, choice) => { continued.push([token, choice]); return steps[token]! },
    pick: pickerFrom({ course: '2', faculty: '1', materials: '2' }, seen),
  })
  assert.equal(result.status, 'completed')
  assert.deepEqual(continued, [['token-course', '2'], ['token-faculty', '1'], ['token-materials', '2']])
  assert.deepEqual(decided.map(d => [d.step, d.choice]), [['course', 'CSE2001 DSA'], ['faculty', 'Anuj Kumar'], ['materials', 'Module 2']])
  // The user's words reach the decision model verbatim; multi-select steps also offer "all".
  assert.ok(seen.every(p => p.request === 'module 2 of dsa by anuj'))
  assert.ok(seen[2]!.options.some(o => o.id === 'all'))
})

test('stops at the first step the request does not determine', async () => {
  let continues = 0
  const { result, decided } = await autoAdvanceSelections({
    result: selection('course', ['CSE1001 Python', 'CSE2001 DSA']),
    request: 'get my course materials',
    command: 'course-page',
    continueWith: async () => { continues++; return completed },
    pick: pickerFrom({ course: null }),
  })
  assert.equal(result.status, 'needs_selection')
  assert.equal(decided.length, 0)
  assert.equal(continues, 0)
})

test('never auto-answers input/confirm steps, single-option steps, or calls without user text', async () => {
  let picks = 0
  const pick = async (): Promise<PickOptionResult> => { picks++; return { status: 'picked', id: '1', probability: 0.99 } }
  const noop = async () => completed
  const confirm: VtopProxyResult = { success: true, status: 'needs_confirmation', command: 'leave', continuation: 't', step: { id: 'confirm', kind: 'confirm', label: 'Confirm', options: [] } }
  const input: VtopProxyResult = { success: true, status: 'needs_input', command: 'leave', continuation: 't', step: { id: 'date', kind: 'input', label: 'Date' } }
  for (const r of [confirm, input, selection('course', ['only one'])]) {
    assert.equal((await autoAdvanceSelections({ result: r, request: 'apply leave', command: 'leave', continueWith: noop, pick })).decided.length, 0)
  }
  // Workflow-card clicks arrive with no user message: nothing is auto-picked.
  assert.equal((await autoAdvanceSelections({ result: selection('course', ['a', 'b']), request: '', command: 'course-page', continueWith: noop, pick })).decided.length, 0)
  assert.equal(picks, 0)
})

test('stops when a continuation fails and returns that error', async () => {
  const failure: VtopProxyResult = { success: false, status: 'error', command: 'course-page', error: 'token expired', errorKind: 'token_invalid' }
  const { result, decided } = await autoAdvanceSelections({
    result: selection('course', ['a', 'b']),
    request: 'b please',
    command: 'course-page',
    continueWith: async () => failure,
    pick: pickerFrom({ course: '2' }),
  })
  assert.equal(result.errorKind, 'token_invalid')
  assert.equal(decided.length, 1)
})

test('latestUserText reads the last user message (string or text parts)', () => {
  assert.equal(latestUserText(undefined), '')
  assert.equal(
    latestUserText([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: [{ type: 'text', text: 'dsa' }, { type: 'text', text: 'by anuj' }] },
    ]),
    'dsa\nby anuj'
  )
})
