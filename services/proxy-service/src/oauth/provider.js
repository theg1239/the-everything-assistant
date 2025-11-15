const { randomUUID, createHmac, timingSafeEqual } = require('crypto')
const path = require('path')
const { createClientsStore } = require('./client-store')
const CryptoJS = require('crypto-js')
const {
  InvalidRequestError,
  InvalidGrantError,
  InvalidTokenError,
  AccessDeniedError,
  ServerError,
} = require('@modelcontextprotocol/sdk/server/auth/errors.js')

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildRedirectUrl(base, params) {
  const target = new URL(base)
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null) {
      target.searchParams.set(key, val)
    }
  })
  return target.toString()
}

class VtopOAuthProvider {
  constructor(options = {}) {
    this.clientsStore =
      options.clientsStore ||
      createClientsStore({
        staticClients: options.staticClients || [],
        clientsFilePath:
          options.clientsFilePath || process.env.MCP_OAUTH_CLIENTS_PATH || path.resolve(process.cwd(), 'mcp-oauth-clients.json'),
      })
    this.codes = new Map()
    this.tokens = new Map()
    this.refreshTokens = new Map()

    this.skipLocalPkceValidation = false

    this.accessTokenTtlMs = (options.accessTokenTtlSeconds || 3600) * 1000
    this.refreshTokenTtlMs = (options.refreshTokenTtlSeconds || 60 * 60 * 24 * 7) * 1000
    this.codeTtlMs = (options.codeTtlSeconds || 300) * 1000
    this.consentTtlMs = (options.consentTtlSeconds || 300) * 1000
    this.strictResource = options.strictResource !== false
    this.consentSecret =
      options.consentSecret ||
      process.env.MCP_OAUTH_CONSENT_SECRET ||
      process.env.SESSION_SECRET ||
      'everything-assistant-consent-secret'
  }

  cleanupExpiredEntries() {
    const now = Date.now()
    for (const [code, data] of this.codes.entries()) {
      if (data.expiresAt <= now) {
        this.codes.delete(code)
      }
    }
    for (const [token, data] of this.tokens.entries()) {
      if (data.expiresAt <= now) {
        this.tokens.delete(token)
      }
    }
    for (const [token, data] of this.refreshTokens.entries()) {
      if (data.expiresAt <= now) {
        this.refreshTokens.delete(token)
      }
    }
  }

  createConsentPayload(client, params) {
    return {
      clientId: client.client_id,
      state: params.state,
      scopes: params.scopes || [],
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      resource: params.resource ? params.resource.href : undefined,
      issuedAt: Date.now(),
      nonce: randomUUID(),
    }
  }

  encodeConsentToken(payload) {
    const serialized = JSON.stringify(payload)
    const body = Buffer.from(serialized).toString('base64url')
    const signature = createHmac('sha256', this.consentSecret).update(body).digest('base64url')
    return `${body}.${signature}`
  }

  decodeConsentToken(token) {
    if (!token || typeof token !== 'string') {
      throw new InvalidRequestError('Missing consent token')
    }

    const [body, signature] = token.split('.')
    if (!body || !signature) {
      throw new InvalidRequestError('Invalid consent token format')
    }

    const expectedSignature = createHmac('sha256', this.consentSecret).update(body).digest('base64url')
    const provided = Buffer.from(signature, 'base64url')
    const expected = Buffer.from(expectedSignature, 'base64url')
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new InvalidRequestError('Invalid consent token signature')
    }

    let payload
    try {
      const json = Buffer.from(body, 'base64url').toString('utf8')
      payload = JSON.parse(json)
    } catch (error) {
      throw new InvalidRequestError('Malformed consent payload')
    }

    if (!payload?.issuedAt || payload.issuedAt + this.consentTtlMs < Date.now()) {
      throw new InvalidRequestError('Consent session expired or invalid')
    }

