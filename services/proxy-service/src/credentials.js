'use strict'

const CryptoJS = require('crypto-js')
const { ProxyError } = require('./cli/errors')

let warnedLegacy = false

function decryptLegacy(cipher, key) {
  try {
    const plain = CryptoJS.AES.decrypt(cipher, key).toString(CryptoJS.enc.Utf8)
    return plain || null
  } catch {
    return null
  }
}

/**
 * Resolves the VTOP password from a request body.
 *
 *  - Preferred: `{ username, password }` in plaintext over the authenticated HTTPS channel.
 *  - DEPRECATED (one release): `{ encryptedPassword, sessionKey }` or `encryptedPassword` in the
 *    `cipher:::key` form (CryptoJS AES passphrase mode), still sent by MCP OAuth tokens and older
 *    WhatsApp / hub callers. The "key" travels with the cipher, so this was never encryption in
 *    transit -- only TLS + the shared secret protect it.
 */
function resolvePassword({ password, encryptedPassword, sessionKey }, { logger } = {}) {
  if (typeof password === 'string' && password) return password
  if (typeof encryptedPassword === 'string' && encryptedPassword) {
    let cipher = encryptedPassword
    let key = sessionKey
    if (!key && cipher.includes(':::')) [cipher, key] = cipher.split(':::')
    if (typeof key === 'string' && key) {
      if (!warnedLegacy && logger) {
        warnedLegacy = true
        logger.warn('[credentials] DEPRECATED encryptedPassword/sessionKey payload received; send { username, password } instead')
      }
      const plain = decryptLegacy(cipher, key)
      if (plain) return plain
      throw new ProxyError('missing_credentials', 'Could not decrypt the supplied VTOP credentials.')
    }
  }
  throw new ProxyError('missing_credentials', 'Missing credentials: provide username and password.')
}

module.exports = { resolvePassword, decryptLegacy }
