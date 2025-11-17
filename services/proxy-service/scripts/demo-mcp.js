#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const endpoint = process.env.MCP_URL || 'http://localhost:3001/mcp'
const username = process.env.VTOP_USERNAME || process.argv[2]
const password = process.env.VTOP_PASSWORD || process.argv[3]

if (!username || !password) {
  console.error('Usage: VTOP_USERNAME=... VTOP_PASSWORD=... npm run demo:mcp')
  console.error('   or: node scripts/demo-mcp.js <username> <password>')
  process.exit(1)
}

let nextId = 1

async function callTool(name, args) {
  const payload = {
    jsonrpc: '2.0',
    id: nextId++,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`MCP request failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  if (json.error) {
    throw new Error(`MCP error: ${JSON.stringify(json.error)}`)
  }

  const structured = json.result?.structuredContent
  if (structured) return structured

  try {
    const text = json.result?.content?.[0]?.text
    return text ? JSON.parse(text) : json.result
  } catch (err) {
    return json.result
  }
}

;(async () => {
  console.log(`\n→ Calling course-page-interactive on ${endpoint}`)
  const initial = await callTool('course-page-interactive', {
    username,
    password,
    step: 'semester',
  })

  console.log('Initial response:')
  console.log(JSON.stringify(initial, null, 2))

  const sessionData = initial?.sessionData
  const options = initial?.options
  if (!sessionData || !Array.isArray(options) || options.length === 0) {
    console.log('\nNo options returned; nothing more to do.')
    return
  }

  const firstOption = options[0]
  const selection = String(firstOption?.value || firstOption?.number || 1)

  console.log(`\n→ Continuing workflow with selection ${selection}`)
  const continuation = await callTool('course-page-interactive-continue', {
    sessionData,
    selection,
    step: initial?.currentStep || 'semester',
    password,
  })

  console.log('Continuation response:')
  console.log(JSON.stringify(continuation, null, 2))
})().catch(err => {
  console.error('\nDemo failed:', err.message)
  process.exit(1)
})
