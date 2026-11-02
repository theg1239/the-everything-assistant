'use strict'

const crypto = require('crypto')
const zlib = require('zlib')
const { ProxyError } = require('../cli/errors')

const VERSION = 'v1'

function deriveKey(secret, info) {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), Buffer.from(info), 32))
}

/**
 * Opaque continuation tokens for multi-step workflows.
 *
 * Payload = the accumulated, already-validated flags + which step is pending (and its option ids) + the
 * user it belongs to (as an HMAC tag, never the password). Sealed with AES-256-GCM so it is
 * confidential (leave reasons etc. stay private) and tamper-proof, deflated to stay short, and
 * stamped with an expiry. Any instance sharing PROXY_TOKEN_SECRET can resume it, which is what
 * makes the workflow survive restarts and scale horizontally.
 */
class TokenSealer {
  constructor({ secret, ttlSeconds }) {
    this.key = deriveKey(secret, 'vtop-proxy/continuation/v1')
    this.userKey = deriveKey(secret, 'vtop-proxy/user-tag/v1')
    this.ttlMs = ttlSeconds * 1000
  }

  userTag(username) {
    return crypto
      .createHmac('sha256', this.userKey)
      .update(String(username).trim().toLowerCase())
      .digest('base64url')
      .slice(0, 22)
  }

  seal(payload) {
    const body = { ...payload, exp: Date.now() + this.ttlMs, jti: crypto.randomBytes(9).toString('base64url') }
    const plain = zlib.deflateRawSync(Buffer.from(JSON.stringify(body)))
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv)
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
    const tag = cipher.getAuthTag()
    return { token: `${VERSION}.${Buffer.concat([iv, encrypted, tag]).toString('base64url')}`, jti: body.jti, exp: body.exp }
  }

  open(token, username) {
    if (typeof token !== 'string' || !token.startsWith(`${VERSION}.`) || token.length > 8192) {
      throw new ProxyError('token_invalid')
    }
    let body
    try {
      const raw = Buffer.from(token.slice(VERSION.length + 1), 'base64url')
      if (raw.length < 12 + 16 + 1) throw new Error('short')
      const iv = raw.subarray(0, 12)
      const tag = raw.subarray(raw.length - 16)
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv)
      decipher.setAuthTag(tag)
      const plain = Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()])
      body = JSON.parse(zlib.inflateRawSync(plain).toString('utf8'))
    } catch {
      throw new ProxyError('token_invalid')
    }
    if (!body || typeof body.exp !== 'number' || body.exp < Date.now()) {
      throw new ProxyError('token_invalid', 'This step has expired. Please start the request again.')
    }
    if (username !== undefined && username !== null && body.u !== this.userTag(username)) {
      throw new ProxyError('token_invalid', 'This step belongs to a different VTOP account.')
    }
    return body
  }
}

module.exports = { TokenSealer, deriveKey }
