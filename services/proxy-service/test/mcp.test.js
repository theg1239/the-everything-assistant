'use strict'

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { startProxy } = require('./helpers')

describe('MCP tools (inline credentials, shared-secret protected)', () => {
  let p
  let sessionId
  let nextId = 1

  const rpc = async (method, params) => {
    const res = await fetch(`${p.base}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer test-proxy-key',
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    })
    sessionId = sessionId || res.headers.get('mcp-session-id')
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
  const call = (name, args) => rpc('tools/call', { name, arguments: args })

  before(async () => {
    p = await startProxy()
    const init = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    })
    assert.ok(init.result, JSON.stringify(init))
    assert.ok(sessionId)
    await fetch(`${p.base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer test-proxy-key', 'Mcp-Session-Id': sessionId },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
  })
  after(() => p.close())

  it('lists a tool per command plus the workflow tools', async () => {
    const { result } = await rpc('tools/list', {})
    const names = result.tools.map(tool => tool.name)
    for (const name of ['profile', 'today', 'tomorrow', 'dayafter', 'holiday', 'events', 'course-allocation', 'course-page-archive', 'course-page', 'vtop-continue', 'sync', 'course-page-interactive', 'course-page-interactive-continue']) {
      assert.ok(names.includes(name), name)
    }
    const coursePage = result.tools.find(tool => tool.name === 'course-page')
    assert.match(coursePage.description, /vtop-continue/)
    assert.match(coursePage.description, /WITHOUT the step flags/)
    const props = coursePage.inputSchema.properties
    assert.equal(props.select, undefined, 'no natural-language hint parameter')
    assert.deepEqual(Object.keys(props.flags.properties).sort(), ['course', 'faculty', 'materials', 'semester'])
    assert.equal(props.flags.properties.course.type, 'integer')
    const cont = result.tools.find(tool => tool.name === 'vtop-continue')
    assert.deepEqual(Object.keys(cont.inputSchema.properties).filter(key => !['username', 'password', 'encryptedPassword', 'sessionKey'].includes(key)).sort(), ['choice', 'continuation'])
  })

  it('runs a read command', async () => {
    const { result } = await call('profile', { username: '21BCE0001', password: 'pw' })
    assert.equal(result.isError, false)
    assert.equal(result.structuredContent.success, true)
    assert.match(result.structuredContent.data, /Test Student/)
  })

  it('drives a multi-step workflow through vtop-continue with option ids and absolute file URLs', async () => {
    const auth = { username: '21BCE0001', password: 'pw' }
    let { result } = await call('course-page', auth)
    assert.equal(result.structuredContent.status, 'needs_selection')
    assert.equal(result.structuredContent.step.id, 'course')
    ;({ result } = await call('vtop-continue', { ...auth, continuation: result.structuredContent.continuation, choice: '1' }))
    assert.equal(result.structuredContent.step.id, 'faculty')
    const token = result.structuredContent.continuation
    const rejected = (await call('vtop-continue', { ...auth, continuation: token, choice: 'anuj' })).result
    assert.equal(rejected.isError, true)
    assert.equal(rejected.structuredContent.errorKind, 'invalid_input')
    assert.deepEqual(rejected.structuredContent.validIds, ['1', '2', '3'])
    ;({ result } = await call('vtop-continue', { ...auth, continuation: token, choice: 1 }))
    ;({ result } = await call('vtop-continue', { ...auth, continuation: result.structuredContent.continuation, choice: ['1', '2'] }))
    assert.equal(result.structuredContent.status, 'completed')
    assert.ok(result.structuredContent.files[0].url.startsWith(p.base))
  })

  it('returns tool errors as isError with a string message', async () => {
    const { result } = await call('profile', { username: '21BCE0001', password: 'wrong' })
    assert.equal(result.isError, true)
    assert.equal(result.structuredContent.errorKind, 'invalid_credentials')
    assert.equal(typeof result.structuredContent.error, 'string')
  })

  it('rejects select hints through MCP too', async () => {
    const { result } = await call('course-page', { username: '21BCE0001', password: 'pw', select: { course: 'CSE1001' } })
    assert.equal(result.isError, true)
    assert.equal(result.structuredContent.field, 'select')
  })

  it('validates flags through MCP too', async () => {
    // typed schema: rejected by the MCP input validation before the proxy runs anything
    const typed = (await call('marks', { username: '21BCE0001', password: 'pw', flags: { semester: '-1' } })).result
    assert.equal(typed.isError, true)
    assert.match(typed.content[0].text, /semester/)
    // unknown flags reach the proxy's allow-list and come back as structured invalid_input
    const { result } = await call('marks', { username: '21BCE0001', password: 'pw', flags: { semesterQuery: 'previous' } })
    assert.equal(result.isError, true)
    assert.equal(result.structuredContent.errorKind, 'invalid_input')
    assert.equal(result.structuredContent.field, 'semesterQuery')
  })
})
