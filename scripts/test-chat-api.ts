#!/usr/bin/env tsx
/**
 * Simple helper script that sends a test chat message to the local dev server.
 *
 * Usage:
 *   SESSION_COOKIE="next-auth.session-token=..." npx tsx scripts/test-chat-api.ts --message "show all the dsa fat papers"
 *
 * Or pass the cookie explicitly:
 *   npx tsx scripts/test-chat-api.ts --cookie "next-auth.session-token=..." --message "show all the dsa fat papers"
 *
 * Notes:
 * - The dev server (next dev) must already be running on localhost:3000.
 * - Use your browser dev-tools to copy the `next-auth.session-token` cookie value
 *   after logging in, then export it as SESSION_COOKIE before running this script.
 */

type Args = {
  message: string
  preferredTool?: string
  cookie?: string
  url: string
}

const parseArgs = (): Args => {
  const argv = process.argv.slice(2)
  const args: Record<string, string> = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const value = argv[i + 1]
      if (value && !value.startsWith('--')) {
        args[key] = value
        i++
      } else {
        args[key] = 'true'
      }
    }
  }

  return {
    message: args.message || 'show all the dsa fat papers',
    preferredTool: args['preferredTool'] || 'past-papers',
    cookie: args.cookie,
    url: args.url || process.env.CHAT_API_URL || 'http://localhost:3000/api/chat',
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  const { message, preferredTool, cookie, url } = parseArgs()
  const sessionCookie = cookie || process.env.SESSION_COOKIE

  if (!sessionCookie) {
    console.error(
      'Missing session cookie.\n' +
        'Set SESSION_COOKIE env var or pass --cookie "next-auth.session-token=...".'
    )
    process.exit(1)
  }

  const payload = {
    id: `test-${Date.now()}`,
    preferredTool,
    messages: [
      {
        id: `user-${Date.now()}`,
        role: 'user',
        parts: [
          {
            type: 'text',
            text: message,
          },
        ],
      },
    ],
  }

  console.log(`Sending payload to ${url}\n`)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie,
    },
    body: JSON.stringify(payload),
  })

  console.log(`Status: ${res.status} ${res.statusText}`)
  console.log('--- Begin Stream ---\n')

  if (!res.body) {
    console.error('No response body received.')
    process.exit(1)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    process.stdout.write(decoder.decode(value))
    await sleep(10)
  }

  console.log('\n--- End Stream ---')
}

main().catch(err => {
  console.error('Test chat request failed:', err)
  process.exit(1)
})