    return payload
  }

  renderConsentPage({ consentId, client, params }) {
    const appName = escapeHtml(client.client_name || client.application_name || client.client_id)
    const scopeList = (params.scopes || []).length ? params.scopes.join(', ') : 'mcp:tools'
    const redirectHost = (() => {
      try {
        return new URL(params.redirectUri).host
      } catch {
        return params.redirectUri
      }
    })()

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize ${appName}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #020617;
        --surface: #070b1b;
        --border: rgba(255,255,255,0.07);
        --subtle: #c7d2fe;
        --muted: #8b95c5;
        --primary: #7c3aed;
        --primary-soft: rgba(124,58,237,0.18);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: var(--bg);
        color: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: clamp(1.5rem, 4vw, 3rem);
      }
      .shell {
        width: min(900px, 100%);
        min-height: min(520px, 90vh);
        border-radius: 28px;
        background: var(--surface);
        border: 1px solid var(--border);
        box-shadow: 0 30px 80px rgba(0,0,0,0.45);
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        overflow: hidden;
      }
      .panel {
        padding: clamp(2rem, 5vw, 3rem);
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .panel.info {
        background: rgba(4,7,19,0.6);
        border-right: 1px solid rgba(255,255,255,0.05);
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.4rem 1rem;
        border-radius: 999px;
        background: var(--primary-soft);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 0.78rem;
        color: var(--subtle);
        width: fit-content;
      }
      h1 {
        margin: 0;
        font-size: clamp(1.9rem, 3.6vw, 2.4rem);
      }
      .summary {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
      .pill-stack {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .pill {
        padding: 0.4rem 0.9rem;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.09);
        font-size: 0.82rem;
        color: #e2e8f0;
      }
      .scope-card {
        margin-top: auto;
        padding: 1rem;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.06);
        background: rgba(5,8,20,0.75);
      }
      .scope-card ul {
        margin: 0.6rem 0 0 1rem;
        color: var(--muted);
        line-height: 1.45;
        padding: 0;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      label {
        font-size: 0.82rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--subtle);
      }
      input {
        margin-top: 0.35rem;
        width: 100%;
        padding: 0.9rem 1rem;
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.09);
        background: rgba(0,0,0,0.35);
        color: #f8fafc;
        font-size: 1rem;
        transition: border 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      }
      input:focus {
        outline: none;
        border-color: var(--primary);
        background: rgba(0,0,0,0.55);
        box-shadow: 0 0 0 2px rgba(124,58,237,0.25);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 0.25rem;
      }
      button {
        flex: 1;
        border: none;
        border-radius: 999px;
        padding: 0.95rem 1rem;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      button:hover { transform: translateY(-1px); }
      .primary {
        background: var(--primary);
        color: #050816;
        box-shadow: 0 15px 35px rgba(124,58,237,0.35);
      }
      .secondary {
        background: rgba(148,163,184,0.12);
        color: #e2e8f0;
      }
      .help {
        margin-top: auto;
        font-size: 0.85rem;
        color: var(--muted);
        line-height: 1.5;
      }
      @media (max-width: 900px) {
        .shell { grid-template-columns: 1fr; min-height: unset; }
        .panel.info { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .help { margin-top: 1.5rem; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="panel info">
        <span class="eyebrow">VTOP secure authorization</span>
        <h1>Authorize ${appName}</h1>
        <p class="summary">
          Grant this client secure access to Everything Assistant&apos;s VTOP proxy. We encrypt your credentials locally and only store the cipher inside this OAuth session.
        </p>
        <div class="pill-stack">
          <div class="pill">Scope · ${escapeHtml(scopeList)}</div>
          <div class="pill">Callback · ${escapeHtml(redirectHost || 'custom')}</div>
        </div>
        <div class="scope-card">
          <strong style="color:#e2e8f0;">This client can:</strong>
          <ul>
            <li>Run VTOP-safe commands through Everything Assistant</li>
            <li>Download attendance, grades, timetable & materials</li>
            <li>Display the results directly in your MCP UI</li>
          </ul>
        </div>
      </section>
      <section class="panel">
        <form method="post" action="/oauth/consent">
          <input type="hidden" name="consent_token" value="${consentId}" />
          <label for="username">VTOP username
            <input id="username" name="username" type="text" autocomplete="username" required placeholder="e.g. 23BCE0000" />
          </label>
          <label for="password">VTOP password
            <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password" />
          </label>
          <div class="actions">
            <button type="submit" class="primary">Authorize & Continue</button>
            <button type="submit" name="cancel" value="true" class="secondary">Cancel</button>
          </div>
        </form>
        <p class="help">
          We generate a one-time session key, encrypt your password on this screen, and only forward the cipher to the proxy. You can revoke access any time from your MCP client or Everything Assistant settings → VTOP integration.
        </p>
      </section>
    </div>
  </body>
</html>`
  }

  async authorize(client, params, res) {
    this.cleanupExpiredEntries()
    const payload = this.createConsentPayload(client, params)
    const consentToken = this.encodeConsentToken(payload)
    res.status(200).send(this.renderConsentPage({ consentId: consentToken, client, params }))
  }

  async handleConsentSubmission(payload) {
    this.cleanupExpiredEntries()
    const token = payload?.consent_token || payload?.consent_id
    const consent = this.decodeConsentToken(token)

    const client = await this.clientsStore.getClient(consent.clientId)
    if (!client) {
      throw new InvalidRequestError('Client no longer registered')
    }

    if (payload?.cancel) {
      const error = new AccessDeniedError('User cancelled authorization')
      return {
        redirectUrl: buildRedirectUrl(consent.redirectUri, {
          error: error.errorCode,
          error_description: error.message,
          state: consent.state,
        }),
      }
    }

    const username = payload?.username?.trim()
    const password = payload?.password

    if (!username || !password) {
      throw new InvalidRequestError('Username and password are required')
    }

    const sessionKey = CryptoJS.lib.WordArray.random(256 / 8).toString()
    const encryptedPassword = CryptoJS.AES.encrypt(password, sessionKey).toString()
    const resourceUrl = consent.resource ? new URL(consent.resource) : undefined

    const code = randomUUID()
    this.codes.set(code, {
      clientId: consent.clientId,
      scopes: consent.scopes,
      codeChallenge: consent.codeChallenge,
      redirectUri: consent.redirectUri,
      resource: resourceUrl,
      state: consent.state,
      credentials: {
        username,
        encryptedPassword,
        sessionKey,
      },
      expiresAt: Date.now() + this.codeTtlMs,
    })

    return {
      redirectUrl: buildRedirectUrl(consent.redirectUri, {
        code,
        state: consent.state,
      }),
    }
  }

  async challengeForAuthorizationCode(_client, authorizationCode) {
    const data = this.codes.get(authorizationCode)
    if (!data) {
      throw new InvalidGrantError('Invalid authorization code')
    }
    if (!data.codeChallenge) {
      throw new ServerError('Missing PKCE challenge for authorization code')
    }
    return data.codeChallenge
  }

  ensureResourceAllowed(requested, stored) {
    if (!this.strictResource) return
    if (!stored) return
    if (!requested) {
      throw new InvalidGrantError('Resource indicator required for this server')
    }
    const storedUrl = typeof stored === 'string' ? new URL(stored) : stored
    if (requested.href !== storedUrl.href) {
      throw new InvalidGrantError('Mismatched resource indicator')
    }
  }

  issueTokens({ clientId, scopes, resource, credentials }) {
    const accessToken = randomUUID()
    const refreshToken = randomUUID()
    const now = Date.now()
    const normalizedResource = resource
      ? typeof resource === 'string'
        ? new URL(resource)
        : resource
      : undefined

    const tokenPayload = {
      clientId,
      scopes,
      resource: normalizedResource,
      credentials,
      expiresAt: now + this.accessTokenTtlMs,
    }

    this.tokens.set(accessToken, tokenPayload)
    this.refreshTokens.set(refreshToken, {
      clientId,
      scopes,
      resource: normalizedResource,
      credentials,
      expiresAt: now + this.refreshTokenTtlMs,
    })

    return {
      token_type: 'bearer',
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Math.floor(this.accessTokenTtlMs / 1000),
      scope: scopes.join(' '),
    }
  }

  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri, resource) {
    const data = this.codes.get(authorizationCode)
    if (!data) {
      throw new InvalidGrantError('Invalid authorization code')
    }
    this.codes.delete(authorizationCode)

    if (data.clientId !== client.client_id) {
      throw new InvalidGrantError('Authorization code was not issued to this client')
    }
    if (redirectUri && redirectUri !== data.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match the initial request')
    }

    if (resource) {
      this.ensureResourceAllowed(resource, data.resource)
    }

    return this.issueTokens({
      clientId: client.client_id,
      scopes: data.scopes,
      resource: data.resource,
      credentials: data.credentials,
    })
  }

  async exchangeRefreshToken(client, refreshToken, scopes, resource) {
    const stored = this.refreshTokens.get(refreshToken)
    if (!stored) {
      throw new InvalidGrantError('Invalid refresh token')
    }

    if (stored.clientId !== client.client_id) {
      throw new InvalidGrantError('Refresh token was not issued to this client')
    }

    if (stored.expiresAt < Date.now()) {
      this.refreshTokens.delete(refreshToken)
      throw new InvalidGrantError('Refresh token expired')
    }

    if (resource) {
      this.ensureResourceAllowed(resource, stored.resource)
    }

    const requestedScopes = scopes && scopes.length ? scopes : stored.scopes

    return this.issueTokens({
      clientId: stored.clientId,
      scopes: requestedScopes,
      resource: stored.resource,
      credentials: stored.credentials,
    })
  }

  async verifyAccessToken(token) {
    this.cleanupExpiredEntries()
    const data = this.tokens.get(token)
    if (!data) {
      throw new InvalidTokenError('Invalid access token')
    }

    if (data.expiresAt < Date.now()) {
      this.tokens.delete(token)
      throw new InvalidTokenError('Access token expired')
    }

    return {
      token,
      clientId: data.clientId,
      scopes: data.scopes,
      expiresAt: Math.floor(data.expiresAt / 1000),
      resource: data.resource?.href,
      credentials: data.credentials,
    }
  }

  async revokeToken(_client, request) {
    if (request.token_type_hint === 'access_token' || !request.token_type_hint) {
      this.tokens.delete(request.token)
    }
    if (request.token_type_hint === 'refresh_token' || !request.token_type_hint) {
      this.refreshTokens.delete(request.token)
    }
  }
}

module.exports = {
  VtopOAuthProvider,
}
