import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { generateSync, createGuardrails } from 'otplib'
import { generateTOTPSecret, matchTOTP } from '../lib/mfa'
import {
  DEFAULT_SESSION_TTL_SECONDS,
  EMAIL_CODE_RESEND_COOLDOWN_MS,
  EMAIL_CODE_SEND_LIMIT,
  EMAIL_CODE_TTL_SECONDS,
  MFA_STEP_UP_MAX_AGE_MS,
  VERIFICATION_ATTEMPT_LIMITS,
  claimTotpTimeStep,
  clearSessionVerification,
  consumeEmailLoginCode,
  consumeVerificationAttempt,
  createMemoryMfaKv,
  hashSessionToken,
  isStepUpFresh,
  issueEmailLoginCode,
  readSessionVerification,
  readSessionVerificationOrNull,
  recordSessionVerification,
  resetVerificationAttempts,
  storeWebAuthnChallenge,
  takeWebAuthnChallenge,
  type MfaKv,
} from '../lib/mfa-state'

/** An in-memory Redis stand-in with a controllable clock, injected into the MFA state code. */
function fakeStore(start = 1_800_000_000_000) {
  let now = start
  const kv = createMemoryMfaKv(() => now)
  return {
    kv,
    now: () => now,
    advance(ms: number) {
      now += ms
    },
  }
}

const USER = 'user-1'
const OTHER_USER = 'user-2'

/* Session verification ----------------------------------------------------------------------- */

test('a session is unverified until a verification is recorded for it', async () => {
  const { kv, now } = fakeStore()
  const token = hashSessionToken('session-token-a')

  assert.equal(await readSessionVerification(kv, token, USER), null)

  await recordSessionVerification(kv, token, { userId: USER, factor: 'authenticator', now: now() })
  assert.deepEqual(await readSessionVerification(kv, token, USER), {
    userId: USER,
    verifiedAt: now(),
    factor: 'authenticator',
  })

  // Bound to the session token: another session of the same user is still unverified.
  const otherToken = hashSessionToken('session-token-b')
  assert.equal(await readSessionVerification(kv, otherToken, USER), null)
  // And to the user: a record is never accepted for someone else.
  assert.equal(await readSessionVerification(kv, token, OTHER_USER), null)
})

test('session tokens are hashed, never used raw as keys', () => {
  const hash = hashSessionToken('raw-token')
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.notEqual(hash, 'raw-token')
  assert.equal(hash, hashSessionToken('raw-token'))
})

test('the verification record expires with the session', async () => {
  const { kv, now, advance } = fakeStore()
  const token = hashSessionToken('expiring')
  const sessionExpiresAt = now() + 60 * 60 * 1000

  await recordSessionVerification(kv, token, {
    userId: USER,
    factor: 'email',
    now: now(),
    sessionExpiresAt,
  })
  advance(60 * 60 * 1000 - 1)
  assert.notEqual(await readSessionVerification(kv, token, USER), null)
  advance(1)
  assert.equal(await readSessionVerification(kv, token, USER), null)
})

test('without a known session expiry the record lasts the default session lifetime', async () => {
  const { kv, now, advance } = fakeStore()
  const token = hashSessionToken('no-expiry')
  await recordSessionVerification(kv, token, { userId: USER, factor: 'backup_code', now: now() })
  advance(DEFAULT_SESSION_TTL_SECONDS * 1000 - 1)
  assert.notEqual(await readSessionVerification(kv, token, USER), null)
  advance(1)
  assert.equal(await readSessionVerification(kv, token, USER), null)
})

test('clearing a session (sign-out) removes its verification', async () => {
  const { kv, now } = fakeStore()
  const token = hashSessionToken('signing-out')
  await recordSessionVerification(kv, token, { userId: USER, factor: 'security_key', now: now() })
  await clearSessionVerification(kv, token)
  assert.equal(await readSessionVerification(kv, token, USER), null)
})

