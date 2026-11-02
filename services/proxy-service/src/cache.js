'use strict'

/** Small LRU with per-entry TTL. Keys are opaque strings (already include the user hash). */
class TtlCache {
  constructor({ maxEntries = 5000 } = {}) {
    this.maxEntries = maxEntries
    this.map = new Map()
    this.hits = 0
    this.misses = 0
  }

  get(key) {
    const entry = this.map.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key)
      this.misses++
      return undefined
    }
    this.map.delete(key)
    this.map.set(key, entry)
    this.hits++
    return entry
  }

  set(key, value, ttlMs, tag) {
    if (ttlMs <= 0) return
    this.map.delete(key)
    this.map.set(key, { value, storedAt: Date.now(), expiresAt: Date.now() + ttlMs, tag })
    while (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value)
  }

  /** Drop every entry carrying `tag` (used to invalidate one user's reads after a write). */
  invalidateTag(tag) {
    let removed = 0
    for (const [key, entry] of this.map) {
      if (entry.tag === tag) {
        this.map.delete(key)
        removed++
      }
    }
    return removed
  }

  stats() {
    return { entries: this.map.size, hits: this.hits, misses: this.misses }
  }
}

/** Collapses concurrent identical work onto one promise. */
class SingleFlight {
  constructor() {
    this.inflight = new Map()
    this.shared = 0
  }

  run(key, fn) {
    const existing = this.inflight.get(key)
    if (existing) {
      this.shared++
      return existing.then(value => ({ ...value, shared: true }))
    }
    const promise = Promise.resolve()
      .then(fn)
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, promise)
    return promise
  }

  stats() {
    return { inflight: this.inflight.size, shared: this.shared }
  }
}

module.exports = { TtlCache, SingleFlight }
