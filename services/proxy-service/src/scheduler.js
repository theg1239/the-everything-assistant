'use strict'

const { ProxyError } = require('./cli/errors')

/**
 * FIFO work queue with a global concurrency cap and a per-key (per VTOP user) cap.
 *
 * Per-user concurrency defaults to 1: VTOP sessions are per account, and parallel logins for the
 * same student race each other (and look like abuse to VTOP). Requests beyond the caps wait in
 * the queue instead of failing; a full queue or a long wait yields a retryable `busy` error.
 */
class Scheduler {
  constructor({ maxConcurrent, perKeyConcurrency, maxQueue, perKeyMaxQueue, queueTimeoutMs }) {
    this.maxConcurrent = maxConcurrent
    this.perKeyConcurrency = perKeyConcurrency
    this.maxQueue = maxQueue
    this.perKeyMaxQueue = perKeyMaxQueue
    this.queueTimeoutMs = queueTimeoutMs
    this.running = 0
    this.runningByKey = new Map()
    this.queue = []
    this.completed = 0
    this.rejected = 0
  }

  queuedFor(key) {
    return this.queue.reduce((count, item) => count + (item.key === key ? 1 : 0), 0)
  }

  /** Runs `task()` when capacity allows. Resolves with { value, queuedMs }. */
  schedule(key, task, { signal } = {}) {
    if (this.queue.length >= this.maxQueue || this.queuedFor(key) >= this.perKeyMaxQueue) {
      this.rejected++
      return Promise.reject(new ProxyError('busy', 'Too many queued VTOP requests; please retry shortly.'))
    }
    return new Promise((resolve, reject) => {
      const item = { key, task, resolve, reject, enqueuedAt: Date.now(), timer: null }
      item.timer = setTimeout(() => {
        this.remove(item)
        this.rejected++
        reject(new ProxyError('busy', 'Timed out waiting for a free VTOP worker; please retry.'))
      }, this.queueTimeoutMs)
      item.timer.unref()
      if (signal) {
        if (signal.aborted) {
          clearTimeout(item.timer)
          return reject(new ProxyError('busy', 'Request cancelled'))
        }
        signal.addEventListener(
          'abort',
          () => {
            if (this.remove(item)) reject(new ProxyError('busy', 'Request cancelled'))
          },
          { once: true }
        )
      }
      this.queue.push(item)
      this.pump()
    })
  }

  remove(item) {
    const index = this.queue.indexOf(item)
    if (index === -1) return false
    this.queue.splice(index, 1)
    clearTimeout(item.timer)
    return true
  }

  pump() {
    for (let i = 0; i < this.queue.length && this.running < this.maxConcurrent; ) {
      const item = this.queue[i]
      if ((this.runningByKey.get(item.key) || 0) >= this.perKeyConcurrency) {
        i++
        continue
      }
      this.queue.splice(i, 1)
      clearTimeout(item.timer)
      this.start(item)
    }
  }

  start(item) {
    this.running++
    this.runningByKey.set(item.key, (this.runningByKey.get(item.key) || 0) + 1)
    const queuedMs = Date.now() - item.enqueuedAt
    Promise.resolve()
      .then(() => item.task())
      .then(
        value => item.resolve({ value, queuedMs }),
        error => item.reject(error)
      )
      .finally(() => {
        this.running--
        const left = (this.runningByKey.get(item.key) || 1) - 1
        if (left <= 0) this.runningByKey.delete(item.key)
        else this.runningByKey.set(item.key, left)
        this.completed++
        this.pump()
      })
  }

  stats() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      perUserConcurrency: this.perKeyConcurrency,
      completed: this.completed,
      rejected: this.rejected,
    }
  }
}

module.exports = { Scheduler }