test('fail closed: no store, no token, a store error or a corrupt record all read as unverified', async () => {
  const { kv, now } = fakeStore()
  const token = hashSessionToken('fail-closed')
  await recordSessionVerification(kv, token, { userId: USER, factor: 'authenticator', now: now() })

  assert.equal(await readSessionVerificationOrNull(null, token, USER), null)
  assert.equal(await readSessionVerificationOrNull(kv, null, USER), null)

  const broken: MfaKv = {
    ...kv,
    get: async () => {
      throw new Error('redis down')
    },
  }
  const consoleError = mock.method(console, 'error', () => {})
  try {
    assert.equal(await readSessionVerificationOrNull(broken, token, USER), null)
    assert.equal(consoleError.mock.callCount(), 1, 'the failure is logged')
  } finally {
    consoleError.mock.restore()
  }

  const corrupt: MfaKv = { ...kv, get: async () => '{"userId":"user-1","verifiedAt":"soon"}' }
  assert.equal(await readSessionVerificationOrNull(corrupt, token, USER), null)
  const notJson: MfaKv = { ...kv, get: async () => 'not json' }
  assert.equal(await readSessionVerificationOrNull(notJson, token, USER), null)

  assert.notEqual(await readSessionVerificationOrNull(kv, token, USER), null)
})

/* Step-up freshness -------------------------------------------------------------------------- */

test('step-up requires a verification from the last 10 minutes', () => {
  const verifiedAt = 1_800_000_000_000
  const verification = { userId: USER, verifiedAt, factor: 'authenticator' as const }

  assert.equal(MFA_STEP_UP_MAX_AGE_MS, 10 * 60 * 1000)
  assert.equal(isStepUpFresh(verification, verifiedAt), true)
  assert.equal(isStepUpFresh(verification, verifiedAt + MFA_STEP_UP_MAX_AGE_MS), true)
  assert.equal(isStepUpFresh(verification, verifiedAt + MFA_STEP_UP_MAX_AGE_MS + 1), false)
  assert.equal(isStepUpFresh(null, verifiedAt), false)
  // A record from the "future" (clock skew / tampering) is not trusted.
  assert.equal(isStepUpFresh(verification, verifiedAt - 1), false)
})

test('re-verifying refreshes step-up freshness', async () => {
  const { kv, now, advance } = fakeStore()
  const token = hashSessionToken('step-up')
  await recordSessionVerification(kv, token, { userId: USER, factor: 'authenticator', now: now() })

  advance(MFA_STEP_UP_MAX_AGE_MS + 1)
  assert.equal(isStepUpFresh(await readSessionVerification(kv, token, USER), now()), false)

  await recordSessionVerification(kv, token, { userId: USER, factor: 'backup_code', now: now() })
  assert.equal(isStepUpFresh(await readSessionVerification(kv, token, USER), now()), true)
})

/* TOTP replay -------------------------------------------------------------------------------- */

test('a TOTP time step is accepted once; replays and older steps are rejected', async () => {
  const { kv } = fakeStore()
  const secret = generateTOTPSecret()

  assert.equal(await claimTotpTimeStep(kv, { userId: USER, secret, timeStep: 100 }), true)
  assert.equal(await claimTotpTimeStep(kv, { userId: USER, secret, timeStep: 100 }), false)
  assert.equal(await claimTotpTimeStep(kv, { userId: USER, secret, timeStep: 99 }), false)
  assert.equal(await claimTotpTimeStep(kv, { userId: USER, secret, timeStep: 101 }), true)
  assert.equal(await claimTotpTimeStep(kv, { userId: USER, secret, timeStep: 101 }), false)

  // Scoped per user and per secret.
  assert.equal(await claimTotpTimeStep(kv, { userId: OTHER_USER, secret, timeStep: 100 }), true)
  const newSecret = generateTOTPSecret()
  assert.equal(
    await claimTotpTimeStep(kv, { userId: USER, secret: newSecret, timeStep: 100 }),
    true
  )
})

