import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isQueryVtopInvocation,
  sanitizeSingleToolInvocation,
  sanitizeToolInvocations,
} from '../lib/sanitize-tools'

test('isQueryVtopInvocation recognises legacy and OpenAI-style invocations', () => {
  assert.equal(isQueryVtopInvocation({ toolName: 'queryVTOP' }), true)
  assert.equal(isQueryVtopInvocation({ function: { name: 'queryVTOP' } }), true)
  assert.equal(isQueryVtopInvocation({ toolName: 'getMessMenu' }), false)
  assert.equal(isQueryVtopInvocation({ function: 'queryVTOP' }), false)
  assert.equal(isQueryVtopInvocation(null), false)
  assert.equal(isQueryVtopInvocation('queryVTOP'), false)
})

test('strips VTOP credentials from args, result.args and drops result.rawArgs', () => {
  const invocation = {
    toolCallId: 'c1',
    toolName: 'queryVTOP',
    args: { command: 'attendance', username: '21BCE0001', password: 'hunter2' },
    result: {
      success: true,
      args: { command: 'attendance', username: '21BCE0001', password: 'hunter2' },
      rawArgs: '{"username":"21BCE0001","password":"hunter2"}',
      data: [1, 2],
    },
  }
  const [sanitized] = sanitizeToolInvocations([invocation])
  assert.deepEqual(sanitized, {
    toolCallId: 'c1',
    toolName: 'queryVTOP',
    args: { command: 'attendance' },
    result: { success: true, args: { command: 'attendance' }, data: [1, 2] },
  })
  assert.ok(!JSON.stringify(sanitized).includes('hunter2'))

  // The input is cloned, never mutated.
  assert.equal(invocation.args.password, 'hunter2')
  assert.equal(invocation.result.rawArgs.length > 0, true)
})

test('strips credentials from OpenAI-style function.arguments (string and object)', () => {
  const [fromString, fromObject] = sanitizeToolInvocations([
    {
      function: {
        name: 'queryVTOP',
        arguments: JSON.stringify({ command: 'marks', username: 'u', password: 'p' }),
      },
    },
    {
      function: {
        name: 'queryVTOP',
        arguments: { command: 'marks', username: 'u', password: 'p' },
      },
    },
  ])
  assert.deepEqual(fromString, {
    function: { name: 'queryVTOP', arguments: JSON.stringify({ command: 'marks' }) },
  })
  assert.deepEqual(fromObject, { function: { name: 'queryVTOP', arguments: { command: 'marks' } } })
})

test('leaves unparseable function.arguments as-is instead of throwing', () => {
  const warn = console.warn
  console.warn = () => {}
  try {
    const [sanitized] = sanitizeToolInvocations([
      { function: { name: 'queryVTOP', arguments: '{not json' } },
    ])
    assert.deepEqual(sanitized, { function: { name: 'queryVTOP', arguments: '{not json' } })
  } finally {
    console.warn = warn
  }
})

test('does not strip fields from other tools', () => {
  const invocation = { toolName: 'login', args: { username: 'keep', password: 'keep' } }
  assert.deepEqual(sanitizeSingleToolInvocation(invocation), invocation)
})

test('clones to plain JSON: drops functions, cycles and uncloneable values, converts bigint', () => {
  const cyclic: Record<string, unknown> = { name: 'loop' }
  cyclic.self = cyclic
  const [sanitized] = sanitizeToolInvocations([
    {
      toolName: 'x',
      fn: () => 1,
      big: BigInt(42),
      response: new Response('body'),
      when: new Date('2026-01-01T00:00:00Z'),
      cyclic,
      list: [1, undefined, 'a'],
    },
  ])
  assert.deepEqual(sanitized, {
    toolName: 'x',
    big: 42,
    when: '2026-01-01T00:00:00.000Z',
    cyclic: { name: 'loop' },
    list: [1, null, 'a'],
  })
})

test('handles non-array input and empty lists', () => {
  assert.deepEqual(sanitizeToolInvocations([]), [])
  assert.deepEqual(sanitizeToolInvocations(null as unknown as unknown[]), [])
  assert.deepEqual(sanitizeToolInvocations({} as unknown as unknown[]), [])
})
