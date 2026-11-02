import assert from 'node:assert/strict'
import test from 'node:test'
import {
  consumeGuestQuota,
  createGuestId,
  createMemoryGuestQuotaStore,
  getClientIp,
  loadGuestQuotaConfig,
  signGuestId,
  verifyGuestCookie,
  type GuestQuotaConfig,
} from '../lib/guest-quota'

const config: GuestQuotaConfig = { perGuestLimit: 2, perIpLimit: 3, windowSeconds: 60 }

test('guest quota allows exactly the per-guest limit, then denies', async () => {
  const store = createMemoryGuestQuotaStore()
  const identity = { guestId: 'guest-a', ip: '203.0.113.9' }
  assert.equal((await consumeGuestQuota(store, identity, config)).allowed, true)
  assert.equal((await consumeGuestQuota(store, identity, config)).allowed, true)
  assert.deepEqual(await consumeGuestQuota(store, identity, config), {
    allowed: false,
    reason: 'guest',
  })
})

test('guest quota caps an IP across fresh guest ids (cookie clearing)', async () => {
  const store = createMemoryGuestQuotaStore()
  const ip = '198.51.100.7'
  const results = []
  for (let i = 0; i < 4; i++) {
    results.push(await consumeGuestQuota(store, { guestId: `fresh-${i}`, ip }, config))
  }
  assert.deepEqual(
    results.map(r => r.allowed),
    [true, true, true, false]
  )
  assert.deepEqual(results[3], { allowed: false, reason: 'ip' })
})

test('guest-capped requests do not consume the shared IP budget', async () => {
  const store = createMemoryGuestQuotaStore()
  const ip = '198.51.100.8'
  for (let i = 0; i < 5; i++) await consumeGuestQuota(store, { guestId: 'spammer', ip }, config)
  // spammer used 2 IP slots; a different browser on the same NAT still gets in.
  assert.equal((await consumeGuestQuota(store, { guestId: 'neighbour', ip }, config)).allowed, true)
})

test('unknown IPs share one bucket instead of bypassing the IP cap', async () => {
  const store = createMemoryGuestQuotaStore()
  const results = []
  for (let i = 0; i < 4; i++) {
    results.push((await consumeGuestQuota(store, { guestId: `g${i}`, ip: null }, config)).allowed)
  }
  assert.deepEqual(results, [true, true, true, false])
})

test('guest quota window expires', async () => {
  let now = 1_000_000
  const store = createMemoryGuestQuotaStore(() => now)
  const identity = { guestId: 'guest-b', ip: '203.0.113.10' }
  await consumeGuestQuota(store, identity, config)
  await consumeGuestQuota(store, identity, config)
  assert.equal((await consumeGuestQuota(store, identity, config)).allowed, false)
  now += 61_000
  assert.equal((await consumeGuestQuota(store, identity, config)).allowed, true)
})

test('loadGuestQuotaConfig keeps the 2-message guest cap and reads the IP cap', () => {
  assert.equal(loadGuestQuotaConfig({}).perGuestLimit, 2)
  assert.equal(loadGuestQuotaConfig({}).perIpLimit, 20)
  assert.equal(loadGuestQuotaConfig({ GUEST_IP_DAILY_LIMIT: '50' }).perIpLimit, 50)
  assert.equal(loadGuestQuotaConfig({ GUEST_IP_DAILY_LIMIT: 'nope' }).perIpLimit, 20)
})

test('getClientIp trusts only the platform-set header', () => {
  const spoofed = new Headers({
    'x-forwarded-for': '6.6.6.6, 203.0.113.1',
    'cf-connecting-ip': '7.7.7.7',
    'x-real-ip': '198.51.100.2',
  })
  assert.equal(getClientIp(spoofed, 'cloudflare'), '7.7.7.7')
  // On Vercel a client-sent CF-Connecting-IP must be ignored.
  assert.equal(getClientIp(spoofed, 'vercel'), '198.51.100.2')
  // Elsewhere the nearest proxy's (rightmost) hop wins over the client-controlled leftmost.
  assert.equal(getClientIp(spoofed, 'other'), '203.0.113.1')
  assert.equal(getClientIp(new Headers({ 'cf-connecting-ip': 'not an ip' }), 'cloudflare'), null)
  assert.equal(getClientIp(new Headers(), 'vercel'), null)
})

test('guest cookie round-trips and rejects tampering', async () => {
  const secret = 'test-secret'
  const id = createGuestId()
  const cookie = await signGuestId(id, secret)
  assert.equal(await verifyGuestCookie(cookie, secret), id)
  assert.equal(await verifyGuestCookie(cookie, 'other-secret'), null)
  const [, signature] = cookie.split('.')
  assert.equal(await verifyGuestCookie(`${createGuestId()}.${signature}`, secret), null)
  assert.equal(await verifyGuestCookie(`${id}.`, secret), null)
  assert.equal(await verifyGuestCookie(`${id}`, secret), null)
  assert.equal(await verifyGuestCookie(`${cookie}.extra`, secret), null)
  assert.equal(await verifyGuestCookie(undefined, secret), null)
})
