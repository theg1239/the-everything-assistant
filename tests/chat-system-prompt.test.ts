import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import type { SystemModelMessage } from 'ai'
import {
  enhanceMessagesWithToolContext,
  prepareFinalMessages,
} from '../app/api/chat/lib/message-prep'
import { buildSystemPrompt } from '../app/api/chat/lib/prompt'
import type { LegacyMessage } from '../lib/ai-message-conversion'
import { VIT_SYSTEM_PROMPT } from '../lib/prompts'

const promptOptions = {
  prefersWebSearch: false,
  memoryContext: '<memory>likes CSE</memory>',
  isMemoryEnabled: true,
  sessionUser: { name: 'Asha', email: 'asha@example.com' },
  channel: 'web',
}

const firstTurn: LegacyMessage[] = [{ id: 'u1', role: 'user', content: 'what is my attendance?' }]
const followUpTurn: LegacyMessage[] = [
  ...firstTurn,
  { id: 'a1', role: 'assistant', content: 'it is 80%' },
  { id: 'u2', role: 'user', content: 'and for CSE1001?' },
]

const textOf = (message: SystemModelMessage | undefined) => message?.content ?? ''

function atTime<T>(iso: string, fn: () => Promise<T> | T): Promise<T> {
  mock.timers.enable({ apis: ['Date'], now: new Date(iso) })
  return Promise.resolve()
    .then(fn)
    .finally(() => mock.timers.reset())
}

test('buildSystemPrompt puts the static prompt first and per-request context after it', () => {
  const { systemMessages, prefersWebSearch } = buildSystemPrompt(promptOptions)
  assert.equal(prefersWebSearch, false)
  assert.equal(systemMessages.length, 2)

  const [staticMessage, dynamicMessage] = systemMessages
  assert.equal(staticMessage?.content, VIT_SYSTEM_PROMPT)
  assert.ok(VIT_SYSTEM_PROMPT.length > 1000, 'the static prompt should be the large prefix')

  const dynamic = dynamicMessage?.content ?? ''
  assert.match(dynamic, /Today is /)
  assert.match(dynamic, /<session_context>/)
  assert.match(dynamic, /likes CSE/)
  // Per-request context must never leak into the static prefix.
  for (const marker of ['Today is ', 'likes CSE', 'user identity: Asha']) {
    assert.ok(!staticMessage?.content.includes(marker), `static prompt contains ${marker}`)
  }
})

test('the static system prefix is byte-identical across requests (prompt-cache friendly)', async () => {
  const morning = await atTime('2026-01-05T03:00:00Z', () => buildSystemPrompt(promptOptions))
  const evening = await atTime('2026-03-09T15:30:00Z', () =>
    buildSystemPrompt({ ...promptOptions, memoryContext: 'other', sessionUser: { name: 'Ravi' } })
  )
  assert.equal(morning.systemMessages[0]?.content, evening.systemMessages[0]?.content)
  assert.notEqual(morning.systemMessages[1]?.content, evening.systemMessages[1]?.content)
})

test('memory context is only included when memory is enabled', () => {
  const disabled = buildSystemPrompt({ ...promptOptions, isMemoryEnabled: false })
  assert.ok(!disabled.systemMessages.some(m => m.content.includes('likes CSE')))
})

test('guest sessions do not expose identity in the prompt', () => {
  const { systemMessages } = buildSystemPrompt({
    ...promptOptions,
    sessionUser: { name: 'Hidden', isGuest: true },
  })
  const dynamic = systemMessages[1]?.content ?? ''
  assert.match(dynamic, /guest user/)
  assert.match(dynamic, /user identity: n\/a/)
  assert.ok(!dynamic.includes('Hidden'))
})

