'use strict'

const { z } = require('zod')

const latestSchema = z
  .object({
    version: z.string().min(1),
    killSwitch: z.number().int().min(0).max(4),
  })
  .loose()

/**
 * cli-top's Execute() blocks on GET https://cli-top.acmvit.in/latest.json (5 s timeout) before
 * every command to read the kill switch -- a fresh TLS handshake per spawn (measured 110-520 ms).
 * cli-top honours CLI_TOP_LATEST_JSON_URL, so the proxy fetches the document periodically and
 * serves the cached copy to its own children over loopback. Kill-switch semantics are preserved:
 * whatever upstream says (including "decommissioned") is what the child sees, at most
 * `refreshMs` late. With no fresh-enough copy the override is dropped and the child fetches
 * upstream itself.
 */
class LatestJsonCache {
  constructor({ upstream, refreshMs, maxStaleMs, enabled, logger, fetchImpl = fetch }) {
    this.upstream = upstream
    this.refreshMs = refreshMs
    this.maxStaleMs = maxStaleMs
    this.enabled = enabled
    this.logger = logger
    this.fetchImpl = fetchImpl
    this.doc = null
    this.fetchedAt = 0
    this.lastError = null
    this.localUrl = null
    this.timer = null
  }

  setLocalUrl(url) {
    this.localUrl = url
  }

  async refresh() {
    try {
      const res = await this.fetchImpl(this.upstream, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const parsed = latestSchema.parse(await res.json())
      this.doc = parsed
      this.fetchedAt = Date.now()
      this.lastError = null
    } catch (error) {
      this.lastError = error.message
      this.logger.warn('[latest-json] refresh failed:', error.message)
    }
  }

  start() {
    if (!this.enabled) return Promise.resolve()
    this.timer = setInterval(() => void this.refresh(), this.refreshMs)
    this.timer.unref()
    return this.refresh()
  }

  stop() {
    clearInterval(this.timer)
  }

  fresh() {
    return Boolean(this.doc && Date.now() - this.fetchedAt <= this.maxStaleMs)
  }

  /** URL to hand to children, or null to let them fetch upstream themselves. */
  childUrl() {
    return this.enabled && this.localUrl && this.fresh() ? this.localUrl : null
  }

  status() {
    return {
      enabled: this.enabled,
      cached: this.fresh(),
      latestVersion: this.doc ? this.doc.version : null,
      killSwitch: this.doc ? this.doc.killSwitch : null,
      fetchedAt: this.fetchedAt ? new Date(this.fetchedAt).toISOString() : null,
      lastError: this.lastError,
    }
  }

  /** Express handler; only loopback callers (our own children) may read it. */
  handler() {
    return (req, res) => {
      const address = req.socket.remoteAddress || ''
      const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
      if (!loopback || !this.fresh()) return res.status(404).end()
      res.set('Cache-Control', 'no-store').json(this.doc)
    }
  }
}

module.exports = { LatestJsonCache }
