import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cachedUiMessageToLegacyMessage,
  cachedUiMessagesToLegacyMessages,
  extractTextFromParts,
  legacyMessageToUiMessage,
  uiMessageToLegacyMessage,
  type AppUIMessage,
  type LegacyMessage,
} from '../lib/ai-message-conversion'

const legacyAssistant: LegacyMessage = {
  id: 'msg-1',
  role: 'assistant',
  content: 'here are your papers',
  metadata: { model: 'gpt', usage: { totalTokens: 12 } },
  toolInvocations: [
    {
      toolCallId: 'call-1',
      toolName: 'findPastPapers',
      args: { course: 'CSE1001' },
      result: { papers: [{ url: 'https://x/p.pdf' }] },
      state: 'result',
    },
    {
      toolCallId: 'call-2',
      toolName: 'queryVTOP',
      args: { command: 'attendance' },
      state: 'call',
    },
  ],
  attachments: [
    { url: 'https://x/a.png', name: 'a.png', contentType: 'image/png' },
    { url: 'https://x/blob', contentType: 'application/octet-stream' },
  ],
}

test('legacy -> UI produces text, tool and file parts', () => {
  const ui = legacyMessageToUiMessage(legacyAssistant)
  assert.equal(ui.id, 'msg-1')
  assert.equal(ui.role, 'assistant')
  assert.deepEqual(ui.metadata, legacyAssistant.metadata)
  assert.deepEqual(
    ui.parts.map(part => part.type),
    ['text', 'tool-findPastPapers', 'tool-queryVTOP', 'file', 'file']
  )
  assert.deepEqual(ui.parts[0], { type: 'text', text: 'here are your papers' })
  assert.deepEqual(ui.parts[1], {
    type: 'tool-findPastPapers',
    toolCallId: 'call-1',
    toolName: 'findPastPapers',
    input: { course: 'CSE1001' },
    output: { papers: [{ url: 'https://x/p.pdf' }] },
    state: 'output-available',
    errorText: undefined,
  })
  assert.equal((ui.parts[2] as { state?: string }).state, 'input-available')
  assert.deepEqual(ui.parts[3], {
    type: 'file',
    url: 'https://x/a.png',
    mediaType: 'image/png',
    filename: 'a.png',
  })
  // No name -> no filename key at all.
  assert.deepEqual(ui.parts[4], {
    type: 'file',
    url: 'https://x/blob',
    mediaType: 'application/octet-stream',
  })
})

test('legacy -> UI skips whitespace-only content and generates missing ids', () => {
  const ui = legacyMessageToUiMessage({
    id: '',
    role: 'user',
    content: '   \n',
    toolInvocations: [{ toolCallId: '', toolName: 't' }],
  })
  assert.ok(ui.id.length > 0)
  assert.equal(ui.parts.length, 1)
  const [toolPart] = ui.parts as Array<{ toolCallId: string; state: string }>
  assert.ok(toolPart && toolPart.toolCallId.length > 0)
  // A legacy invocation without a state was a completed result.
  assert.equal(toolPart?.state, 'output-available')
})

test('legacy -> UI -> legacy round-trips text, tool invocations, attachments and metadata', () => {
  const roundTripped = uiMessageToLegacyMessage(legacyMessageToUiMessage(legacyAssistant))
  assert.equal(roundTripped.id, legacyAssistant.id)
  assert.equal(roundTripped.role, legacyAssistant.role)
  assert.equal(roundTripped.content, legacyAssistant.content)
  assert.deepEqual(roundTripped.metadata, legacyAssistant.metadata)
  assert.deepEqual(roundTripped.toolInvocations, [
    { ...legacyAssistant.toolInvocations?.[0], error: undefined },
    { ...legacyAssistant.toolInvocations?.[1], result: undefined, error: undefined },
  ])
  assert.deepEqual(roundTripped.attachments, [
    { url: 'https://x/a.png', name: 'a.png', contentType: 'image/png' },
    { url: 'https://x/blob', name: undefined, contentType: 'application/octet-stream' },
  ])
})

test(
  'legacy -> UI keeps errored tool invocations in an error state',
  () => {
    const ui = legacyMessageToUiMessage({
      id: 'e',
      role: 'assistant',
      content: '',
      toolInvocations: [{ toolCallId: 'c', toolName: 'x', state: 'error', error: 'boom' }],
    })
    assert.equal((ui.parts[0] as { state?: string }).state, 'output-error')
    assert.equal(uiMessageToLegacyMessage(ui).toolInvocations?.[0]?.state, 'error')
  }
)

