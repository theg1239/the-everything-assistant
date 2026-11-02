'use strict'

const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { startProxy } = require('./helpers')
const { checkRedirectUri, parseAllowlist } = require('../src/oauth/redirect-policy')

const CONSENT_SECRET = 'consent-secret-0123456789abcdef'

function freshProvider(options = {}) {
  const { VtopOAuthProvider } = require('../src/oauth/provider')
  return new VtopOAuthProvider({ consentSecret: CONSENT_SECRET, clientsFilePath: undefined, clientsStore: undefined, ...options })
}

describe('OAuth provider hardening', () => {
  it('refuses to start without a consent secret (no hard-coded fallback)', () => {
    const { VtopOAuthProvider } = require('../src/oauth/provider')
    const saved = process.env.MCP_OAUTH_CONSENT_SECRET
    delete process.env.MCP_OAUTH_CONSENT_SECRET
    process.env.SESSION_SECRET = 'session-secret-should-not-be-used'
    try {
      assert.throws(() => new VtopOAuthProvider({ clientsFilePath: path.join(os.tmpdir(), `c-${Date.now()}.json`) }), /MCP_OAUTH_CONSENT_SECRET/)
      assert.throws(() => new VtopOAuthProvider({ consentSecret: 'short', clientsFilePath: path.join(os.tmpdir(), `c-${Date.now()}.json`) }), /MCP_OAUTH_CONSENT_SECRET/)
    } finally {
      if (saved) process.env.MCP_OAUTH_CONSENT_SECRET = saved
      delete process.env.SESSION_SECRET
    }
  })

  const issueCode = async (provider, client) => {
    const res = { status: () => ({ send: html => (res.html = html) }) }
    await provider.authorize(client, { redirectUri: client.redirect_uris[0], codeChallenge: 'c', scopes: ['mcp:tools'], state: 's' }, res)
    const token = res.html.match(/name="consent_token" value="([^"]+)"/)[1].replace(/&amp;/g, '&')
    const { redirectUrl } = await provider.handleConsentSubmission({ consent_token: token, username: '21BCE0001', password: 'pw' })
    return { code: new URL(redirectUrl).searchParams.get('code'), html: res.html }
  }

  it('shows the full redirect origin on the consent page', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-'))
    const provider = freshProvider({ clientsFilePath: path.join(tmp, 'clients.json') })
    const client = await provider.clientsStore.registerClient({ client_name: '<b>Evil</b>', redirect_uris: ['https://attacker.example:8443/cb'] })
    const { html } = await issueCode(provider, client)
    assert.match(html, /<code id="redirect-origin">https:\/\/attacker\.example:8443<\/code>/)
    assert.doesNotMatch(html, /<b>Evil<\/b>/)
    assert.match(html, /&lt;b&gt;Evil&lt;\/b&gt;/)
  })

  it('rejects expired authorization codes at exchange time', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-'))
    const provider = freshProvider({ clientsFilePath: path.join(tmp, 'clients.json'), codeTtlSeconds: 1 })
    const client = await provider.clientsStore.registerClient({ redirect_uris: ['http://localhost:9999/cb'] })
    const { code } = await issueCode(provider, client)
    provider.codes.get(code).expiresAt = Date.now() - 1 // simulate passage of time without cleanup
    await assert.rejects(provider.challengeForAuthorizationCode(client, code), /expired|Invalid/)
    const { code: code2 } = await issueCode(provider, client)
    provider.codes.get(code2).expiresAt = Date.now() - 1
    await assert.rejects(provider.exchangeAuthorizationCode(client, code2, 'v', client.redirect_uris[0]), /expired/)
  })

  it('rotates refresh tokens (single use)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-'))
    const provider = freshProvider({ clientsFilePath: path.join(tmp, 'clients.json') })
    const client = await provider.clientsStore.registerClient({ redirect_uris: ['http://127.0.0.1:9999/cb'] })
    const { code } = await issueCode(provider, client)
    const first = await provider.exchangeAuthorizationCode(client, code, 'v', client.redirect_uris[0])
    const second = await provider.exchangeRefreshToken(client, first.refresh_token)
    assert.notEqual(second.refresh_token, first.refresh_token)
    await assert.rejects(provider.exchangeRefreshToken(client, first.refresh_token), /Invalid refresh token/)
    const third = await provider.exchangeRefreshToken(client, second.refresh_token)
    assert.ok(third.access_token)
  })

  it('rejects dangerous redirect URIs at registration', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-'))
    const provider = freshProvider({ clientsFilePath: path.join(tmp, 'clients.json') })
    for (const uri of ['javascript:alert(1)', 'data:text/html,x', 'http://evil.example/cb', 'https://user:pw@x.example/cb', 'not a url']) {
      await assert.rejects(provider.clientsStore.registerClient({ redirect_uris: [uri] }), /redirect_uri|scheme|http/, uri)
    }
  })
})

