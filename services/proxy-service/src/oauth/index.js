const express = require('express')
const path = require('path')
const {
  mcpAuthRouter,
  mcpAuthMetadataRouter,
  getOAuthProtectedResourceMetadataUrl,
  createOAuthMetadata,
} = require('@modelcontextprotocol/sdk/server/auth/router.js')
const { requireBearerAuth } = require('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js')
const { InvalidRequestError } = require('@modelcontextprotocol/sdk/server/auth/errors.js')
const { VtopOAuthProvider } = require('./provider')
const { renderErrorPage, renderSuccessRedirectPage } = require('./templates')

const DEFAULT_ISSUER = 'http://localhost:3001/oauth'
const DEFAULT_RESOURCE = 'http://localhost:3001/mcp'

function parseUrl(value, fallback) {
  try {
    return new URL(value)
  } catch (error) {
    if (fallback) return new URL(fallback)
    throw error
  }
}

function loadStaticClients() {
  const raw = process.env.MCP_OAUTH_STATIC_CLIENTS
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
    }
    console.warn('[oauth] MCP_OAUTH_STATIC_CLIENTS must be a JSON array')
    return []
  } catch (error) {
    console.error('[oauth] Failed to parse MCP_OAUTH_STATIC_CLIENTS:', error.message)
    return []
  }
}

function setupMcpOAuth(app) {
  const enabled = process.env.MCP_OAUTH_ENABLED !== 'false'
  if (!enabled) {
    console.warn('[oauth] MCP OAuth disabled')
    return null
  }

  const issuerUrl = parseUrl(process.env.MCP_OAUTH_ISSUER_URL || DEFAULT_ISSUER)
  const resourceServerUrl = parseUrl(process.env.MCP_OAUTH_RESOURCE_SERVER_URL || DEFAULT_RESOURCE)
  const serviceDocsUrl = process.env.MCP_OAUTH_SERVICE_DOCS_URL
    ? parseUrl(process.env.MCP_OAUTH_SERVICE_DOCS_URL)
    : undefined
  const staticClients = loadStaticClients()
  const clientsFilePath =
    process.env.MCP_OAUTH_CLIENTS_PATH ||
    path.resolve(process.cwd(), 'mcp-oauth-clients.json')

  const provider = new VtopOAuthProvider({
    strictResource: process.env.MCP_OAUTH_STRICT_RESOURCE !== 'false',
    accessTokenTtlSeconds: parseInt(process.env.MCP_OAUTH_ACCESS_TOKEN_TTL || '3600', 10),
    refreshTokenTtlSeconds: parseInt(process.env.MCP_OAUTH_REFRESH_TOKEN_TTL || '1209600', 10),
    codeTtlSeconds: parseInt(process.env.MCP_OAUTH_CODE_TTL || '300', 10),
    consentTtlSeconds: parseInt(process.env.MCP_OAUTH_CONSENT_TTL || '300', 10),
    staticClients,
    clientsFilePath,
  })

  ;(async () => {
    const defaultClientId = process.env.MCP_OAUTH_DEFAULT_CLIENT_ID
    const defaultRedirectUri = process.env.MCP_OAUTH_DEFAULT_REDIRECT_URI
    if (!defaultClientId || !defaultRedirectUri) {
      return
    }
    try {
      const existing = await provider.clientsStore.getClient(defaultClientId)
      if (!existing) {
        const client = {
          client_id: defaultClientId,
          redirect_uris: [defaultRedirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          application_type: 'native',
        }
        await provider.clientsStore.registerClient(client)
        console.log('[oauth] Registered default client', defaultClientId)
      }
    } catch (error) {
      console.error('[oauth] Failed to ensure default client:', error)
    }
  })()

  const oauthRouter = express.Router()

  const sharedOptions = {
    provider,
    issuerUrl,
    baseUrl: issuerUrl,
    resourceServerUrl,
    scopesSupported: ['mcp:tools'],
    resourceName: 'Everything Assistant VTOP Proxy',
    serviceDocumentationUrl: serviceDocsUrl,
  }

  const oauthMetadata = createOAuthMetadata(sharedOptions)

  oauthRouter.post(
    '/consent',
    express.urlencoded({ extended: false }),
    async (req, res) => {
      try {
        const result = await provider.handleConsentSubmission(req.body || {})
        res.status(200).send(renderSuccessRedirectPage(result.redirectUrl))
      } catch (error) {
        console.error('[oauth] consent error:', error)
        if (error.redirectUrl) {
          res.redirect(302, error.redirectUrl)
          return
        }
        const status = error instanceof InvalidRequestError ? 400 : 500
        res.status(status).send(renderErrorPage(error.message || 'Failed to authorize client. Please restart the flow.'))
      }
    }
  )

  oauthRouter.get('/consent', (req, res) => {
    res.status(400).send(renderErrorPage('Consent session missing or expired. Restart the OAuth authorization flow.'))
  })

  const autoRegisterEnabled = process.env.MCP_OAUTH_AUTO_REGISTER === 'false' ? false : true

  const authorizeBodyParser = express.urlencoded({ extended: false })

  const autoRegisterMiddleware = async (req, res, next) => {
    if (!autoRegisterEnabled) return next()
    const isAuthorizePath = req.path === '/authorize' || req.path === '/oauth/authorize'
    const methodAllowed = req.method === 'GET' || req.method === 'POST'
    if (!isAuthorizePath || !methodAllowed) {
      return next()
    }

    const params = req.method === 'POST' ? req.body || {} : req.query || {}
    const clientId = params.client_id
    const redirectUri = params.redirect_uri
    if (!clientId || !redirectUri) {
      return next()
    }

    try {
      const existing = await provider.clientsStore.getClient(clientId)
      if (!existing) {
        const clientName = params.client_name || params.application_name
        const client = {
          client_id: clientId,
          client_name: clientName,
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          application_type: 'native',
        }
        await provider.clientsStore.registerClient(client)
        console.log('[oauth] Auto-registered client during /authorize:', clientId)
      }
    } catch (error) {
      console.error('[oauth] Failed auto-registering client:', error)
    }
    next()
  }

  app.use(['/authorize', '/oauth/authorize'], authorizeBodyParser)
  app.use('/oauth', oauthRouter)
  app.use('/oauth', autoRegisterMiddleware, mcpAuthRouter(sharedOptions))
  app.use('/', autoRegisterMiddleware, mcpAuthRouter(sharedOptions))

  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata,
      resourceServerUrl,
      scopesSupported: ['mcp:tools'],
      resourceName: 'Everything Assistant VTOP Proxy',
      serviceDocumentationUrl: serviceDocsUrl,
    })
  )

  const authMiddleware = requireBearerAuth({
    verifier: provider,
    requiredScopes: ['mcp:tools'],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceServerUrl),
  })

  console.log('[oauth] MCP OAuth enabled. Issuer:', issuerUrl.href)
  return {
    authMiddleware,
    provider,
  }
}

module.exports = {
  setupMcpOAuth,
}
