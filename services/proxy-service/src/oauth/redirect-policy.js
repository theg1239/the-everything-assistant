'use strict'

/**
 * Redirect-URI policy for OAuth clients.
 *
 * - Always rejected: non-URLs, URLs with credentials or fragments, and dangerous schemes
 *   (javascript:, data:, file:, vbscript:, blob:, about:).
 * - Plain http is only accepted for loopback hosts (native/desktop MCP clients).
 * - When an allow-list is configured (MCP_OAUTH_REDIRECT_ALLOWLIST), the redirect must match
 *   one of its entries:
 *     "example.com"        exact host (any https port)
 *     "*.example.com"      any subdomain of example.com (not the apex)
 *     "cursor:"            a custom URL scheme (native apps)
 *     "http://localhost"   loopback (any port)
 */

const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:'])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function parseAllowlist(raw) {
  if (!raw) return []
  return String(raw)
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean)
}

function describeRedirect(uri) {
  try {
    const url = new URL(uri)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return String(uri)
  }
}

/** Returns null when allowed, otherwise a human-readable reason. */
function checkRedirectUri(uri, allowlist = []) {
  let url
  try {
    url = new URL(String(uri))
  } catch {
    return 'redirect_uri is not a valid absolute URL'
  }
  const scheme = url.protocol.toLowerCase()
  if (BLOCKED_SCHEMES.has(scheme)) return `redirect_uri scheme ${scheme} is not allowed`
  if (url.username || url.password) return 'redirect_uri must not contain credentials'
  if (url.hash) return 'redirect_uri must not contain a fragment'
  const host = url.hostname.toLowerCase()
  const isLoopback = LOOPBACK_HOSTS.has(host) || LOOPBACK_HOSTS.has(`[${host}]`)
  if (scheme === 'http:' && !isLoopback) return 'plain http redirect_uris are only allowed for loopback hosts'

  if (!allowlist.length) return null

  const matches = allowlist.some(entry => {
    if (/^[a-z][a-z0-9+.-]*:$/.test(entry)) return scheme === entry && scheme !== 'http:' && scheme !== 'https:'
    if (entry.startsWith('http://')) {
      try {
        const allowed = new URL(entry)
        return scheme === 'http:' && host === allowed.hostname.toLowerCase()
      } catch {
        return false
      }
    }
    if (scheme !== 'https:') return false
    if (entry.startsWith('*.')) return host.endsWith(entry.slice(1)) && host !== entry.slice(2)
    return host === entry
  })
  return matches ? null : `redirect_uri ${describeRedirect(uri)} is not on the allow-list`
}

module.exports = { checkRedirectUri, parseAllowlist, describeRedirect }
