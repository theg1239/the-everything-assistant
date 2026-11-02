import assert from 'node:assert/strict'
import test from 'node:test'
import { callVtopProxy, type VtopProxyResult } from '../lib/vtop-proxy'
import {
  buildVtopFlags,
  queryVTOPInputSchema,
  toQueryVTOPResult,
  vtopWorkflowChoiceSchema,
} from '../lib/vtop-tool'

const courseStep: VtopProxyResult = {
  success: true,
  status: 'needs_selection',
  command: 'course-page',
  message: 'Choose one course',
  step: {
    id: 'course',
    kind: 'select',
    label: 'Course',
    prompt: 'Choose one course: continue with its option id.',
    multiple: false,
    options: [
      { id: '1', index: 1, label: 'BCSE302L - Database Systems', description: 'Theory' },
      { id: '2', index: 2, label: 'BCSE303L - Operating Systems' },
    ],
  },
  continuation: 'tok-1',
  progress: [{ step: 'semester', label: 'Semester', choice: 'Fall 2025', auto: true }],
}

/** Replaces global fetch for one call, recording the request. */
function mockFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; body: unknown }> = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const raw = typeof init?.body === 'string' ? init.body : '{}'
    const parsed: unknown = JSON.parse(raw)
    calls.push({ url, body: parsed })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { calls, restore: () => void (globalThis.fetch = original) }
}

test('queryVTOP input: option flags are exact indices, legacy text hints are gone', () => {
  const parsed = queryVTOPInputSchema.parse({
    command: 'course-page',
    semester: 'list',
    courseQuery: 'data structures',
    semesterQuery: 'previous',
    facultyQuery: 'anuj',
    materialQuery: 'module 2',
  })
  assert.deepEqual(parsed, { command: 'course-page', semester: 'list' })

  assert.equal(
    queryVTOPInputSchema.safeParse({ command: 'course-page', course: 'CSE1001' }).success,
    false
  )
  assert.equal(queryVTOPInputSchema.safeParse({ command: 'course-page', course: 2 }).success, true)
  assert.equal(
    queryVTOPInputSchema.safeParse({ command: 'course-page', materials: '1,3-5' }).success,
    true
  )
  assert.equal(
    queryVTOPInputSchema.safeParse({ command: 'course-page', materials: 'all' }).success,
    true
  )
  assert.equal(
    queryVTOPInputSchema.safeParse({ command: 'course-page', materials: 'module 2' }).success,
    false
  )
  assert.equal(
    queryVTOPInputSchema.safeParse({ command: 'marks', semester: 'previous' }).success,
    false
  )
})

test('buildVtopFlags passes values through unchanged and reports flags the command does not take', () => {
  const input = queryVTOPInputSchema.parse({
    command: 'course-page',
    semester: 3,
    course: 2,
    materials: '1,3-5',
  })
  assert.deepEqual(buildVtopFlags(input), {
    flags: { semester: 3, course: 2, materials: '1,3-5' },
    ignored: [],
  })

  const marks = queryVTOPInputSchema.parse({ command: 'marks', semester: 'list', course: 4 })
  assert.deepEqual(buildVtopFlags(marks), { flags: { semester: 'list' }, ignored: ['course'] })
})

test('toQueryVTOPResult exposes the full option list, continuation and next action for a pending step', () => {
  const output = toQueryVTOPResult('course-page', courseStep)
  assert.equal(output.status, 'needs_selection')
  assert.equal(output.continuation, 'tok-1')
  assert.deepEqual(
    output.step?.options?.map(option => option.id),
    ['1', '2']
  )
  assert.equal(output.type, 'vtop-workflow')
  assert.match(output.nextAction ?? '', /continuation and choice = the option id/)
  assert.equal(output.data, 'Choose one course: continue with its option id.')
  assert.equal(output.progress?.[0]?.auto, true)
})

