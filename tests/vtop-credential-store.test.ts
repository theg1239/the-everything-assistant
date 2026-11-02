import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import CryptoJS from 'crypto-js'
import {
  base64ToBytes,
  bytesToBase64,
  createVTOPKeyring,
  decryptVTOPPassword,
  encryptVTOPPassword,
  loadVTOPKeyringFromEnv,
  VTOPCredentialDecryptError,
  VTOPCredentialsConfigError,
  type VTOPKeyring,
} from '../lib/vtop-credential-crypto'
import {
  createVTOPCredentialStore,
  isPlausibleLegacyImport,
  VTOPCredentialValidationError,
  type VTOPCredentialRepository,
  type VTOPCredentialRow,
} from '../lib/vtop-credential-store'
import { decryptLegacyVTOPCookies, encodeLegacyProxyPassword } from '../lib/vtop-legacy-credentials'

const KEY_A = bytesToBase64(new Uint8Array(32).fill(0xa1))
const KEY_B = bytesToBase64(new Uint8Array(32).fill(0xb2))
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 2)
const PASSWORD = 's3cret Pässword!'

/** In-memory stand-in for the Prisma repository; counts writes. */
function memoryRepository() {
  const rows = new Map<string, VTOPCredentialRow>()
  const writes = { upsert: 0, insert: 0, replace: 0 }
  const repository: VTOPCredentialRepository = {
    find: async userId => {
      const row = rows.get(userId)
      return row ? { ...row } : null
    },
    upsert: async row => {
      writes.upsert++
      rows.set(row.userId, { ...row })
    },
    insertIfAbsent: async row => {
      writes.insert++
      if (rows.has(row.userId)) return false
      rows.set(row.userId, { ...row })
      return true
    },
    replaceIfUnchanged: async (expected, row) => {
      writes.replace++
      if (rows.get(row.userId)?.ciphertext !== expected) return false
      rows.set(row.userId, { ...row })
      return true
    },
    delete: async userId => {
      rows.delete(userId)
    },
  }
  return { rows, writes, repository }
}

const silentLogger = { warn: () => undefined, error: () => undefined }

function storeWith(keyring: VTOPKeyring, repository: VTOPCredentialRepository, now = NOW) {
  return createVTOPCredentialStore({
    repository,
    keyring: async () => keyring,
    now: () => now,
    logger: silentLogger,
  })
}

/** Builds the legacy cookie pair exactly like the old client (lib/vtop-credentials.ts). */
function legacyCookies(username: string, password: string, timestamp: number) {
  const masterKey = CryptoJS.lib.WordArray.random(256 / 8).toString()
  const encryptedPassword = CryptoJS.AES.encrypt(password, masterKey).toString()
  return {
    credentialsCookie: encodeURIComponent(
      JSON.stringify({ username, encryptedPassword, timestamp })
    ),
    masterKeyCookie: encodeURIComponent(masterKey),
  }
}

test('encrypt/decrypt round trip with AES-256-GCM', async () => {
  const keyring = await createVTOPKeyring({ current: KEY_A })
  const record = { userId: 'user-1', username: '21BCE0001' }
  const encrypted = await encryptVTOPPassword(keyring, { ...record, password: PASSWORD })

  assert.equal(base64ToBytes(encrypted.iv).length, 12)
  // UTF-8 plaintext + 16-byte GCM tag; never the plaintext itself.
  assert.equal(
    base64ToBytes(encrypted.ciphertext).length,
    new TextEncoder().encode(PASSWORD).length + 16
  )
  assert.ok(!encrypted.ciphertext.includes(PASSWORD))
  assert.equal(encrypted.keyVersion, keyring.current.version)
  assert.equal(await decryptVTOPPassword(keyring, { ...record, ...encrypted }), PASSWORD)

  const again = await encryptVTOPPassword(keyring, { ...record, password: PASSWORD })
  assert.notEqual(again.iv, encrypted.iv, 'fresh IV per encryption')
})

test('store save/get/status/remove round trip, password never in status', async () => {
  const keyring = await createVTOPKeyring({ current: KEY_A })
  const { repository, rows } = memoryRepository()
  const store = storeWith(keyring, repository)

  assert.deepEqual(await store.status('u1'), { linked: false })
  assert.equal(await store.get('u1'), null)

  assert.deepEqual(await store.save('u1', { username: ' 21BCE0001 ', password: PASSWORD }), {
    username: '21BCE0001',
  })
  assert.deepEqual(await store.status('u1'), { linked: true, username: '21BCE0001' })
  assert.deepEqual(await store.get('u1'), { username: '21BCE0001', password: PASSWORD })
  assert.ok(!JSON.stringify([...rows.values()]).includes(PASSWORD))

  await store.remove('u1')
  assert.deepEqual(await store.status('u1'), { linked: false })
})

