const { randomUUID, createHmac, timingSafeEqual } = require('crypto')
const path = require('path')
const { createClientsStore } = require('./client-store')
const { renderConsentPage: renderConsentTemplate } = require('./templates')
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
    const derivedName = client.client_name || client.application_name || client.software_id || client.client_id
    const scopeList = (params.scopes || []).length ? params.scopes.join(', ') : 'mcp:tools'
    const redirectHost = (() => {
      try {
        return new URL(params.redirectUri).host
      } catch {
        return params.redirectUri
      }
    })()

    return renderConsentTemplate({
      consentToken: consentId,
      appName: escapeHtml(derivedName),
      scopeList: escapeHtml(scopeList),
      redirectHost: escapeHtml(redirectHost || 'custom'),
    })
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
