const express = require('express')
const {
  mcpAuthRouter,
  mcpAuthMetadataRouter,
  getOAuthProtectedResourceMetadataUrl,
  createOAuthMetadata,
} = require('@modelcontextprotocol/sdk/server/auth/router.js')
const { requireBearerAuth } = require('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js')
const { InvalidRequestError } = require('@modelcontextprotocol/sdk/server/auth/errors.js')
const { VtopOAuthProvider } = require('./provider')

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

function renderErrorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorization error</title>
    <style>
      body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { max-width: 420px; padding: 2rem; border-radius: 24px; background: rgba(15,23,42,0.92); border: 1px solid rgba(148,163,184,0.25); box-shadow: 0 20px 60px rgba(15,23,42,0.7); text-align: center; }
      h1 { margin-bottom: 0.5rem; font-size: 1.7rem; }
      p { color: #cbd5f5; line-height: 1.6; }
      a { color: #93c5fd; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Authorization failed</h1>
      <p>${message}</p>
      <p><a href="javascript:window.close()">Close this window</a></p>
    </div>
  </body>
</html>`
}

function renderSuccessRedirectPage(redirectUrl) {
  const safeUrl = redirectUrl.replace(/"/g, '&quot;')
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${safeUrl}" />
    <title>Completing authorization…</title>
    <style>
      body { font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #020617; color: #e2e8f0; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
      .card { text-align: center; padding: 2rem; border-radius: 24px; background: rgba(15,23,42,0.92); border: 1px solid rgba(99,102,241,0.2); box-shadow: 0 16px 45px rgba(2,6,23,0.7); width: min(420px, 90%); }
      .spinner { width: 48px; height: 48px; border: 4px solid rgba(148,163,184,0.2); border-top-color: #818cf8; border-radius: 50%; margin: 0 auto 1rem; animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      p { line-height: 1.6; }
      a { color: #93c5fd; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="spinner"></div>
      <h1>Completing authorization…</h1>
      <p>Hang tight! We&apos;re sending you back to your MCP client.</p>
      <p>If nothing happens, <a href="${safeUrl}">click here</a>.</p>
    </div>
    <script>
      setTimeout(() => {
        try {
          window.location.replace('${safeUrl}')
        } catch (error) {
          window.location.href = '${safeUrl}'
        }
      }, 100)
    </script>
  </body>
</html>`
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

  const provider = new VtopOAuthProvider({
    strictResource: process.env.MCP_OAUTH_STRICT_RESOURCE !== 'false',
    accessTokenTtlSeconds: parseInt(process.env.MCP_OAUTH_ACCESS_TOKEN_TTL || '3600', 10),
    refreshTokenTtlSeconds: parseInt(process.env.MCP_OAUTH_REFRESH_TOKEN_TTL || '1209600', 10),
    codeTtlSeconds: parseInt(process.env.MCP_OAUTH_CODE_TTL || '300', 10),
    consentTtlSeconds: parseInt(process.env.MCP_OAUTH_CONSENT_TTL || '300', 10),
  })

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

  app.use('/oauth', oauthRouter)
  app.use('/oauth', mcpAuthRouter(sharedOptions))
  app.use('/', mcpAuthRouter(sharedOptions))

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