test('save validates the registration number and password bounds', async () => {
  const keyring = await createVTOPKeyring({ current: KEY_A })
  const store = storeWith(keyring, memoryRepository().repository)
  const bad = [
    { username: 'not-a-regno', password: 'x' },
    { username: '21BCE0001:evil', password: 'x' },
    { username: '21BCE0001', password: '' },
    { username: '21BCE0001', password: '   ' },
    { username: '21BCE0001', password: 'x'.repeat(129) },
    { username: '21BCE0001' },
    null,
  ]
  for (const input of bad) {
    await assert.rejects(store.save('u1', input), VTOPCredentialValidationError)
  }
  // Leading/trailing spaces in the password are preserved, not trimmed.
  await store.save('u1', { username: '21bce10001', password: ' pw ' })
  assert.deepEqual(await store.get('u1'), { username: '21bce10001', password: ' pw ' })
})

test('AAD binds ciphertext to the user and username', async () => {
  const keyring = await createVTOPKeyring({ current: KEY_A })
  const { repository, rows } = memoryRepository()
  const store = storeWith(keyring, repository)
  await store.save('victim', { username: '21BCE0001', password: PASSWORD })
  const victimRow = rows.get('victim')
  assert.ok(victimRow)

  // Row copied onto another account.
  rows.set('attacker', { ...victimRow, userId: 'attacker' })
  assert.equal(await store.get('attacker'), null)
  await assert.rejects(
    decryptVTOPPassword(keyring, { ...victimRow, userId: 'attacker' }),
    VTOPCredentialDecryptError
  )
  // Relabelled username on the same account.
  await assert.rejects(
    decryptVTOPPassword(keyring, { ...victimRow, username: '21BCE0002' }),
    VTOPCredentialDecryptError
  )
  // The original still decrypts.
  assert.deepEqual(await store.get('victim'), { username: '21BCE0001', password: PASSWORD })
})

test('tampered ciphertext or IV fails authentication', async () => {
  const keyring = await createVTOPKeyring({ current: KEY_A })
  const record = { userId: 'u1', username: '21BCE0001' }
  const encrypted = await encryptVTOPPassword(keyring, { ...record, password: PASSWORD })

  const flip = (b64: string, index: number) => {
    const bytes = base64ToBytes(b64)
    bytes[index] = (bytes[index] ?? 0) ^ 0x01
    return bytesToBase64(bytes)
  }
  await assert.rejects(
    decryptVTOPPassword(keyring, {
      ...record,
      ...encrypted,
      ciphertext: flip(encrypted.ciphertext, 0),
    }),
    VTOPCredentialDecryptError
  )
  await assert.rejects(
    decryptVTOPPassword(keyring, { ...record, ...encrypted, iv: flip(encrypted.iv, 3) }),
    VTOPCredentialDecryptError
  )
  await assert.rejects(
    decryptVTOPPassword(keyring, { ...record, ...encrypted, ciphertext: 'not base64!' }),
    VTOPCredentialDecryptError
  )
})

test('key rotation: previous key decrypts old rows, which are re-encrypted with the current key', async () => {
  const oldRing = await createVTOPKeyring({ current: KEY_A })
  const rotatedRing = await createVTOPKeyring({ current: KEY_B, previous: KEY_A })
  const newOnlyRing = await createVTOPKeyring({ current: KEY_B })
  assert.notEqual(oldRing.current.version, rotatedRing.current.version)
  assert.equal(rotatedRing.previous?.version, oldRing.current.version)

  const { repository, rows } = memoryRepository()
  await storeWith(oldRing, repository).save('u1', { username: '21BCE0001', password: PASSWORD })
  assert.equal(rows.get('u1')?.keyVersion, oldRing.current.version)

  // Without the previous key the old row cannot be read (and is kept, not deleted).
  assert.equal(await storeWith(newOnlyRing, repository).get('u1'), null)
  assert.ok(rows.has('u1'))

  // With the previous key configured it decrypts and is lazily re-encrypted.
  const rotated = storeWith(rotatedRing, repository)
  assert.deepEqual(await rotated.get('u1'), { username: '21BCE0001', password: PASSWORD })
  assert.equal(rows.get('u1')?.keyVersion, rotatedRing.current.version)
  assert.deepEqual(await storeWith(newOnlyRing, repository).get('u1'), {
    username: '21BCE0001',
    password: PASSWORD,
  })

  // Saving always uses the current key.
  const { repository: repo2, rows: rows2 } = memoryRepository()
  await storeWith(rotatedRing, repo2).save('u2', { username: '22BAI0042', password: 'pw' })
  assert.equal(rows2.get('u2')?.keyVersion, rotatedRing.current.version)
})

