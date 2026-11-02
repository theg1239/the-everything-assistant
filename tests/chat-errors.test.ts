import assert from 'node:assert/strict'
import test from 'node:test'
import { APICallError, RetryError, TypeValidationError } from 'ai'
import {
  classifyChatError,
  parseChatErrorBody,
  providerRateLimitOf,
  retryAfterResetTime,
} from '../lib/chat-errors'

const httpError = (statusCode: number, body: unknown, responseHeaders?: Record<string, string>) =>
  new APICallError({
    message: typeof body === 'string' ? body : JSON.stringify(body),
    url: '/api/chat',
    requestBodyValues: undefined,
    statusCode,
    responseHeaders,
    responseBody: typeof body === 'string' ? body : JSON.stringify(body),
  })

test('parseChatErrorBody reads our JSON error bodies and ignores anything else', () => {
  assert.deepEqual(parseChatErrorBody('{"error":"GUEST_LIMIT","message":"m"}'), {
    error: 'GUEST_LIMIT',
    message: 'm',
  })
  assert.equal(parseChatErrorBody('rate limit exceeded'), null)
  assert.equal(parseChatErrorBody(undefined), null)
  assert.equal(parseChatErrorBody('{"type":"something_else"}'), null)
})

test('classifyChatError: guest limit comes from the structured body, not the wording', () => {
  assert.deepEqual(classifyChatError(httpError(403, { error: 'GUEST_LIMIT', message: 'x' })), {
    kind: 'guest_limit',
    message: 'x',
  })
  // Prose that merely mentions a guest limit is not a guest-limit error.
  assert.deepEqual(classifyChatError(new Error('guest limit reached')), { kind: 'other' })
})

test('classifyChatError: rate limits by status / body type, with reset time', () => {
  assert.deepEqual(
    classifyChatError(
      httpError(429, {
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'slow down',
        type: 'user_rate_limit',
        resetTime: 1_800_000_000_000,
      })
    ),
    { kind: 'rate_limit', scope: 'user', message: 'slow down', resetTime: 1_800_000_000_000 }
  )
  assert.deepEqual(classifyChatError(httpError(429, 'Too Many Requests')), {
    kind: 'rate_limit',
    scope: 'model',
    message: undefined,
    resetTime: undefined,
  })
  // Error-like objects (unhandled rejections) are read by their fields too.
  assert.equal(classifyChatError({ status: 429 }).kind, 'rate_limit')
  // Wording alone never classifies.
  assert.deepEqual(classifyChatError(new Error('rate limit exceeded, too many requests')), {
    kind: 'other',
  })
  assert.deepEqual(classifyChatError(httpError(500, { error: 'boom' })), { kind: 'other' })
})

test('classifyChatError: an unvalidated abort chunk is a transient stream abort', () => {
  const abort = new TypeValidationError({ value: { type: 'abort', reason: 'x' }, cause: null })
  assert.deepEqual(classifyChatError(abort), { kind: 'stream_abort' })
  const other = new TypeValidationError({ value: { type: 'text-delta' }, cause: null })
  assert.deepEqual(classifyChatError(other), { kind: 'other' })
})

test('providerRateLimitOf unwraps retry errors and checks the status code', () => {
  const limited = httpError(429, 'quota')
  assert.equal(providerRateLimitOf(limited), limited)
  const retry = new RetryError({
    message: 'retries',
    reason: 'maxRetriesExceeded',
    errors: [limited],
  })
  assert.equal(providerRateLimitOf(retry), limited)
  assert.equal(providerRateLimitOf(httpError(500, 'rate limit')), null)
  assert.equal(providerRateLimitOf(new Error('rate limit')), null)
})

test('retryAfterResetTime reads delta-seconds and HTTP-date Retry-After headers', () => {
  const now = 1_000_000
  assert.equal(retryAfterResetTime(httpError(429, '', { 'retry-after': '30' }), now), now + 30_000)
  const date = 'Wed, 21 Oct 2015 07:28:00 GMT'
  assert.equal(
    retryAfterResetTime(httpError(429, '', { 'Retry-After': date }), now),
    Date.parse(date)
  )
  assert.equal(retryAfterResetTime(httpError(429, ''), now), undefined)
})
