import assert from 'node:assert/strict'
import test from 'node:test'
import * as discordAuth from '../services/discord/src/http-auth'
import waAuth from '../services/wa-bot/http-auth.js'

type Outcome = { nextCalled: boolean; status: number | null; body: unknown; headers: Map<string, string> }

/** Runs an auth middleware against a minimal express-like request/response pair. */
const run = (
  middleware: (
    req: { get(name: string): string | undefined },
    res: {
      setHeader(name: string, value: string): unknown
      status(code: number): { json(body: unknown): unknown }
    },
    next: () => void
  ) => void,
  authorization?: string
): Outcome => {
  const outcome: Outcome = { nextCalled: false, status: null, body: null, headers: new Map() }
  const req = {
    get: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
  }
  const res = {
    setHeader: (name: string, value: string) => outcome.headers.set(name, value),
    status: (code: number) => {
      outcome.status = code
      return {
        json: (body: unknown) => {
          outcome.body = body
        },
      }
    },
  }
  middleware(req, res, () => {
    outcome.nextCalled = true
  })
  return outcome
}

const services = [
  {
    name: 'wa-bot',
    auth: waAuth,
    secretVar: 'WA_BOT_API_SECRET',
    insecureVar: 'WA_BOT_INSECURE_DEV',
  },
  {
    name: 'discord',
    auth: discordAuth,
    secretVar: 'DISCORD_BOT_API_SECRET',
    insecureVar: 'DISCORD_BOT_INSECURE_DEV',
  },
] as const

for (const { name, auth, secretVar, insecureVar } of services) {
  const options = { secretVar, insecureVar, serviceName: name }

  test(`${name}: refuses to start without ${secretVar}; insecure dev only outside production`, () => {
    assert.throws(() => auth.resolveApiAuthConfig({}, options), new RegExp(`${secretVar} is not set`))
    assert.throws(
      () => auth.resolveApiAuthConfig({ [insecureVar]: '1', NODE_ENV: 'production' }, options),
      /is not set/u
    )
    assert.deepEqual(auth.resolveApiAuthConfig({ [insecureVar]: '1' }, options), {
      mode: 'insecure-dev',
    })
    assert.deepEqual(auth.resolveApiAuthConfig({ [secretVar]: ' s3cret ' }, options), {
      mode: 'secret',
      secret: 's3cret',
    })
  })

  test(`${name}: /api middleware accepts only the exact bearer secret`, () => {
    const middleware = auth.createApiAuthMiddleware({ mode: 'secret', secret: 's3cret' })

    const ok = run(middleware, 'Bearer s3cret')
    assert.equal(ok.nextCalled, true)
    assert.equal(ok.status, null)
    assert.equal(run(middleware, 'bearer   s3cret ').nextCalled, true)

    for (const header of [undefined, '', 'Bearer', 'Bearer s3cre', 'Bearer s3cret2', 'Basic s3cret', 's3cret']) {
      const denied = run(middleware, header)
      assert.equal(denied.nextCalled, false, String(header))
      assert.equal(denied.status, 401)
      assert.deepEqual(denied.body, { error: 'Unauthorized' })
      assert.equal(denied.headers.get('WWW-Authenticate'), 'Bearer')
    }

    assert.equal(run(auth.createApiAuthMiddleware({ mode: 'insecure-dev' })).nextCalled, true)
  })

  test(`${name}: timing-safe compare and loopback bind default`, () => {
    assert.equal(auth.secretsMatch('abc', 'abc'), true)
    assert.equal(auth.secretsMatch('abc', 'abcd'), false)
    assert.equal(auth.secretsMatch('abc', null), false)
    assert.equal(auth.secretsMatch('', ''), false)
    assert.equal(auth.resolveBindHost({}), '127.0.0.1')
    assert.equal(auth.resolveBindHost({ HOST: '0.0.0.0' }), '0.0.0.0')
  })
}
