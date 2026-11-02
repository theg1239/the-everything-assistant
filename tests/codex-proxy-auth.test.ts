import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCodexChildEnv,
  isRequestAuthorized,
  resolveBindHost,
  resolveProxyAuthConfig,
  tokensMatch,
} from '../services/codex-proxy/src/security'

test('codex-proxy refuses to start without a token unless insecure dev outside production', () => {
  assert.throws(() => resolveProxyAuthConfig({}), /CODEX_PROXY_AUTH_TOKEN is not set/u)
  assert.throws(() => resolveProxyAuthConfig({ CODEX_PROXY_AUTH_TOKEN: '   ' }), /not set/u)
  assert.throws(
    () => resolveProxyAuthConfig({ CODEX_PROXY_INSECURE_DEV: '1', NODE_ENV: 'production' }),
    /not set/u
  )
  assert.deepEqual(resolveProxyAuthConfig({ CODEX_PROXY_INSECURE_DEV: '1' }), {
    mode: 'insecure-dev',
  })
  assert.deepEqual(resolveProxyAuthConfig({ CODEX_PROXY_AUTH_TOKEN: ' tok ' }), {
    mode: 'token',
    token: 'tok',
  })
})

test('codex-proxy token comparison is exact and length-independent', () => {
  assert.equal(tokensMatch('secret-token', 'secret-token'), true)
  assert.equal(tokensMatch('secret-token', 'secret-tokeN'), false)
  assert.equal(tokensMatch('secret-token', 'secret'), false)
  assert.equal(tokensMatch('secret-token', 'secret-token-longer'), false)
  assert.equal(tokensMatch('secret-token', null), false)
  assert.equal(tokensMatch('', ''), false)
})

test('codex-proxy accepts bearer or x-codex-proxy-token, rejects anything else', () => {
  const config = { mode: 'token', token: 'tok' } as const
  assert.equal(isRequestAuthorized(config, new Headers({ authorization: 'Bearer tok' })), true)
  assert.equal(isRequestAuthorized(config, new Headers({ 'x-codex-proxy-token': 'tok' })), true)
  assert.equal(isRequestAuthorized(config, new Headers({ authorization: 'Bearer nope' })), false)
  assert.equal(isRequestAuthorized(config, new Headers({ authorization: 'Basic tok' })), false)
  assert.equal(isRequestAuthorized(config, new Headers()), false)
  assert.equal(isRequestAuthorized({ mode: 'insecure-dev' }, new Headers()), true)
})

test('codex-proxy binds loopback by default and keeps its token out of codex', () => {
  assert.equal(resolveBindHost({}), '127.0.0.1')
  assert.equal(resolveBindHost({ CODEX_PROXY_HOST: '0.0.0.0' }), '0.0.0.0')
  assert.equal(resolveBindHost({ HOST: '10.0.0.5' }), '10.0.0.5')

  const env = buildCodexChildEnv(
    { PATH: '/bin', CODEX_PROXY_AUTH_TOKEN: 'tok', DATABASE_URL: 'x', HOME: '/root' },
    '/homes/u1'
  )
  assert.deepEqual(env, { PATH: '/bin', HOME: '/homes/u1', CODEX_HOME: '/homes/u1' })
})