test('UI -> legacy concatenates text parts and maps tool states', () => {
  const ui: AppUIMessage = {
    id: 'u1',
    role: 'assistant',
    metadata: { createdAt: 1 },
    parts: [
      { type: 'text', text: 'hello ' },
      { type: 'reasoning', text: 'ignored' },
      { type: 'text', text: 'world' },
      {
        type: 'tool-knowledgeBase',
        toolCallId: 'k',
        state: 'output-error',
        input: { query: 'q' },
        errorText: 'failed',
      },
      {
        type: 'tool-getMessMenu',
        toolCallId: 'm',
        state: 'input-streaming',
        input: undefined,
      },
      {
        type: 'dynamic-tool',
        toolName: 'mcpTool',
        toolCallId: 'd',
        state: 'output-available',
        input: 'not-an-object',
        output: { ok: true },
      },
    ],
  }
  const legacy = uiMessageToLegacyMessage(ui)
  assert.equal(legacy.content, 'hello world')
  assert.deepEqual(legacy.metadata, { createdAt: 1 })
  assert.equal(legacy.parts, ui.parts, 'original parts are carried through')
  assert.deepEqual(legacy.toolInvocations, [
    {
      toolCallId: 'k',
      toolName: 'knowledgeBase',
      args: { query: 'q' },
      result: undefined,
      state: 'error',
      error: 'failed',
    },
    {
      toolCallId: 'm',
      toolName: 'getMessMenu',
      args: undefined,
      result: undefined,
      state: 'partial-call',
      error: undefined,
    },
    {
      toolCallId: 'd',
      toolName: 'mcpTool',
      // Non-object inputs are not valid legacy args.
      args: undefined,
      result: { ok: true },
      state: 'result',
      error: undefined,
    },
  ])
  assert.equal(legacy.attachments, undefined)
})

test('UI -> legacy maps denied dynamic tools to error', () => {
  const legacy = uiMessageToLegacyMessage({
    id: 'd',
    role: 'assistant',
    parts: [
      {
        type: 'dynamic-tool',
        toolName: 'mcpTool',
        toolCallId: 'd1',
        state: 'output-denied',
        input: {},
        approval: { id: 'a', approved: false },
      },
    ],
  } as AppUIMessage)
  assert.equal(legacy.toolInvocations?.[0]?.state, 'error')
})

test('UI -> legacy reads older persisted file part shapes', () => {
  const legacy = uiMessageToLegacyMessage({
    id: 'f',
    role: 'user',
    parts: [
      // Nested legacy shape with the name in providerMetadata.
      {
        type: 'file',
        file: {
          url: 'https://x/n.pdf',
          mediaType: 'application/pdf',
          providerMetadata: { attachmentName: 'notes.pdf' },
        },
      },
      // Flat shape with `name` instead of `filename`.
      { type: 'file', url: 'https://x/i.png', mediaType: 'image/png', name: 'pic.png' },
      // Unusable: no media type anywhere -> dropped.
      { type: 'file', url: 'https://x/nothing' },
    ],
  } as unknown as AppUIMessage)
  assert.deepEqual(legacy.attachments, [
    { url: 'https://x/n.pdf', contentType: 'application/pdf', name: 'notes.pdf' },
    { url: 'https://x/i.png', contentType: 'image/png', name: 'pic.png' },
  ])
})

test('extractTextFromParts tolerates missing parts', () => {
  assert.equal(extractTextFromParts(undefined), '')
  assert.equal(extractTextFromParts([]), '')
})

test('cached converter returns the same object for an unchanged UI message', () => {
  const message: AppUIMessage = { id: 'c1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }
  const first = cachedUiMessageToLegacyMessage(message)
  const second = cachedUiMessageToLegacyMessage(message)
  assert.equal(first, second)
  assert.deepEqual(first, uiMessageToLegacyMessage(message))
})

test('cached converter returns a new object when the UI message object changes', () => {
  const message: AppUIMessage = {
    id: 'c2',
    role: 'assistant',
    parts: [{ type: 'text', text: 'a' }],
  }
  const before = cachedUiMessageToLegacyMessage(message)

  // useChat replaces the streaming message with a fresh snapshot on each update.
  const updated: AppUIMessage = { ...message, parts: [{ type: 'text', text: 'ab' }] }
  const after = cachedUiMessageToLegacyMessage(updated)
  assert.notEqual(after, before)
  assert.equal(after.content, 'ab')
  assert.equal(before.content, 'a')

  // A structurally identical but distinct object is also a cache miss (identity-keyed).
  assert.notEqual(cachedUiMessageToLegacyMessage({ ...message }), before)
})

test('cachedUiMessagesToLegacyMessages only re-converts changed messages', () => {
  const stable: AppUIMessage = { id: 's', role: 'user', parts: [{ type: 'text', text: 'q' }] }
  const streaming: AppUIMessage = {
    id: 't',
    role: 'assistant',
    parts: [{ type: 'text', text: '1' }],
  }
  const [stableA, streamingA] = cachedUiMessagesToLegacyMessages([stable, streaming])
  const nextStreaming: AppUIMessage = { ...streaming, parts: [{ type: 'text', text: '12' }] }
  const [stableB, streamingB] = cachedUiMessagesToLegacyMessages([stable, nextStreaming])
  assert.equal(stableB, stableA)
  assert.notEqual(streamingB, streamingA)
  assert.equal(streamingB?.content, '12')
})
