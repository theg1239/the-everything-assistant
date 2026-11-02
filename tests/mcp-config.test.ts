import assert from 'node:assert/strict'
import test from 'node:test'
import { getMCPConfigs, parseMCPConfigList } from '../lib/mcp-config'

const valid = {
  id: 'mcp-1',
  name: 'Docs',
  transportType: 'sse',
  url: 'https://mcp.example.com/sse',
  headers: { Authorization: 'Bearer x' },
  enabled: false,
  createdAt: 100,
  updatedAt: 200,
}

test('parseMCPConfigList keeps valid entries unchanged', () => {
  assert.deepEqual(parseMCPConfigList([valid]), [valid])
  assert.deepEqual(parseMCPConfigList([{ ...valid, transportType: 'http' }]), [
    { ...valid, transportType: 'http' },
  ])
})

test('parseMCPConfigList returns [] for non-arrays', () => {
  for (const value of [undefined, null, 'x', {}, valid]) {
    assert.deepEqual(parseMCPConfigList(value), [])
  }
})

test('parseMCPConfigList drops entries missing identity fields', () => {
  const { id: _id, ...noId } = valid
  const { url: _url, ...noUrl } = valid
  const { enabled: _enabled, ...noEnabled } = valid
  const invalid: unknown[] = [
    noId,
    noUrl,
    noEnabled,
    { ...valid, name: 3 },
    { ...valid, transportType: 'stdio' },
    { ...valid, enabled: 'true' },
    null,
    'mcp',
  ]
  assert.deepEqual(parseMCPConfigList([...invalid, valid]), [valid])
})

test('parseMCPConfigList falls back on bookkeeping fields instead of rejecting', () => {
  const [parsed] = parseMCPConfigList([
    { ...valid, headers: { Authorization: 1 }, createdAt: 'yesterday', updatedAt: undefined },
  ])
  assert.ok(parsed)
  assert.equal(parsed.headers, undefined)
  assert.equal(parsed.createdAt, 0)
  assert.equal(parsed.updatedAt, 0)
  assert.equal(parsed.id, valid.id)
})

test('getMCPConfigs is empty on the server (no window)', () => {
  assert.equal(typeof (globalThis as { window?: unknown }).window, 'undefined')
  assert.deepEqual(getMCPConfigs(), [])
})