test('concurrent submissions of the same TOTP code: exactly one wins', async () => {
  const { kv } = fakeStore()
  const secret = generateTOTPSecret()
  const results = await Promise.all(
    Array.from({ length: 5 }, () => claimTotpTimeStep(kv, { userId: USER, secret, timeStep: 7 }))
  )
  assert.equal(results.filter(Boolean).length, 1)
})

test('end to end: a valid TOTP code verifies once and its replay is rejected', async () => {
  const { kv } = fakeStore()
  const secret = generateTOTPSecret()
  const nowSeconds = 1_800_000_015
  const code = generateSync({
    secret,
    epoch: nowSeconds,
    period: 30,
    guardrails: createGuardrails({ MIN_SECRET_BYTES: 10 }),
  })

  mock.timers.enable({ apis: ['Date'], now: nowSeconds * 1000 })
  try {
    const first = matchTOTP(code, secret)
    assert.ok(first, 'code should match')
    assert.equal(
      await claimTotpTimeStep(kv, { userId: USER, secret, timeStep: first.timeStep }),
      true
    )

    const replay = matchTOTP(code, secret)
    assert.ok(replay, 'the code itself is still mathematically valid')
    assert.equal(
      await claimTotpTimeStep(kv, { userId: USER, secret, timeStep: replay.timeStep }),
      false,
      'but the replay is rejected'
    )
  } finally {
    mock.timers.reset()
  }
})

/* Attempt limiting --------------------------------------------------------------------------- */

test('verification attempts are limited per user+IP within the window', async () => {
  const { kv, advance } = fakeStore()
  const { max, windowSeconds } = VERIFICATION_ATTEMPT_LIMITS.perUserAndIp
  const input = { userId: USER, ip: '203.0.113.1' }

  for (let i = 0; i < max; i++) {
    assert.equal(await consumeVerificationAttempt(kv, input), true, `attempt ${i + 1}`)
  }
  assert.equal(await consumeVerificationAttempt(kv, input), false)
  // Other users are unaffected.
  assert.equal(await consumeVerificationAttempt(kv, { ...input, userId: OTHER_USER }), true)

  advance(windowSeconds * 1000)
  assert.equal(await consumeVerificationAttempt(kv, input), true, 'window resets')
})

test('a per-user ceiling applies across IPs', async () => {
  const { kv } = fakeStore()
  const { max } = VERIFICATION_ATTEMPT_LIMITS.perUser
  let allowed = 0
  for (let i = 0; i < max + 10; i++) {
    // A fresh IP each time, so only the per-user limit can bite.
    if (await consumeVerificationAttempt(kv, { userId: USER, ip: `198.51.100.${i}` })) allowed++
  }
  assert.equal(allowed, max)
})

test('parallel attempts cannot race past the limit', async () => {
  const { kv } = fakeStore()
  const input = { userId: USER, ip: '203.0.113.9' }
  const results = await Promise.all(
    Array.from({ length: 20 }, () => consumeVerificationAttempt(kv, input))
  )
  assert.equal(results.filter(Boolean).length, VERIFICATION_ATTEMPT_LIMITS.perUserAndIp.max)
})

test('a successful verification resets the user+IP counter but not the per-user ceiling', async () => {
  const { kv } = fakeStore()
  const input = { userId: USER, ip: '203.0.113.2' }
  for (let i = 0; i < VERIFICATION_ATTEMPT_LIMITS.perUserAndIp.max; i++) {
    await consumeVerificationAttempt(kv, input)
  }
  assert.equal(await consumeVerificationAttempt(kv, input), false)
  await resetVerificationAttempts(kv, input)
  assert.equal(await consumeVerificationAttempt(kv, input), true)

  // Keep resetting: the per-user ceiling still stops unlimited guessing.
  let allowed = 0
  for (let i = 0; i < VERIFICATION_ATTEMPT_LIMITS.perUser.max * 2; i++) {
    if (await consumeVerificationAttempt(kv, input)) allowed++
    await resetVerificationAttempts(kv, input)
  }
  assert.ok(allowed < VERIFICATION_ATTEMPT_LIMITS.perUser.max)
})

