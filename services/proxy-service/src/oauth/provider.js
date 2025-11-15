const { randomUUID } = require('crypto')
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
    this.pendingConsents = new Map()
    this.codes = new Map()
    this.tokens = new Map()
    this.refreshTokens = new Map()

    this.skipLocalPkceValidation = false

    this.accessTokenTtlMs = (options.accessTokenTtlSeconds || 3600) * 1000
    this.refreshTokenTtlMs = (options.refreshTokenTtlSeconds || 60 * 60 * 24 * 7) * 1000
    this.codeTtlMs = (options.codeTtlSeconds || 300) * 1000
    this.consentTtlMs = (options.consentTtlSeconds || 300) * 1000
    this.strictResource = options.strictResource !== false
  }

  cleanupExpiredEntries() {
    const now = Date.now()
    for (const [id, data] of this.pendingConsents.entries()) {
      if (data.expiresAt <= now) {
        this.pendingConsents.delete(id)
      }
    }
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

  createConsentSession(client, params) {
    const consentId = randomUUID()
    this.pendingConsents.set(consentId, {
      clientId: client.client_id,
      client,
      state: params.state,
      scopes: params.scopes || [],
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      resource: params.resource,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.consentTtlMs,
    })
    return consentId
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
      body { font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 0; }
      .container { max-width: 480px; margin: 4rem auto; background: rgba(15, 23, 42, 0.9); border-radius: 24px; padding: 2.5rem; box-shadow: 0 25px 65px rgba(15,23,42,0.7); border: 1px solid rgba(148,163,184,0.2); }
      .badge { display: inline-flex; align-items: center; padding: 0.4rem 0.9rem; border-radius: 999px; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; background: rgba(96,165,250,0.15); color: #93c5fd; }
      h1 { margin-top: 1.5rem; font-size: 1.9rem; }
      .summary { margin-top: 0.5rem; color: #cbd5f5; line-height: 1.6; }
      form { margin-top: 2rem; display: flex; flex-direction: column; gap: 1.25rem; }
      label { font-size: 0.9rem; color: #c7d2fe; }
      input { width: 100%; padding: 0.85rem 1rem; border-radius: 12px; border: 1px solid rgba(99,102,241,0.3); background: rgba(15,23,42,0.75); color: #f8fafc; font-size: 1rem; }
      input:focus { outline: none; border-color: #60a5fa; box-shadow: 0 0 0 2px rgba(96,165,250,0.35); }
      .actions { display: flex; gap: 0.75rem; margin-top: 0.5rem; flex-wrap: wrap; }
      button { flex: 1; padding: 0.95rem 1rem; font-weight: 600; border-radius: 14px; border: none; cursor: pointer; font-size: 1rem; }
      .primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; }
      .secondary { background: rgba(148,163,184,0.15); color: #cbd5f5; }
      .help { margin-top: 1.5rem; font-size: 0.85rem; color: #94a3b8; line-height: 1.4; }
      .scopes { margin-top: 1.5rem; padding: 1rem; border-radius: 16px; background: rgba(15,23,42,0.7); border: 1px solid rgba(148,163,184,0.2); }
      .scopes h3 { margin: 0 0 0.35rem 0; font-size: 0.95rem; color: #cbd5f5; }
      .scopes p { margin: 0; font-size: 0.85rem; color: #a5b4fc; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="badge">VTOP secure authorization</div>
      <h1>Authorize ${appName}</h1>
      <p class="summary">
        ${appName} is requesting permission to run VTOP tools via the Everything Assistant proxy.
        Your credentials stay encrypted here and are never shared with the client.
      </p>
      <div class="scopes">
        <h3>Requested scope</h3>
        <p>${escapeHtml(scopeList)}</p>
        <p style="margin-top:0.6rem; color:#94a3b8;">Callback: ${escapeHtml(redirectHost || 'unknown')}</p>
      </div>
      <form method="post" action="/oauth/consent">
        <input type="hidden" name="consent_id" value="${consentId}" />
        <label for="username">VTOP Username</label>
        <input id="username" name="username" type="text" autocomplete="username" required placeholder="e.g. 22BCE0000" />
        <label for="password">VTOP Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password" />
        <div class="actions">
          <button type="submit" class="primary">Authorize & Continue</button>
          <button type="submit" name="cancel" value="true" class="secondary">Cancel</button>
        </div>
      </form>
      <p class="help">
        We AES-encrypt your password per session key and only store the encrypted blob tied to this OAuth token.
        You can revoke access anytime by unlinking credentials in your MCP client.
      </p>
    </div>
  </body>
</html>`
  }

  async authorize(client, params, res) {
    this.cleanupExpiredEntries()
    const consentId = this.createConsentSession(client, params)
    res.status(200).send(this.renderConsentPage({ consentId, client, params }))
  }

  async handleConsentSubmission(payload) {
    this.cleanupExpiredEntries()
    const consentId = payload?.consent_id
    if (!consentId) {
      throw new InvalidRequestError('Missing consent identifier')
    }

    const consent = this.pendingConsents.get(consentId)
    if (!consent) {
      throw new InvalidRequestError('Consent session expired or invalid')
    }

    this.pendingConsents.delete(consentId)

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

    const code = randomUUID()
    this.codes.set(code, {
      clientId: consent.clientId,
      scopes: consent.scopes,
      codeChallenge: consent.codeChallenge,
      redirectUri: consent.redirectUri,
      resource: consent.resource,
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
    if (requested.href !== stored.href) {
      throw new InvalidGrantError('Mismatched resource indicator')
    }
  }

  issueTokens({ clientId, scopes, resource, credentials }) {
    const accessToken = randomUUID()
    const refreshToken = randomUUID()
    const now = Date.now()

    const tokenPayload = {
      clientId,
      scopes,
      resource,
      credentials,
      expiresAt: now + this.accessTokenTtlMs,
    }

    this.tokens.set(accessToken, tokenPayload)
    this.refreshTokens.set(refreshToken, {
      clientId,
      scopes,
      resource,
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
