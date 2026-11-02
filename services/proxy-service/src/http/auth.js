'use strict'

const crypto = require('crypto')
const { kindInfo } = require('../cli/errors')

const digest = value => crypto.createHash('sha256').update(String(value)).digest()

function presentedKey(req) {
  const header = req.get('authorization') || ''
  const bearer = header.match(/^Bearer\s+(.+)$/i)
  if (bearer) return bearer[1].trim()
  return (req.get('x-proxy-key') || '').trim()
}

/**
 * Shared-secret authentication for the proxy HTTP API (`Authorization: Bearer <PROXY_API_KEY>`
 * or `X-Proxy-Key`). Fails closed: without a configured key every protected route answers 503,
 * unless PROXY_AUTH_DISABLED=true outside production.
 */
function requireApiKey(config) {
  const expected = config.apiKey ? digest(config.apiKey) : null
  return (req, res, next) => {
    if (config.authDisabled) return next()
    if (!expected) {
      const info = kindInfo('auth_not_configured')
      return res.status(info.status).json({ success: false, error: info.message, errorKind: 'auth_not_configured' })
    }
    const provided = presentedKey(req)
    if (!provided || !crypto.timingSafeEqual(digest(provided), expected)) {
      const info = kindInfo('unauthorized')
      res.set('WWW-Authenticate', 'Bearer realm="vtop-proxy"')
      return res.status(info.status).json({ success: false, error: info.message, errorKind: 'unauthorized' })
    }
    return next()
  }
}

module.exports = { requireApiKey }