/* Emailed codes ------------------------------------------------------------------------------ */

test('emailed codes are single use', async () => {
  const { kv, now } = fakeStore()
  assert.equal(
    await issueEmailLoginCode(kv, { userId: USER, codeHash: 'aa11', now: now() }),
    'issued'
  )

  assert.equal(await consumeEmailLoginCode(kv, { userId: USER, codeHash: 'bb22' }), false)
  assert.equal(
    await consumeEmailLoginCode(kv, { userId: USER, codeHash: 'aa11' }),
    true,
    'a wrong guess does not burn the code'
  )
  assert.equal(await consumeEmailLoginCode(kv, { userId: USER, codeHash: 'aa11' }), false)
})

test('parallel redemption of an emailed code: exactly one wins', async () => {
  const { kv, now } = fakeStore()
  await issueEmailLoginCode(kv, { userId: USER, codeHash: 'cc33', now: now() })
  const results = await Promise.all(
    Array.from({ length: 5 }, () => consumeEmailLoginCode(kv, { userId: USER, codeHash: 'cc33' }))
  )
  assert.equal(results.filter(Boolean).length, 1)
})

test('emailed codes expire, enforce a resend cooldown and a send limit', async () => {
  const { kv, now, advance } = fakeStore()
  assert.equal(
    await issueEmailLoginCode(kv, { userId: USER, codeHash: 'dd44', now: now() }),
    'issued'
  )
  assert.equal(
    await issueEmailLoginCode(kv, { userId: USER, codeHash: 'ee55', now: now() }),
    'cooldown'
  )

  advance(EMAIL_CODE_TTL_SECONDS * 1000)
  assert.equal(
    await consumeEmailLoginCode(kv, { userId: USER, codeHash: 'dd44' }),
    false,
    'expired'
  )

  const { kv: kv2, now: now2, advance: advance2 } = fakeStore()
  const outcomes = []
  for (let i = 0; i < EMAIL_CODE_SEND_LIMIT.max + 1; i++) {
    outcomes.push(
      await issueEmailLoginCode(kv2, { userId: USER, codeHash: `ff0${i}`, now: now2() })
    )
    advance2(EMAIL_CODE_RESEND_COOLDOWN_MS)
  }
  assert.equal(outcomes.filter(outcome => outcome === 'issued').length, EMAIL_CODE_SEND_LIMIT.max)
  assert.equal(outcomes.at(-1), 'rate_limited')

  // A newer code replaces the previous one.
  const { kv: kv3, now: now3, advance: advance3 } = fakeStore()
  await issueEmailLoginCode(kv3, { userId: USER, codeHash: 'a0a0', now: now3() })
  advance3(EMAIL_CODE_RESEND_COOLDOWN_MS)
  await issueEmailLoginCode(kv3, { userId: USER, codeHash: 'b0b0', now: now3() })
  assert.equal(await consumeEmailLoginCode(kv3, { userId: USER, codeHash: 'a0a0' }), false)
  assert.equal(await consumeEmailLoginCode(kv3, { userId: USER, codeHash: 'b0b0' }), true)
})

/* WebAuthn challenges ------------------------------------------------------------------------ */

test('WebAuthn assertion challenges are per session, per user and single use', async () => {
  const { kv } = fakeStore()
  const token = hashSessionToken('webauthn-session')
  await storeWebAuthnChallenge(kv, token, { userId: USER, challenge: 'challenge-1' })

  assert.equal(await takeWebAuthnChallenge(kv, hashSessionToken('other'), USER), null)
  assert.equal(await takeWebAuthnChallenge(kv, token, OTHER_USER), null)
  assert.equal(await takeWebAuthnChallenge(kv, token, USER), 'challenge-1')
  assert.equal(await takeWebAuthnChallenge(kv, token, USER), null)
})
