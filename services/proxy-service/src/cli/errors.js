'use strict'

/**
 * Error taxonomy. cli-top proxy mode only reports a handful of `error.kind`s (auth_failed,
 * selection_required, execution_error, partial_failure, invalid_flags, encoding_error); the
 * human text it prints around them is what distinguishes "wrong password" from "VTOP is down".
 */
const KINDS = {
  missing_credentials: { status: 400, requiresCredentials: true, message: 'VTOP username and password are required.' },
  invalid_credentials: { status: 401, requiresCredentials: true, message: 'VTOP rejected the username or password.' },
  login_failed: {
    status: 401,
    requiresCredentials: true,
    message: 'VTOP did not accept the login. Check your credentials; VTOP may also be having trouble right now.',
  },
  account_locked: {
    status: 423,
    message: 'VTOP locked this account after too many failed logins. Reset the password on VTOP, then update it here.',
  },
  captcha_failed: { status: 503, retryable: true, message: 'VTOP login captcha could not be solved. Please try again.' },
  vtop_unavailable: { status: 503, retryable: true, message: 'VTOP is unreachable or not responding right now.' },
  invalid_input: { status: 400, message: 'The request is invalid.' },
  conflict: { status: 409, message: 'VTOP refused the request because it conflicts with an existing one.' },
  not_found: { status: 404, message: 'VTOP has nothing matching this request.' },
  rate_limited: { status: 429, retryable: true, message: 'Too many VTOP requests. Please wait a few minutes.' },
  unsupported_command: { status: 400, message: 'This VTOP command is not supported.' },
  timeout: { status: 504, retryable: true, message: 'VTOP took too long to respond.' },
  busy: { status: 503, retryable: true, message: 'The VTOP proxy is busy. Please retry shortly.' },
  cli_unavailable: { status: 503, message: 'The VTOP client is unavailable on this server.' },
  cli_crashed: { status: 502, retryable: true, message: 'The VTOP client crashed while handling the request.' },
  protocol_error: { status: 502, message: 'The VTOP client returned an unreadable response.' },
  execution_error: { status: 502, message: 'VTOP returned an error.' },
  token_invalid: { status: 400, message: 'This step has expired or is invalid. Please start the request again.' },
  unauthorized: { status: 401, message: 'Missing or invalid proxy credentials.' },
  auth_not_configured: { status: 503, message: 'Proxy authentication is not configured.' },
  internal_error: { status: 500, message: 'Unexpected proxy error.' },
}

class ProxyError extends Error {
  constructor(kind, message, extra = {}) {
    super(message || (KINDS[kind] || KINDS.internal_error).message)
    this.name = 'ProxyError'
    this.kind = KINDS[kind] ? kind : 'internal_error'
    Object.assign(this, extra)
  }
}

function kindInfo(kind) {
  const info = KINDS[kind] || KINDS.internal_error
  return {
    status: info.status,
    retryable: Boolean(info.retryable),
    requiresCredentials: Boolean(info.requiresCredentials),
    message: info.message,
  }
}

const NETWORK_PATTERN =
  /(dial tcp|i\/o timeout|connection (refused|reset)|no such host|unexpected EOF|\bEOF\b|TLS handshake|context deadline exceeded|Client\.Timeout|server misbehaving|network is unreachable|Session Timed Out|status 5\d\d|50[234] (Bad Gateway|Service Unavailable|Gateway Timeout))/i

function classifyAuthFailure(message, preamble) {
  const text = `${preamble || ''}\n${message || ''}`
  if (/missing VTOP credentials/i.test(message)) return 'missing_credentials'
  if (/Maximum Fail Attempts/i.test(text)) return 'account_locked'
  if (/Invalid (LoginId|Username)\/Password|Invalid Credentials/i.test(text)) return 'invalid_credentials'
  if (/Captcha could not be solved/i.test(text)) return 'captcha_failed'
  if (/invalid VTOP credentials/i.test(message)) return 'login_failed'
  return 'vtop_unavailable'
}

function classifyExecutionError(message) {
  const text = String(message || '')
  if (/unsupported proxy command/i.test(text)) return 'unsupported_command'
  if (/rate limit exceeded/i.test(text)) return 'rate_limited'
  if (/already pending|already registered|full or unavailable/i.test(text)) return 'conflict'
  if (/^(missing|invalid) --|must be|cannot contain|must contain|use YYYY-MM-DD|use a time like/i.test(text)) {
    return 'invalid_input'
  }
  if (NETWORK_PATTERN.test(text)) return 'vtop_unavailable'
  if (/no material uploaded|not found|no [a-z ]+ found|no question papers|nothing to/i.test(text)) return 'not_found'
  return 'execution_error'
}

module.exports = { KINDS, ProxyError, kindInfo, classifyAuthFailure, classifyExecutionError, NETWORK_PATTERN }
