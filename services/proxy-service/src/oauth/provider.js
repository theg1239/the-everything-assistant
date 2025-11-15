const { randomUUID, createHmac, timingSafeEqual } = require('crypto')
const CryptoJS = require('crypto-js')
const {
  InvalidRequestError,
  InvalidGrantError,
  InvalidTokenError,
  AccessDeniedError,
  ServerError,
} = require('@modelcontextprotocol/sdk/server/auth/errors.js')

class InMemoryClientsStore {
  constructor(initialClients = []) {
    this.clients = new Map()
    initialClients.forEach(client => {
      if (client?.client_id) {
        this.clients.set(client.client_id, client)
      }
    })
  }

  async getClient(clientId) {
    return this.clients.get(clientId)
  }

  async registerClient(clientMetadata) {
    if (!clientMetadata.redirect_uris || clientMetadata.redirect_uris.length === 0) {
      throw new InvalidRequestError('Client registration requires at least one redirect_uri')
    }

    const clientId = clientMetadata.client_id || randomUUID()
    const registered = {
      ...clientMetadata,
      client_id: clientId,
    }

    this.clients.set(clientId, registered)
    return registered
  }
}

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
    this.clientsStore = new InMemoryClientsStore(options.staticClients || [])
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
        --ea-surface: #050818;
        --ea-panel: rgba(9, 12, 26, 0.85);
        --ea-glow: linear-gradient(135deg, #6366f1 0%, #8b5cf6 40%, #ec4899 100%);
      }
      * { box-sizing: border-box; }
      body {
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        margin: 0;
        min-height: 100vh;
        background: radial-gradient(circle at top, rgba(99,102,241,0.35), transparent 45%), var(--ea-surface);
        color: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
      }
      .glass {
        width: min(480px, 100%);
        border-radius: 32px;
        padding: 2.75rem;
        background: var(--ea-panel);
        border: 1px solid rgba(99,102,241,0.25);
        box-shadow: 0 25px 70px rgba(5,8,24,0.8);
        position: relative;
        overflow: hidden;
      }
      .glass::after {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at 20% -10%, rgba(99,102,241,0.5), transparent 55%);
        opacity: 0.8;
        pointer-events: none;
      }
      .header { position: relative; z-index: 1; }
      .logo {
        width: 54px;
        height: 54px;
        border-radius: 16px;
        background: var(--ea-glow);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        font-weight: 700;
        color: #0b1120;
        margin-bottom: 1rem;
      }
      h1 { margin: 0; font-size: 2rem; }
      .summary { margin-top: 0.75rem; color: #cbd5f5; line-height: 1.7; }
      form { margin-top: 2.25rem; display: flex; flex-direction: column; gap: 1.35rem; position: relative; z-index: 1; }
      label { font-size: 0.95rem; color: #c7d2fe; text-transform: uppercase; letter-spacing: 0.08em; }
      input {
        width: 100%;
        padding: 0.95rem 1.1rem;
        border-radius: 16px;
        border: 1px solid rgba(99,102,241,0.4);
        background: rgba(5,8,24,0.8);
        color: #f8fafc;
        font-size: 1rem;
        transition: border 0.2s ease, box-shadow 0.2s ease;
      }
      input:focus {
        outline: none;
        border-color: #818cf8;
        box-shadow: 0 0 0 2px rgba(129,140,248,0.3);
      }
      .scopes {
        margin-top: 1.5rem;
        padding: 1.25rem;
        border-radius: 22px;
        background: rgba(12,16,35,0.85);
        border: 1px solid rgba(148,163,184,0.35);
      }
      .scopes h3 { margin: 0 0 0.4rem 0; font-size: 0.95rem; color: #cbd5f5; }
      .scopes p { margin: 0; font-size: 0.9rem; color: #a5b4fc; }
      .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.9rem; margin-top: 0.75rem; }
      button {
        border: none;
        padding: 0.95rem 1.1rem;
        border-radius: 999px;
        font-weight: 600;
        cursor: pointer;
        font-size: 1rem;
      }
      .primary { background: var(--ea-glow); color: #0b1120; }
      .secondary { background: rgba(148,163,184,0.18); color: #cbd5f5; }
      .help { margin-top: 1.25rem; font-size: 0.85rem; color: #94a3b8; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="glass">
      <div class="header">
        <div class="logo">EA</div>
        <div class="badge" style="display:inline-flex;align-items:center;padding:0.35rem 0.9rem;border-radius:999px;background:rgba(99,102,241,0.15);color:#c7d2fe;letter-spacing:0.08em;font-size:0.75rem;text-transform:uppercase;">VTOP secure authorization</div>
        <h1>Authorize ${appName}</h1>
        <p class="summary">
          ${appName} is requesting permission to run VTOP tools via the Everything Assistant proxy.
          We never share your raw credentials with the client—everything stays encrypted inside the proxy session.
        </p>
      </div>
      <form method="post" action="/oauth/consent">
        <input type="hidden" name="consent_token" value="${consentId}" />
        <label for="username">VTOP Username</label>
        <input id="username" name="username" type="text" autocomplete="username" required placeholder="e.g. 22BCE0000" />
        <label for="password">VTOP Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password" />
        <div class="actions">
          <button type="submit" class="primary">Authorize & Continue</button>
          <button type="submit" name="cancel" value="true" class="secondary">Cancel</button>
        </div>
      </form>
      <div class="scopes">
        <h3>Requested scope</h3>
        <p>${escapeHtml(scopeList)}</p>
        <p style="margin-top:0.6rem; color:#94a3b8;">Callback: ${escapeHtml(redirectHost || 'unknown')}</p>
      </div>
      <p class="help">
        Credentials are encrypted with a session key and bound to this OAuth token only. Revoke access anytime from your MCP client or settings → VTOP integration.
      </p>
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