for (const [label, history] of [
  ['first turn', firstTurn],
  ['follow-up turn', followUpTurn],
] as const) {
  test(`prepareFinalMessages sends the full system prompt on the ${label}`, async () => {
    const { systemMessages, prefersWebSearch } = buildSystemPrompt(promptOptions)
    const prepared = await prepareFinalMessages(
      enhanceMessagesWithToolContext([...history]),
      systemMessages,
      prefersWebSearch
    )

    // Regression: instructions used to be dropped on every turn after the first.
    assert.equal(prepared.instructions.length, 2)
    assert.equal(textOf(prepared.instructions[0]), VIT_SYSTEM_PROMPT)
    assert.match(textOf(prepared.instructions[1]), /Today is /)
    assert.match(textOf(prepared.instructions[1]), /likes CSE/)

    // System content goes to `instructions` only; `messages` is the conversation.
    assert.equal(prepared.messages.length, history.length)
    assert.ok(prepared.messages.every(m => m.role !== 'system'))
    assert.deepEqual(
      prepared.messages.map(m => m.role),
      history.map(m => m.role)
    )
  })
}

test('instructions are identical on first and follow-up turns of the same request context', async () => {
  const { systemMessages, prefersWebSearch } = buildSystemPrompt(promptOptions)
  const first = await prepareFinalMessages(firstTurn, systemMessages, prefersWebSearch)
  const followUp = await prepareFinalMessages(followUpTurn, systemMessages, prefersWebSearch, {})
  assert.deepEqual(followUp.instructions, first.instructions)
})

test('web-search mode sends its system prompt on follow-up turns too', async () => {
  const { systemMessages, prefersWebSearch } = buildSystemPrompt({
    ...promptOptions,
    prefersWebSearch: true,
  })
  assert.equal(prefersWebSearch, true)
  const prepared = await prepareFinalMessages(followUpTurn, systemMessages, prefersWebSearch)
  assert.equal(prepared.instructions.length, 1)
  assert.match(textOf(prepared.instructions[0]), /web search tool/)
})

test('system messages carried in history are appended after the built prompt', async () => {
  const { systemMessages } = buildSystemPrompt(promptOptions)
  const prepared = await prepareFinalMessages(
    [{ id: 's', role: 'system', content: 'history system note' }, ...followUpTurn],
    systemMessages,
    false
  )
  assert.equal(prepared.instructions.length, 3)
  assert.equal(textOf(prepared.instructions[0]), VIT_SYSTEM_PROMPT)
  assert.equal(textOf(prepared.instructions[2]), 'history system note')
  assert.ok(prepared.messages.every(m => m.role !== 'system'))
})

test('prepareFinalMessages drops empty messages and attaches PDFs/images as file parts', async () => {
  const prepared = await prepareFinalMessages(
    [
      { id: 'u1', role: 'user', content: '   ' },
      {
        id: 'u2',
        role: 'user',
        content: 'summarise this',
        attachments: [
          { url: 'https://x/doc.pdf', contentType: 'application/pdf' },
          { url: 'https://x/notes.txt', contentType: 'text/plain' },
        ],
      },
    ],
    [],
    false
  )
  assert.equal(prepared.attachmentAware, true)
  assert.equal(prepared.messages.length, 1)
  assert.deepEqual(prepared.messages[0], {
    role: 'user',
    content: [
      { type: 'text', text: 'summarise this' },
      { type: 'file', data: 'https://x/doc.pdf', mediaType: 'application/pdf' },
    ],
  })
})

test('enhanceMessagesWithToolContext forwards PDFs found by earlier tool calls to the latest user turn', () => {
  const enhanced = enhanceMessagesWithToolContext([
    { id: 'u1', role: 'user', content: 'papers for CSE1001' },
    {
      id: 'a1',
      role: 'assistant',
      content: 'found some',
      toolInvocations: [
        {
          toolCallId: 'c',
          toolName: 'findPastPapers',
          result: { papers: [{ url: 'https://x/cat1.pdf', title: 'CAT 1' }] },
        },
      ],
    },
    { id: 'u2', role: 'user', content: 'summarise them' },
  ])
  assert.match(enhanced[1]?.content ?? '', /\[INTERNAL - PAPERS\]: 1 past papers attached/)
  assert.deepEqual(enhanced[2]?.attachments, [
    { url: 'https://x/cat1.pdf', name: 'CAT 1', contentType: 'application/pdf' },
  ])
})
