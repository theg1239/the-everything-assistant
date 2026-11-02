#!/usr/bin/env node
'use strict'

/**
 * Walks the course-page workflow over MCP, always picking the first option.
 * For local use with MCP_OAUTH_ENABLED=false (inline credentials + PROXY_API_KEY).
 *
 *   VTOP_USERNAME=... VTOP_PASSWORD=... npm run demo:mcp
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true })

const endpoint = process.env.MCP_URL || 'http://localhost:3001/mcp'
const username = process.env.VTOP_USERNAME || process.argv[2]
const password = process.env.VTOP_PASSWORD || process.argv[3]
if (!username || !password) {
  console.error('Usage: VTOP_USERNAME=... VTOP_PASSWORD=... npm run demo:mcp')
  process.exit(1)
}

let nextId = 1
let sessionId

async function rpc(method, params) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(process.env.PROXY_API_KEY ? { Authorization: `Bearer ${process.env.PROXY_API_KEY}` } : {}),
      ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  })
  sessionId = sessionId || res.headers.get('mcp-session-id')
  if (!res.ok) throw new Error(`MCP request failed (${res.status}): ${await res.text()}`)
  const json = await res.json()
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`)
  return json.result
}

;(async () => {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'demo', version: '1.0.0' } })
  let result = (await rpc('tools/call', { name: 'course-page', arguments: { username, password } })).structuredContent
  for (let i = 0; i < 6 && result && String(result.status).startsWith('needs_'); i++) {
    const option = result.step.options[0]
    console.log(`${result.step.label}: ${result.step.options.length} options -> choosing "${option.label}"`)
    const choice = result.step.multiple ? 'all' : option.id
    result = (await rpc('tools/call', { name: 'vtop-continue', arguments: { username, password, continuation: result.continuation, choice } })).structuredContent
  }
  console.log(JSON.stringify({ status: result.status, message: result.message, files: result.files, error: result.error }, null, 2))
})().catch(error => {
  console.error('\nDemo failed:', error.message)
  process.exit(1)
})
