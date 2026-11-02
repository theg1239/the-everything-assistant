import assert from 'node:assert/strict'
import test from 'node:test'
import { readPreHydrationChecked, readPreHydrationValue } from '../lib/hydration-safe'

// Minimal DOM stand-ins: the module only uses `document.getElementById` and
// `instanceof HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement`.
class FakeElement {
  value = ''
  checked = false
}
class FakeInput extends FakeElement {}
class FakeTextArea extends FakeElement {}
class FakeSelect extends FakeElement {}
class FakeDiv extends FakeElement {}

const DOM_GLOBALS = ['document', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement']

function withFakeDom(elements: Record<string, FakeElement>, fn: () => void) {
  const g = globalThis as Record<string, unknown>
  const saved = DOM_GLOBALS.map(key => [key, Object.getOwnPropertyDescriptor(g, key)] as const)
  g.document = { getElementById: (id: string) => elements[id] ?? null }
  g.HTMLInputElement = FakeInput
  g.HTMLTextAreaElement = FakeTextArea
  g.HTMLSelectElement = FakeSelect
  try {
    fn()
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(g, key, descriptor)
      else delete g[key]
    }
  }
}

const field = <T extends FakeElement>(Element: new () => T, props: Partial<FakeElement>): T =>
  Object.assign(new Element(), props)

test('without a DOM (server render) both readers return undefined', () => {
  assert.equal(typeof (globalThis as { document?: unknown }).document, 'undefined')
  assert.equal(readPreHydrationValue('email'), undefined)
  assert.equal(readPreHydrationChecked('remember'), undefined)
})

test('readPreHydrationValue returns text typed into inputs, textareas and selects', () => {
  withFakeDom(
    {
      email: field(FakeInput, { value: 'me@vit.ac.in' }),
      bio: field(FakeTextArea, { value: 'hello' }),
      campus: field(FakeSelect, { value: 'vellore' }),
    },
    () => {
      assert.equal(readPreHydrationValue('email'), 'me@vit.ac.in')
      assert.equal(readPreHydrationValue('bio'), 'hello')
      assert.equal(readPreHydrationValue('campus'), 'vellore')
    }
  )
})

test('readPreHydrationValue returns undefined for empty, missing or non-field elements', () => {
  withFakeDom(
    {
      empty: field(FakeInput, { value: '' }),
      div: field(FakeDiv, { value: 'not a field' }),
    },
    () => {
      assert.equal(readPreHydrationValue('empty'), undefined)
      assert.equal(readPreHydrationValue('div'), undefined)
      assert.equal(readPreHydrationValue('missing'), undefined)
    }
  )
})

test('readPreHydrationChecked only reads input elements', () => {
  withFakeDom(
    {
      on: field(FakeInput, { checked: true }),
      off: field(FakeInput, { checked: false }),
      select: field(FakeSelect, { checked: true }),
    },
    () => {
      assert.equal(readPreHydrationChecked('on'), true)
      assert.equal(readPreHydrationChecked('off'), false)
      assert.equal(readPreHydrationChecked('select'), undefined)
      assert.equal(readPreHydrationChecked('missing'), undefined)
    }
  )
  // Globals are restored afterwards.
  assert.equal(typeof (globalThis as { document?: unknown }).document, 'undefined')
})