test('re-encryption after rotation does not overwrite a concurrently saved row', async () => {
  const oldRing = await createVTOPKeyring({ current: KEY_A })
  const rotatedRing = await createVTOPKeyring({ current: KEY_B, previous: KEY_A })
  const { repository, rows } = memoryRepository()
  await storeWith(oldRing, repository).save('u1', { username: '21BCE0001', password: 'old' })

  const racing: VTOPCredentialRepository = {
    ...repository,
    find: async userId => {
      const row = await repository.find(userId)
      // A new password lands between the read and the re-encryption.
      await storeWith(rotatedRing, repository).save('u1', {
        username: '21BCE0001',
        password: 'new',
      })
      return row
    },
  }
  assert.equal((await storeWith(rotatedRing, racing).get('u1'))?.password, 'old')
  assert.equal((await storeWith(rotatedRing, repository).get('u1'))?.password, 'new')
  assert.ok(rows.get('u1'))
})

test('env keyring: fails closed in production, rejects bad keys, warns on dev fallback', async () => {
  await assert.rejects(
    loadVTOPKeyringFromEnv({ NODE_ENV: 'production' }),
    VTOPCredentialsConfigError
  )
  await assert.rejects(
    loadVTOPKeyringFromEnv({
      NODE_ENV: 'production',
      VTOP_CREDENTIALS_KEY: bytesToBase64(new Uint8Array(16)),
    }),
    VTOPCredentialsConfigError
  )
  await assert.rejects(
    loadVTOPKeyringFromEnv({ NODE_ENV: 'production', VTOP_CREDENTIALS_KEY: 'not base64 at all' }),
    VTOPCredentialsConfigError
  )
  await assert.rejects(
    loadVTOPKeyringFromEnv({
      NODE_ENV: 'production',
      VTOP_CREDENTIALS_KEY: KEY_A,
      VTOP_CREDENTIALS_KEY_PREVIOUS: 'short',
    }),
    VTOPCredentialsConfigError
  )
  const prod = await loadVTOPKeyringFromEnv({ NODE_ENV: 'production', VTOP_CREDENTIALS_KEY: KEY_A })
  assert.equal(prod.current.version, (await createVTOPKeyring({ current: KEY_A })).current.version)

  const warn = mock.method(console, 'warn', () => undefined)
  try {
    const dev1 = await loadVTOPKeyringFromEnv({ NODE_ENV: 'development', NEXTAUTH_SECRET: 's' })
    const dev2 = await loadVTOPKeyringFromEnv({ NODE_ENV: 'development', NEXTAUTH_SECRET: 's' })
    assert.equal(dev1.current.version, dev2.current.version, 'dev key is stable across restarts')
    assert.ok(warn.mock.callCount() >= 1)
    assert.match(String(warn.mock.calls[0]?.arguments[0]), /INSECURE/)
  } finally {
    warn.mock.restore()
  }
})

test('legacy cookie decrypt: static fixture made by the old client with crypto-js', () => {
  // Produced by the pre-server-storage client: masterKey = hex(32 random bytes),
  // encryptedPassword = CryptoJS.AES.encrypt(password, masterKey), both encodeURIComponent'ed.
  const masterKeyCookie = 'df87be76611ec9ca059e0630ef3507fa95c6229c34684499cfb44eb8f742dc90'
  const credentialsCookie =
    '%7B%22username%22%3A%2221BCE0001%22%2C%22encryptedPassword%22%3A%22U2FsdGVkX1%2BHeV96ejqsrTf0j5osonpxHjf8Lk8AhFAAAWv23ApJYCL8U3xvU99h%22%2C%22timestamp%22%3A1767225600000%7D'

  assert.deepEqual(decryptLegacyVTOPCookies(credentialsCookie, masterKeyCookie), {
    username: '21BCE0001',
    password: PASSWORD,
    savedAt: 1767225600000,
  })
  // Already URL-decoded by the framework.
  assert.equal(
    decryptLegacyVTOPCookies(decodeURIComponent(credentialsCookie), masterKeyCookie)?.password,
    PASSWORD
  )
  // Wrong key, missing halves, garbage.
  assert.equal(decryptLegacyVTOPCookies(credentialsCookie, 'a'.repeat(64)), null)
  assert.equal(decryptLegacyVTOPCookies(credentialsCookie, undefined), null)
  assert.equal(decryptLegacyVTOPCookies(undefined, masterKeyCookie), null)
  assert.equal(decryptLegacyVTOPCookies('%7Bnot json', masterKeyCookie), null)
  assert.equal(
    decryptLegacyVTOPCookies(encodeURIComponent('{"username":1}'), masterKeyCookie),
    null
  )
})

