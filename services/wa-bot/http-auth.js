// Shared-secret auth for the bot's /api/* routes. Callers send `Authorization: Bearer <secret>`.
const crypto = require('node:crypto')

const sha256 = value => crypto.createHash('sha256').update(String(value), 'utf8').digest()

/** Constant-time comparison; hashing first gives equal-length buffers whatever the input lengths. */
function secretsMatch(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string' || !expected || !provided) {
    return false
  }
  return crypto.timingSafeEqual(sha256(expected), sha256(provided))
}

function extractBearerToken(headerValue) {
  if (typeof headerValue !== 'string') return null
  const match = /^Bearer\s+(.+)$/iu.exec(headerValue.trim())
  return match ? match[1].trim() || null : null
}

/**
 * Fails closed: without the secret the service refuses to start. `<insecureVar>=1` opts out, and
 * only when NODE_ENV is not production.
 */
function resolveApiAuthConfig(env, { secretVar, insecureVar, serviceName }) {
  const secret = (env[secretVar] || '').trim()
  if (secret) return { mode: 'secret', secret }
  if (env[insecureVar] === '1' && env.NODE_ENV !== 'production') {
    return { mode: 'insecure-dev' }
  }
  throw new Error(
    `${secretVar} is not set. Refusing to start ${serviceName}: its /api/* routes would be open to ` +
      `anyone who can reach the port. Set ${secretVar} (e.g. \`openssl rand -hex 32\`) and send it as ` +
      `\`Authorization: Bearer <secret>\`, or for local development only set ${insecureVar}=1 ` +
      'with NODE_ENV != production.'
  )
}

function createApiAuthMiddleware(config) {
  return function requireApiSecret(req, res, next) {
    if (config.mode === 'insecure-dev') return next()
    if (secretsMatch(config.secret, extractBearerToken(req.get('authorization')))) return next()
    res.setHeader('WWW-Authenticate', 'Bearer')
    res.status(401).json({ error: 'Unauthorized' })
  }
}

/** Loopback unless HOST is configured (e.g. HOST=0.0.0.0 inside a container). */
function resolveBindHost(env) {
  return (env.HOST || '').trim() || '127.0.0.1'
}

module.exports = {
  createApiAuthMiddleware,
  extractBearerToken,
  resolveApiAuthConfig,
  resolveBindHost,
  secretsMatch,
}