describe('redirect policy', () => {
  it('matches hosts, wildcard subdomains, custom schemes and loopback', () => {
    const allow = parseAllowlist('chatgpt.com, *.claude.ai, cursor:, http://localhost')
    assert.equal(checkRedirectUri('https://chatgpt.com/connector/oauth/cb', allow), null)
    assert.equal(checkRedirectUri('https://app.claude.ai/cb', allow), null)
    assert.notEqual(checkRedirectUri('https://claude.ai/cb', allow), null, 'wildcard does not match apex')
    assert.notEqual(checkRedirectUri('https://chatgpt.com.evil.example/cb', allow), null)
    assert.equal(checkRedirectUri('cursor://anysphere/cb', allow), null)
    assert.equal(checkRedirectUri('http://localhost:33418/cb', allow), null)
    assert.notEqual(checkRedirectUri('http://127.0.0.1:1/cb', allow), null)
    assert.notEqual(checkRedirectUri('https://evil.example/cb', allow), null)
  })
})

describe('OAuth /authorize auto-registration', () => {
  let tmp
  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oauth-http-'))
  })

  const authorize = (p, clientId, redirect) => {
    const url = new URL(`${p.base}/authorize`)
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirect)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('code_challenge', crypto.randomBytes(32).toString('base64url'))
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('state', 'xyz')
    return fetch(url, { redirect: 'manual' })
  }

  const oauthEnv = extra => ({
    MCP_OAUTH_ENABLED: 'true',
    MCP_OAUTH_CONSENT_SECRET: CONSENT_SECRET,
    MCP_OAUTH_CLIENTS_PATH: path.join(tmp, `clients-${Date.now()}-${Math.random()}.json`),
    MCP_OAUTH_ISSUER_URL: 'http://localhost/oauth',
    MCP_OAUTH_RESOURCE_SERVER_URL: 'http://localhost/mcp',
    ...extra,
  })

  it('is disabled by default: unknown clients cannot authorize', async () => {
    const p = await startProxy(oauthEnv({ MCP_OAUTH_AUTO_REGISTER: undefined, MCP_OAUTH_REDIRECT_ALLOWLIST: undefined }))
    try {
      const res = await authorize(p, 'unknown-client', 'https://attacker.example/cb')
      assert.notEqual(res.status, 200)
      assert.doesNotMatch(await res.text(), /consent_token/)
    } finally {
      await p.close()
    }
  })

  it('requires an allow-list and only registers allowed redirect hosts', async () => {
    const noList = await startProxy(oauthEnv({ MCP_OAUTH_AUTO_REGISTER: 'true', MCP_OAUTH_REDIRECT_ALLOWLIST: undefined }))
    try {
      const res = await authorize(noList, 'client-a', 'https://chatgpt.com/cb')
      assert.doesNotMatch(await res.text(), /consent_token/, 'auto-register ignored without allow-list')
    } finally {
      await noList.close()
    }
    const p = await startProxy(oauthEnv({ MCP_OAUTH_AUTO_REGISTER: 'true', MCP_OAUTH_REDIRECT_ALLOWLIST: 'chatgpt.com' }))
    try {
      const bad = await authorize(p, 'client-b', 'https://attacker.example/cb')
      assert.doesNotMatch(await bad.text(), /consent_token/)
      const good = await authorize(p, 'client-c', 'https://chatgpt.com/connector/cb')
      assert.equal(good.status, 200)
      assert.match(await good.text(), /https:\/\/chatgpt\.com<\/code>/)
    } finally {
      await p.close()
    }
  })

  it('requires an OAuth bearer token on /mcp when OAuth is enabled', async () => {
    const p = await startProxy(oauthEnv({}))
    try {
      const res = await fetch(`${p.base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      assert.equal(res.status, 401)
    } finally {
      await p.close()
    }
  })

  after(() => fs.rmSync(tmp, { recursive: true, force: true }))
})