test('legacy proxy encoding round-trips through crypto-js like the proxy decrypts it', () => {
  const encoded = encodeLegacyProxyPassword('pa:::ss')
  const [cipher, key] = encoded.split(':::')
  assert.ok(cipher && key)
  assert.equal(CryptoJS.AES.decrypt(cipher, key).toString(CryptoJS.enc.Utf8), 'pa:::ss')
})

test('legacy import: imports into an account without credentials', async () => {
  const keyring = await createVTOPKeyring({ current: KEY_A })
  const { repository, rows } = memoryRepository()
  const store = storeWith(keyring, repository)
  const cookies = legacyCookies('21BCE0001', PASSWORD, NOW - 10 * DAY)

  const result = await store.importLegacy('u1', cookies, { createdAt: new Date(NOW - 100 * DAY) })
  assert.deepEqual(result, { status: 'imported', username: '21BCE0001' })
  assert.equal(rows.get('u1')?.keyVersion, keyring.current.version)
  assert.deepEqual(await store.get('u1'), { username: '21BCE0001', password: PASSWORD })
})

test('legacy import: never imports into an account that already has credentials', async () => {
  const keyring = await createVTOPKeyring({ current: KEY_A })
  const { repository, rows, writes } = memoryRepository()
  const store = storeWith(keyring, repository)
  await store.save('u1', { username: '22BAI0042', password: 'mine' })
  const before = rows.get('u1')

  const cookies = legacyCookies('21BCE0001', 'someone-elses', NOW - DAY)
  const result = await store.importLegacy('u1', cookies, { createdAt: new Date(NOW - 100 * DAY) })
  assert.deepEqual(result, { status: 'skipped', reason: 'existing' })
  assert.deepEqual(rows.get('u1'), before)
  assert.equal(writes.insert, 0)
  assert.deepEqual(await store.get('u1'), { username: '22BAI0042', password: 'mine' })
})

test('legacy import: a concurrent link wins over the import (atomic insert)', async () => {
  const keyring = await createVTOPKeyring({ current: KEY_A })
  const { repository, rows } = memoryRepository()
  const racing: VTOPCredentialRepository = {
    ...repository,
    insertIfAbsent: async row => {
      await storeWith(keyring, repository).save('u1', { username: '22BAI0042', password: 'mine' })
      return repository.insertIfAbsent(row)
    },
  }
  const cookies = legacyCookies('21BCE0001', 'theirs', NOW - DAY)
  const result = await storeWith(keyring, racing).importLegacy('u1', cookies, {
    createdAt: new Date(NOW - 100 * DAY),
  })
  assert.deepEqual(result, { status: 'skipped', reason: 'existing' })
  assert.equal(rows.get('u1')?.username, '22BAI0042')
})

test('legacy import: skips cookies that cannot be this account’s or are invalid', async () => {
  const keyring = await createVTOPKeyring({ current: KEY_A })
  const createdAt = new Date(NOW - 30 * DAY)
  const cases: Array<
    [string, { credentialsCookie: string | undefined; masterKeyCookie: string | undefined }, string]
  > = [
    // Saved before this account existed (another user on a shared PC).
    ['predates account', legacyCookies('21BCE0001', 'pw', NOW - 31 * DAY), 'implausible'],
    // Older than the cookie's 90-day lifetime / in the future: forged or corrupt.
    ['too old', legacyCookies('21BCE0001', 'pw', NOW - 91 * DAY), 'implausible'],
    ['future', legacyCookies('21BCE0001', 'pw', NOW + DAY), 'implausible'],
    ['bad username', legacyCookies('admin', 'pw', NOW - DAY), 'invalid'],
    [
      'wrong key',
      { ...legacyCookies('21BCE0001', 'pw', NOW - DAY), masterKeyCookie: 'f'.repeat(64) },
      'undecryptable',
    ],
    ['absent', { credentialsCookie: undefined, masterKeyCookie: undefined }, 'absent'],
  ]
  for (const [label, cookies, reason] of cases) {
    const { repository, rows } = memoryRepository()
    const result = await storeWith(keyring, repository).importLegacy('u1', cookies, { createdAt })
    assert.deepEqual(result, { status: 'skipped', reason }, label)
    assert.equal(rows.size, 0, label)
  }
})

test('isPlausibleLegacyImport boundaries', () => {
  const userCreatedAt = new Date(NOW - 10 * DAY)
  assert.equal(isPlausibleLegacyImport({ savedAt: NOW - DAY, userCreatedAt, now: NOW }), true)
  assert.equal(
    isPlausibleLegacyImport({ savedAt: userCreatedAt.getTime(), userCreatedAt, now: NOW }),
    true
  )
  assert.equal(
    isPlausibleLegacyImport({ savedAt: userCreatedAt.getTime() - DAY, userCreatedAt, now: NOW }),
    false
  )
  assert.equal(isPlausibleLegacyImport({ savedAt: Number.NaN, userCreatedAt, now: NOW }), false)
})
