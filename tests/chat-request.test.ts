import assert from 'node:assert/strict'
import test from 'node:test'
import { parseChatRequestPayload } from '../app/api/chat/lib/request'

const userMessage = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }

const validMusicState = {
  isPlaying: true,
  currentTrack: { id: 't1', title: 'Song', artist: 'Band' },
  progress: '0:42',
  duration: '3:30',
  progressPercent: 20,
  trackPosition: '1/3',
  loopMode: 'all',
  shuffle: false,
  trackCount: 3,
  tracks: [{ id: 't1', title: 'Song', artist: 'Band' }],
}

const validMcpConfig = {
  id: 'mcp-1',
  name: 'Docs',
  transportType: 'http',
  url: 'https://mcp.example.com',
  enabled: true,
  createdAt: 1,
  updatedAt: 2,
}

test('accepts a minimal valid payload', () => {
  assert.deepEqual(parseChatRequestPayload({ messages: [userMessage] }), {
    messages: [userMessage],
  })
  assert.deepEqual(parseChatRequestPayload({}), {})
  assert.deepEqual(parseChatRequestPayload({ messages: [] }), { messages: [] })
})

test('rejects non-object bodies', () => {
  for (const body of [null, undefined, 'hi', 42, [], [userMessage]]) {
    assert.equal(parseChatRequestPayload(body), null, JSON.stringify(body))
  }
})

test('rejects malformed messages', () => {
  const malformed: unknown[] = [
    { role: 'user', parts: [] }, // no id
    { id: 1, role: 'user', parts: [] }, // non-string id
    { id: 'x', role: 'tool', parts: [] }, // unknown role
    { id: 'x', role: 'user' }, // no parts
    { id: 'x', role: 'user', parts: 'hi' }, // parts not an array
    { id: 'x', role: 'user', parts: ['hi'] }, // non-object part
    { id: 'x', role: 'user', parts: [null] },
    { id: 'x', role: 'user', parts: [[]] },
    null,
    'hello',
  ]
  for (const message of malformed) {
    assert.equal(
      parseChatRequestPayload({ messages: [userMessage, message] }),
      null,
      JSON.stringify(message)
    )
  }
})

test('keeps a valid musicPlayerState and drops an invalid one without rejecting the request', () => {
  assert.deepEqual(
    parseChatRequestPayload({ messages: [userMessage], musicPlayerState: validMusicState })
      ?.musicPlayerState,
    validMusicState
  )

  const invalidStates: unknown[] = [
    'playing',
    { ...validMusicState, loopMode: 'forever' },
    { ...validMusicState, progressPercent: '20' },
    { ...validMusicState, tracks: [{ id: 't1' }] },
    { isPlaying: true },
  ]
  for (const musicPlayerState of invalidStates) {
    const parsed = parseChatRequestPayload({ messages: [userMessage], musicPlayerState })
    assert.ok(parsed, 'request should still be accepted')
    assert.equal(parsed.musicPlayerState, undefined)
    assert.ok(!('musicPlayerState' in parsed))
    assert.deepEqual(parsed.messages, [userMessage])
  }
})

test('normalizes directToolCall and drops non-JSON args', () => {
  const parsed = parseChatRequestPayload({
    directToolCall: {
      toolName: 'queryVTOP',
      toolCallId: 7,
      args: {
        command: 'attendance',
        nested: { ok: [1, 'a', null] },
        bad: () => 1,
        worse: undefined,
      },
    },
  })
  assert.deepEqual(parsed?.directToolCall, {
    toolName: 'queryVTOP',
    toolCallId: undefined,
    args: { command: 'attendance', nested: { ok: [1, 'a', null] } },
  })

  assert.equal(parseChatRequestPayload({ directToolCall: { args: {} } })?.directToolCall, undefined)
  assert.equal(parseChatRequestPayload({ directToolCall: 'queryVTOP' })?.directToolCall, undefined)
})

test('filters scalar fields by type', () => {
  assert.deepEqual(
    parseChatRequestPayload({ id: 'chat-1', preferredTool: 'past-papers', thinkHarder: true }),
    { id: 'chat-1', preferredTool: 'past-papers', thinkHarder: true }
  )
  assert.deepEqual(parseChatRequestPayload({ id: 5, preferredTool: null, thinkHarder: 'yes' }), {})
})

test('keeps only valid MCP configs from the request', () => {
  const parsed = parseChatRequestPayload({
    mcpConfigs: [validMcpConfig, { ...validMcpConfig, transportType: 'stdio' }, 'nope'],
  })
  assert.deepEqual(parsed?.mcpConfigs, [validMcpConfig])
})