test('callVtopProxy: a needs_selection run, then /vtop/continue with the chosen option id', async () => {
  const first = mockFetch(200, courseStep)
  try {
    const result = await callVtopProxy('/vtop', {
      username: '23BCE0001',
      password: 'pw',
      command: 'course-page',
      flags: {},
    })
    assert.equal(result.status, 'needs_selection')
    assert.equal(result.step?.options?.length, 2)
    assert.match(first.calls[0]?.url ?? '', /\/vtop$/)
    assert.equal(
      Object.prototype.hasOwnProperty.call(first.calls[0]?.body ?? {}, 'select'),
      false,
      'no select hints are sent'
    )
  } finally {
    first.restore()
  }

  const second = mockFetch(200, {
    success: true,
    status: 'completed',
    command: 'course-page',
    data: 'ok',
  })
  try {
    const result = await callVtopProxy('/vtop/continue', {
      username: '23BCE0001',
      password: 'pw',
      continuation: 'tok-1',
      choice: '2',
    })
    assert.equal(result.status, 'completed')
    assert.match(second.calls[0]?.url ?? '', /\/vtop\/continue$/)
    assert.deepEqual(second.calls[0]?.body, {
      username: '23BCE0001',
      password: 'pw',
      continuation: 'tok-1',
      choice: '2',
    })
  } finally {
    second.restore()
  }
})

test('callVtopProxy: a free-text choice comes back as invalid_input with the valid ids', async () => {
  const rejected = mockFetch(400, {
    success: false,
    status: 'error',
    error:
      '"database systems" is not a valid choice for Course; expected exactly one option id. Valid ids: 1, 2',
    errorKind: 'invalid_input',
    field: 'choice',
    validIds: ['1', '2'],
  })
  try {
    const result = await callVtopProxy('/vtop/continue', {
      username: '23BCE0001',
      password: 'pw',
      continuation: 'tok-1',
      choice: 'database systems',
    })
    assert.equal(result.success, false)
    assert.equal(result.errorKind, 'invalid_input')
    assert.deepEqual(result.validIds, ['1', '2'])

    const output = toQueryVTOPResult('course-page', result)
    assert.equal(output.errorKind, 'invalid_input')
    assert.equal(output.field, 'choice')
    assert.deepEqual(output.validIds, ['1', '2'])
    assert.equal(output.requiresCredentials, false)
  } finally {
    rejected.restore()
  }
})

test('callVtopProxy: a non-result error body keeps field and validIds', async () => {
  const rejected = mockFetch(400, {
    error: 'bad choice',
    errorKind: 'invalid_input',
    field: 'choice',
    validIds: ['3'],
  })
  try {
    const result = await callVtopProxy('/vtop/continue', {
      username: 'u',
      password: 'p',
      continuation: 'tok',
      choice: 'x',
    })
    assert.deepEqual(
      {
        success: result.success,
        errorKind: result.errorKind,
        field: result.field,
        validIds: result.validIds,
      },
      { success: false, errorKind: 'invalid_input', field: 'choice', validIds: ['3'] }
    )
  } finally {
    rejected.restore()
  }
})

test('workflow card choices are structured (ids, values or booleans), never free text to interpret', () => {
  const base = {
    command: 'course-page',
    continuation: 'tok-1',
    display: 'Course: Database Systems (option 1)',
  }
  assert.equal(vtopWorkflowChoiceSchema.safeParse({ ...base, choice: '1' }).success, true)
  assert.equal(vtopWorkflowChoiceSchema.safeParse({ ...base, choice: ['1', '3'] }).success, true)
  assert.equal(vtopWorkflowChoiceSchema.safeParse({ ...base, choice: true }).success, true)
  assert.equal(
    vtopWorkflowChoiceSchema.safeParse({ ...base, command: 'not-a-command', choice: '1' }).success,
    false
  )
  assert.equal(
    vtopWorkflowChoiceSchema.safeParse({ ...base, continuation: '', choice: '1' }).success,
    false
  )
})
